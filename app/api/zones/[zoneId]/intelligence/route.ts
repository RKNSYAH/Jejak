import { getZoneRow, toZoneDetails, validateZoneQuery } from "@/app/engine/controller/zoneController";
import { getZoneBoundary } from "@/app/engine/lib/zoneBoundary";
import { mapAccessDenied } from "@/app/engine/lib/mapAuth";

export async function GET(req: Request, context: { params: Promise<{ zoneId: string }> }) {
    const denied = await mapAccessDenied();
    if (denied) return denied;
    const { zoneId } = await context.params;
    try {
        const params = new URL(req.url).searchParams;
        validateZoneQuery(params);
        const withGeometry = params.get("include_geometry") === "1";
        const row = await getZoneRow(zoneId, withGeometry);
        if (!row) return Response.json({ error: "Unknown region" }, { status: 404 });
        if (!withGeometry) return Response.json(toZoneDetails(row));

        const boundary = await getZoneBoundary(row).then(
            (geometry) => ({ geometry, geometry_error: null }),
            (error) => ({ geometry: null, geometry_error: error instanceof Error ? error.message : "Batas kecamatan belum dapat dimuat." }));
        return Response.json({ details: toZoneDetails(row), ...boundary });
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("Unsupported")) {
            return Response.json({ error: error.message }, { status: 400 });
        }
        return Response.json({ error: "Data kecamatan belum dapat dimuat." }, { status: 503 });
    }
}
