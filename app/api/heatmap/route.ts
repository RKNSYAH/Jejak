import { getMapCells, validateCellQuery } from "@/app/engine/controller/zoneController";

export async function GET(req: Request) {
    let query: ReturnType<typeof validateCellQuery>;
    try {
        query = validateCellQuery(new URL(req.url).searchParams);
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid query" }, { status: 400 });
    }
    try {
        return Response.json(await getMapCells(query.zoneId, query.category));
    } catch {
        return Response.json({ error: "Unable to load heatmap cells" }, { status: 503 });
    }
}
