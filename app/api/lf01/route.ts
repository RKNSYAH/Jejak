import { validateLF01Input } from "@/app/engine/lib/lf01Validation";

export async function POST(req: Request) {
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }
    try {
        validateLF01Input(await req.json());
    } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Invalid JSON" }, { status: 400 });
    }
    return Response.json(
        { error: "Evidence enrichment is not available yet", code: "ENRICHMENT_UNAVAILABLE" },
        { status: 503 },
    );
}
