import { getZoneSnapshot, supportedZones, validateZoneQuery } from "@/app/engine/controller/zoneController";

export async function GET(req: Request, context: { params: Promise<{ zoneId: string }> }) {
    const { zoneId } = await context.params;
    if (!supportedZones.some((zone) => zone.zone_id === zoneId)) {
        return Response.json({ error: "Unknown zone" }, { status: 404 });
    }
    try {
        const { sectorId } = validateZoneQuery(new URL(req.url).searchParams);
        return Response.json({ is_sample: true, intelligence: getZoneSnapshot(zoneId, sectorId) });
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid query" }, { status: 400 });
    }
}
