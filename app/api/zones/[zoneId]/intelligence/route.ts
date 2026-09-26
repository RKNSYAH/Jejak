import { getZoneRow, toZoneDetails, validateZoneQuery } from "@/app/engine/controller/zoneController";
import { getZoneBoundary } from "@/app/engine/lib/zoneBoundary";

export async function GET(req: Request, context: { params: Promise<{ zoneId: string }> }) {
    const { zoneId } = await context.params;
    try {
        const params = new URL(req.url).searchParams;
        validateZoneQuery(params);
        const row = await getZoneRow(zoneId);
        if (!row) return Response.json({ error: "Unknown region" }, { status: 404 });
        const details = toZoneDetails(row);
        if (params.get("include_geometry") !== "1") return Response.json(details);

        try {
            return Response.json({ details, geometry: await getZoneBoundary(row), geometry_error: null });
        } catch (error) {
            return Response.json({ details, geometry: null, geometry_error: error instanceof Error ? error.message : "Unable to load region boundary" });
        }
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("Unsupported")) {
            return Response.json({ error: error.message }, { status: 400 });
        }
        return Response.json({ error: "Unable to load region data" }, { status: 503 });
    }
}
