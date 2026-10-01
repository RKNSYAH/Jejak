import { getMapCells, validateCellQuery } from "@/app/engine/controller/zoneController";
import { mapAccessDenied } from "@/app/engine/lib/mapAuth";

export async function GET(req: Request) {
    const denied = await mapAccessDenied();
    if (denied) return denied;
    const params = new URL(req.url).searchParams;
    let query;
    try {
        query = validateCellQuery(params);
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid query" }, { status: 400 });
    }
    try {
        return Response.json(await getMapCells(query.zoneId, query.category, params.get("geometry") !== "0"));
    } catch {
        return Response.json({ error: "Heatmap belum dapat dimuat." }, { status: 503 });
    }
}
