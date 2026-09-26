import { getZoneRow } from "@/app/engine/controller/zoneController";
import { getZoneBoundary } from "@/app/engine/lib/zoneBoundary";

export async function GET(req: Request) {
    const zoneId = new URL(req.url).searchParams.get("zone_id");
    if (!zoneId) return Response.json({ error: "Missing zone_id" }, { status: 400 });
    let row;
    try {
        row = await getZoneRow(zoneId);
    } catch {
        return Response.json({ error: "Unable to load region boundary" }, { status: 503 });
    }
    if (!row) return Response.json({ error: "Unsupported zone_id" }, { status: 404 });

    try {
        return Response.json(await getZoneBoundary(row));
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Unable to load region boundary" }, { status: 502 });
    }
}
