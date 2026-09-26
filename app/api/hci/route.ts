import { parseClickBatch, recordClicks } from "@/app/engine/controller/hciController";

export async function POST(req: Request) {
    let batch;
    try {
        batch = parseClickBatch(await req.json());
    } catch {
        return Response.json({ error: "Invalid click batch" }, { status: 400 });
    }
    try {
        await recordClicks(batch);
    } catch {
        return Response.json({ error: "Unable to record clicks" }, { status: 503 });
    }
    return new Response(null, { status: 204 });
}
