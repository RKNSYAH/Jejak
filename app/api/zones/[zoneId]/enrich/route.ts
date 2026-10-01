import { after } from "next/server";
import { EnrichmentRequestError, isEnrichmentConfigured, requestZoneEnrichment, runZoneEnrichment } from "@/app/engine/controller/enrichmentController";
import { mapAccessDenied } from "@/app/engine/lib/mapAuth";
import { isEnrichmentScope } from "@/app/engine/enrichment/scopes";
import { readJsonBody } from "@/app/engine/lib/http";
import { isRecord, isRegionCode } from "@/app/engine/lib/zoneGeometry";

// The pipeline runs in after(); it shares this route's execution limit.
export const maxDuration = 300;

export async function POST(req: Request, context: { params: Promise<{ zoneId: string }> }) {
    const { zoneId } = await context.params;
    const body = await readJsonBody(req);
    if (body instanceof Response) return body;
    if (!isRegionCode(zoneId)) {
        return Response.json({ error: "Unsupported zone_id" }, { status: 400 });
    }
    if (!isRecord(body) || Object.keys(body).some((key) => key !== "scope") || !isEnrichmentScope(body.scope)) {
        return Response.json({ error: "scope must be career or housing" }, { status: 400 });
    }
    const { scope } = body;

    // Enrichment spends search, crawl, and model credits.
    const denied = await mapAccessDenied();
    if (denied) return denied;
    // Checked before claiming so a misconfigured server never leaves runs queued.
    if (!isEnrichmentConfigured()) {
        return Response.json({ error: "Evidence enrichment is not available yet", code: "ENRICHMENT_UNAVAILABLE" }, { status: 503 });
    }

    let result;
    try {
        result = await requestZoneEnrichment(zoneId, scope);
    } catch (error) {
        if (error instanceof EnrichmentRequestError) {
            return Response.json({ error: error.message, code: error.code }, { status: error.code === "UNKNOWN_ZONE" ? 404 : 422 });
        }
        return Response.json({ error: "Unable to start evidence enrichment" }, { status: 503 });
    }

    const { job } = result;
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
