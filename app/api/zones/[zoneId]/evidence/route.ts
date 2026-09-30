import { getZoneEvidence } from "@/app/engine/controller/enrichmentController";
import { isEnrichmentScope } from "@/app/engine/enrichment/scopes";
import { isAdminConfigured } from "@/app/engine/lib/admin";
import { mapAccessDenied } from "@/app/engine/lib/mapAuth";

export async function GET(req: Request, context: { params: Promise<{ zoneId: string }> }) {
    const denied = await mapAccessDenied();
    if (denied) return denied;
    const { zoneId } = await context.params;
    const scope = new URL(req.url).searchParams.get("scope");
    if (zoneId.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(zoneId)) {
        return Response.json({ error: "Unsupported zone_id" }, { status: 400 });
    }
    if (!isEnrichmentScope(scope)) return Response.json({ error: "scope must be career or housing" }, { status: 400 });
    if (!isAdminConfigured()) {
        return Response.json({ error: "Evidence is not available yet", code: "ENRICHMENT_UNAVAILABLE" }, { status: 503 });
    }

    try {
        const evidence = await getZoneEvidence(zoneId, scope);
        if (!evidence) return Response.json({ error: "Unknown region" }, { status: 404 });
        // Polled while a refresh runs, so never serve a cached copy.
        return Response.json(evidence, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "Unable to load evidence" }, { status: 503 });
    }
}
