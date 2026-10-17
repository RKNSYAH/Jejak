import { hciClientHash, MAX_HCI_BODY_BYTES, parseClickBatch, recordClicks } from "@/app/engine/controller/hciController";
import { readJsonBody } from "@/app/engine/lib/http";

export async function POST(req: Request) {
    const body = await readJsonBody(req, MAX_HCI_BODY_BYTES);
    if (body instanceof Response) return body;
    let batch;
    try {
        batch = parseClickBatch(body);
    } catch {
        return Response.json({ error: "Invalid click batch" }, { status: 400 });
    }
    const clientHash = hciClientHash(req);
    if (!clientHash) return Response.json({ error: "Telemetry is unavailable" }, { status: 503 });
    try {
        const retryAfter = await recordClicks(batch, clientHash);
        if (retryAfter > 0) return Response.json({ error: "Telemetry limit reached" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
    } catch {
        return Response.json({ error: "Unable to record clicks" }, { status: 503 });
    }
    return new Response(null, { status: 204 });
}
