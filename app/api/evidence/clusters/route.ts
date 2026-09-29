import { getEvidenceClusters } from "@/app/engine/controller/enrichmentController";
import { isEnrichmentScope } from "@/app/engine/enrichment/scopes";
import { isAdminConfigured } from "@/app/engine/lib/admin";

export async function GET(req: Request) {
    const params = new URL(req.url).searchParams;
    const cityId = params.get("city_id") ?? "";
    const scope = params.get("scope");
    if (cityId.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cityId)) {
        return Response.json({ error: "Unsupported city_id" }, { status: 400 });
    }
    if (!isEnrichmentScope(scope)) return Response.json({ error: "scope must be career or housing" }, { status: 400 });
    if (!isAdminConfigured()) {
        return Response.json({ error: "Evidence is not available yet", code: "ENRICHMENT_UNAVAILABLE" }, { status: 503 });
    }

    try {
        return Response.json(await getEvidenceClusters(cityId, scope), { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "Unable to load evidence clusters" }, { status: 503 });
    }
}
