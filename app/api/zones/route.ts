import { getZones, validateZoneQuery } from "@/app/engine/controller/zoneController";

export async function GET(req: Request) {
    try {
        const { cityId, sectorId } = validateZoneQuery(new URL(req.url).searchParams);
        return Response.json(getZones(cityId, sectorId));
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid query" }, { status: 400 });
    }
}
