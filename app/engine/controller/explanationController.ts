import { LANGFLOW_FLOWS, runFlow } from "../lib/langflow";
import { LANGFLOW_CONTRACTS } from "../lib/langflowContracts";
import { parseZoneFitExplanationOutput, type ZoneFitExplanation, type ZoneFitExplanationRequest } from "../lib/zoneFitExplanationValidation";
import type { PersistedRelocationProfile } from "../lib/relocationProfile";

// Only a server-loaded confirmed profile may reach zone fit explanation.
export async function explainZoneFit(profile: PersistedRelocationProfile, request: ZoneFitExplanationRequest): Promise<ZoneFitExplanation> {
    const runId = crypto.randomUUID();
    const input = {
        run_id: runId,
        language: request.language ?? "id",
        confirmed_profile: {
            confirmed: true,
            hard_constraints: profile.hard_constraints,
            soft_preferences: profile.soft_preferences,
            priority_weights: profile.priority_weights,
        },
        fit_components: request.fit_components,
        accepted_snapshot: request.accepted_snapshot,
        source_coverage: request.source_coverage,
        comparison_zone: request.comparison_zone ?? null,
    };
    const result = await runFlow(LANGFLOW_FLOWS.zoneFitExplanation, input, { timeoutMs: 120_000, contract: LANGFLOW_CONTRACTS.zoneFitExplanation, sessionId: runId });
    return parseZoneFitExplanationOutput(result, request);
}
