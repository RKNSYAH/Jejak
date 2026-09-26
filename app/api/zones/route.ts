import { getZones, validateZoneQuery } from "@/app/engine/controller/zoneController";

export async function GET(req: Request) {
    try {
        const { cityId } = validateZoneQuery(new URL(req.url).searchParams);
        return Response.json(await getZones(cityId));
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("Unsupported")) {
            return Response.json({ error: error.message }, { status: 400 });
        }
        return Response.json({ error: "Unable to load regions" }, { status: 503 });
    }
}
