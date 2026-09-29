import { LANGFLOW_FLOWS, runFlow } from "../lib/langflow";
import { parseLF03Output, type LF03ConflictGroup, type LF03Recommendation } from "../lib/lf03Validation";

// Sends one validated conflict group to LF-03 and returns its validated recommendation.
// Nothing is written: the evidence policy still decides which claim to accept.
// Throws LangflowError or INVALID_LF03_OUTPUT.
export async function reviewEvidenceConflict(group: LF03ConflictGroup): Promise<LF03Recommendation> {
    const runId = crypto.randomUUID();
    const result = await runFlow(LANGFLOW_FLOWS.lf03, { run_id: runId, ...group }, {
        timeoutMs: 120_000,
        contract: "lf03-v2",
        sessionId: runId,
    });
    return parseLF03Output(result, group);
}
