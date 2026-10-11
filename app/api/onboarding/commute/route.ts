import { readJsonBody } from "@/app/engine/lib/http";
import { mapAccessDenied } from "@/app/engine/lib/mapAuth";
import { parseCommuteRequest } from "@/app/engine/routing/validation";
import { getCommuteEstimates } from "@/app/engine/controller/commuteController";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
let inFlight = 0;

export async function POST(request: Request) {
    // Limit coordinate payload size before parsing. Body contents never enter logs.
    const body = await readJsonBody(request, 65_536);
    if (body instanceof Response) return body;
    const input = parseCommuteRequest(body);
    if (!input) return Response.json({ error: "Invalid commute request" }, { status: 400, headers });
    const denied = await mapAccessDenied();
    if (denied) return denied;
    if (inFlight >= 4) return Response.json({ error: "Estimasi sedang sibuk. Coba lagi." }, { status: 429, headers: { ...headers, "Retry-After": "5" } });
    inFlight++;
    try { return Response.json(await getCommuteEstimates(input, request.signal), { headers }); }
    finally { inFlight--; }
}
