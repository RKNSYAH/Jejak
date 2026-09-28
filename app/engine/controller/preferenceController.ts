import { buildLF05Input, onboardingTaxonomy } from "../extractUserProfile";
import { LANGFLOW_FLOWS, runFlow } from "../lib/langflow";
import { validateLF05Proposal, type LF05ProposedProfile } from "../lib/lf05Validation";

// Sends an already screened onboarding story to LF-05 and returns the validated,
// still unconfirmed profile proposal. Throws LangflowError or INVALID_LF05_PROFILE.
export async function interpretOnboardingStory(message: string, language: "id" | "en"): Promise<LF05ProposedProfile> {
    const sessionReference = crypto.randomUUID();
    const input = buildLF05Input(message, onboardingTaxonomy, sessionReference, language);
    const result = await runFlow(LANGFLOW_FLOWS.lf05, input, { timeoutMs: 120_000, sessionId: sessionReference });
    return validateLF05Proposal(result, onboardingTaxonomy);
}
