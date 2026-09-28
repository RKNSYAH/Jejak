import { getRunStatus } from "@/app/engine/controller/enrichmentController";
import { isAdminConfigured } from "@/app/engine/lib/admin";

export async function GET(_req: Request, context: { params: Promise<{ runId: string }> }) {
    const { runId } = await context.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
        return Response.json({ error: "Unsupported run_id" }, { status: 400 });
    }
    if (!isAdminConfigured()) {
        return Response.json({ error: "Evidence enrichment is not available yet", code: "ENRICHMENT_UNAVAILABLE" }, { status: 503 });
    }

    try {
        const run = await getRunStatus(runId.toLowerCase());
        if (!run) return Response.json({ error: "Unknown run" }, { status: 404 });
        return Response.json(run, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "Unable to load run status" }, { status: 503 });
    }
}
