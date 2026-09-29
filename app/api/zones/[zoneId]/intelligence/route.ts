import { withLocatedEvidence } from "@/app/engine/controller/enrichmentController";
import { getZoneRow, toZoneDetails, validateZoneQuery } from "@/app/engine/controller/zoneController";
import { getZoneBoundary } from "@/app/engine/lib/zoneBoundary";

export async function GET(req: Request, context: { params: Promise<{ zoneId: string }> }) {
    const { zoneId } = await context.params;
    try {
        const params = new URL(req.url).searchParams;
        validateZoneQuery(params);
        const withGeometry = params.get("include_geometry") === "1";
        const row = await getZoneRow(zoneId, withGeometry);
        if (!row) return Response.json({ error: "Unknown region" }, { status: 404 });
        // Runs alongside the boundary lookup; it falls back to the stored facts itself.
        const located = withLocatedEvidence(row);
        if (!withGeometry) return Response.json(toZoneDetails(await located));

        try {
            const geometry = await getZoneBoundary(row);
            return Response.json({ details: toZoneDetails(await located), geometry, geometry_error: null });
        } catch (error) {
            return Response.json({ details: toZoneDetails(await located), geometry: null, geometry_error: error instanceof Error ? error.message : "Unable to load region boundary" });
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("Unsupported")) {
            return Response.json({ error: error.message }, { status: 400 });
        }
        console.log(error)
        return Response.json({ error: "Unable to load region data" }, { status: 503 });
    }
}
