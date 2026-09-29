import { LANGFLOW_FLOWS, runFlow } from "../lib/langflow";
import { parseLF04Output, type LF04Explanation, type LF04Request } from "../lib/lf04Validation";
import type { PersistedRelocationProfile } from "../lib/relocationProfile";

// Explains one accepted zone snapshot against the user's saved, confirmed profile.
// Only a stored confirmed profile reaches LF-04, so the server sets `confirmed`.
// Throws LangflowError or INVALID_LF04_OUTPUT.
export async function explainZoneFit(profile: PersistedRelocationProfile, request: LF04Request): Promise<LF04Explanation> {
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
    const result = await runFlow(LANGFLOW_FLOWS.lf04, input, { timeoutMs: 120_000, contract: "lf04-v2", sessionId: runId });
    return parseLF04Output(result, request);
}
