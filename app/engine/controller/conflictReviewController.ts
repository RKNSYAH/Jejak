import { LANGFLOW_FLOWS, runFlow } from "../lib/langflow";
import { LANGFLOW_CONTRACTS } from "../lib/langflowContracts";
import { parseEvidenceConflictReviewOutput, type EvidenceConflictGroup, type EvidenceConflictRecommendation } from "../lib/evidenceConflictReviewValidation";

// Conflict review recommends only; evidence policy still decides acceptance.
export async function reviewEvidenceConflict(group: EvidenceConflictGroup): Promise<EvidenceConflictRecommendation> {
    const runId = crypto.randomUUID();
    const result = await runFlow(LANGFLOW_FLOWS.evidenceConflictReview, { run_id: runId, ...group }, {
        timeoutMs: 120_000,
        contract: LANGFLOW_CONTRACTS.evidenceConflictReview,
        sessionId: runId,
    });
    return parseEvidenceConflictReviewOutput(result, group);
}
