import { buildLF05Input, onboardingTaxonomy } from "../extractUserProfile";
import { LANGFLOW_FLOWS, runFlow } from "../lib/langflow";
import { validateLF05Proposal, type LF05ProposedProfile } from "../lib/lf05Validation";
import { applyLF05ExplicitDetails, buildLF05FollowUpMessage, getLF05ClarificationQuestions, groundLF05Transport, resolveLF05FollowUpDetails, type LF05ClarificationAnswer, type LF05FollowUpDetails } from "../lib/lf05FollowUp";
import type { RelocationGoal } from "../lib/relocationGoal";
import { buildNativeProfileRefinementInput, reconcileProfileRefinement } from "../lib/profileRefinement";
import type { PersistedRelocationProfile } from "../lib/relocationProfile";

// Sends an already screened onboarding story to LF-05 and returns the validated,
// still unconfirmed profile proposal. Throws LangflowError or INVALID_LF05_PROFILE.
export async function interpretOnboardingStory(message: string, language: "id", answers: LF05ClarificationAnswer[] = [], goal?: RelocationGoal, details: LF05FollowUpDetails = {}): Promise<LF05ProposedProfile> {
    const sessionReference = crypto.randomUUID();
    const explicitDetails = resolveLF05FollowUpDetails(answers, details, message);
    const input = { ...buildLF05Input(buildLF05FollowUpMessage(message, answers, goal, explicitDetails), onboardingTaxonomy, sessionReference, language),
        ...(explicitDetails.transport_mode ? { answers: { transport_mode: explicitDetails.transport_mode } } : {}) };
    const result = await runFlow(LANGFLOW_FLOWS.lf05, input, { timeoutMs: 120_000, sessionId: sessionReference });
    const proposal = applyLF05ExplicitDetails(groundLF05Transport(validateLF05Proposal(result, onboardingTaxonomy), message, explicitDetails), goal, explicitDetails);
    return validateLF05Proposal({ ...proposal,
        clarification_questions: getLF05ClarificationQuestions(proposal, message, answers, goal, explicitDetails),
    }, onboardingTaxonomy);
}

export async function refineRelocationProfile(
    draft: PersistedRelocationProfile,
    confirmed: PersistedRelocationProfile,
    message: string | undefined,
    answers: LF05ClarificationAnswer[],
    language: "id",
): Promise<LF05ProposedProfile> {
    const sessionReference = crypto.randomUUID();
    const input = buildNativeProfileRefinementInput(confirmed, draft, message, answers, sessionReference, language);
    const result = await runFlow(LANGFLOW_FLOWS.lf05, input, { timeoutMs: 120_000, sessionId: sessionReference });
    return reconcileProfileRefinement(confirmed, draft, result, Boolean(message?.trim()), answers, message?.trim() ?? "");
}
