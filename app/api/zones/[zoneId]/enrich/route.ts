import { after } from "next/server";
import { EnrichmentRequestError, isEnrichmentConfigured, requestZoneEnrichment, runZoneEnrichment } from "@/app/engine/controller/enrichmentController";
import { getAuthenticatedClaims } from "@/app/engine/controller/userServerController";
import { isEnrichmentScope } from "@/app/engine/enrichment/scopes";
import { isRecord } from "@/app/engine/lib/zoneGeometry";

// The pipeline runs in after(); it shares this route's execution limit.
export const maxDuration = 300;

export async function POST(req: Request, context: { params: Promise<{ zoneId: string }> }) {
    const { zoneId } = await context.params;
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }
    if (zoneId.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(zoneId)) {
        return Response.json({ error: "Unsupported zone_id" }, { status: 400 });
    }
    if (!isRecord(body) || Object.keys(body).some((key) => key !== "scope") || !isEnrichmentScope(body.scope)) {
        return Response.json({ error: "scope must be career or housing" }, { status: 400 });
    }
    const scope = body.scope;

    // Enrichment spends search, crawl, and model credits.
    const claims = await getAuthenticatedClaims().catch(() => null);
    if (!claims) return Response.json({ error: "Sign in to refresh evidence", code: "SIGN_IN_REQUIRED" }, { status: 401 });
    // Checked before claiming so a misconfigured server never leaves runs queued.
    if (!isEnrichmentConfigured()) {
        return Response.json({ error: "Evidence enrichment is not available yet", code: "ENRICHMENT_UNAVAILABLE" }, { status: 503 });
    }

    let result: Awaited<ReturnType<typeof requestZoneEnrichment>>;
    try {
        result = await requestZoneEnrichment(zoneId, scope);
    } catch (error) {
        if (error instanceof EnrichmentRequestError) {
            return Response.json({ error: error.message, code: error.code }, { status: error.code === "UNKNOWN_ZONE" ? 404 : 422 });
        }
        return Response.json({ error: "Unable to start evidence enrichment" }, { status: 503 });
    }

    const job = result.job;
    if (job) {
        after(async () => {
            const outcome = await runZoneEnrichment(job).catch(() => null);
            if (!outcome || outcome.errorCode) {
                console.error("Evidence enrichment failed", { zone: job.zone.code, scope: job.scope, code: outcome?.errorCode ?? "internal_error" });
            }
        });
    }
    return Response.json({
        zone_id: zoneId,
        scope,
        runs: result.claims,
        poll: `/api/zones/${zoneId}/evidence?scope=${scope}`,
    }, { status: job ? 202 : 200 });
}
