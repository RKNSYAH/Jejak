import { getMapCells, validateCellQuery } from "@/app/engine/controller/zoneController";

export async function GET(req: Request) {
    let query: ReturnType<typeof validateCellQuery>;
    try {
        query = validateCellQuery(new URL(req.url).searchParams);
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid query" }, { status: 400 });
    }
    try {
        const includeGeometry = new URL(req.url).searchParams.get("geometry") !== "0";
        return Response.json(await getMapCells(query.zoneId, query.category, includeGeometry));
    } catch {
        return Response.json({ error: "Unable to load heatmap cells" }, { status: 503 });
    }
}
