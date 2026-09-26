import { getZoneRow, toZoneDetails, validateZoneQuery } from "@/app/engine/controller/zoneController";

export async function GET(req: Request, context: { params: Promise<{ zoneId: string }> }) {
    const { zoneId } = await context.params;
    try {
        validateZoneQuery(new URL(req.url).searchParams);
        const row = await getZoneRow(zoneId);
        if (!row) return Response.json({ error: "Unknown region" }, { status: 404 });
        return Response.json(toZoneDetails(row));
    } catch (error) {
        if (error instanceof Error && error.message.startsWith("Unsupported")) {
            return Response.json({ error: error.message }, { status: 400 });
        }
        return Response.json({ error: "Unable to load region data" }, { status: 503 });
    }
}
