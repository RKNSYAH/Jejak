import { buildRelocationProfileInterpretationInput, onboardingTaxonomy } from "../extractUserProfile";
import { LANGFLOW_FLOWS, runFlow } from "../lib/langflow";
import { validateRelocationProfileProposal, type RelocationProfileProposal } from "../lib/relocationProfileInterpretationValidation";
import { applyProfileExplicitDetails, buildProfileFollowUpMessage, getProfileClarificationQuestions, groundProfileTransport, resolveProfileFollowUpDetails, type ProfileClarificationAnswer, type ProfileFollowUpDetails } from "../lib/relocationProfileInterpretationFollowUp";
import type { RelocationGoal } from "../lib/relocationGoal";
import { buildNativeProfileRefinementInput, reconcileProfileRefinement } from "../lib/profileRefinement";
import type { PersistedRelocationProfile } from "../lib/relocationProfile";

// Requires screened input; returns a validated, unconfirmed relocation profile proposal.
export async function interpretOnboardingStory(message: string, language: "id", answers: ProfileClarificationAnswer[] = [], goal?: RelocationGoal, details: ProfileFollowUpDetails = {}): Promise<RelocationProfileProposal> {
    const sessionReference = crypto.randomUUID();
    const explicitDetails = resolveProfileFollowUpDetails(answers, details, message);
    const input = { ...buildRelocationProfileInterpretationInput(buildProfileFollowUpMessage(message, answers, goal, explicitDetails), onboardingTaxonomy, sessionReference, language),
        ...(explicitDetails.transport_mode ? { answers: { transport_mode: explicitDetails.transport_mode } } : {}) };
    const result = await runFlow(LANGFLOW_FLOWS.relocationProfileInterpretation, input, { timeoutMs: 120_000, sessionId: sessionReference });
    const proposal = applyProfileExplicitDetails(groundProfileTransport(validateRelocationProfileProposal(result, onboardingTaxonomy), message, explicitDetails), goal, explicitDetails);
    return validateRelocationProfileProposal({ ...proposal,
        clarification_questions: getProfileClarificationQuestions(proposal, message, answers, goal, explicitDetails),
    }, onboardingTaxonomy);
}

export async function refineRelocationProfile(
    draft: PersistedRelocationProfile,
    confirmed: PersistedRelocationProfile,
    message: string | undefined,
    answers: ProfileClarificationAnswer[],
    language: "id",
): Promise<RelocationProfileProposal> {
    const sessionReference = crypto.randomUUID();
    const input = buildNativeProfileRefinementInput(confirmed, draft, message, answers, sessionReference, language);
    const result = await runFlow(LANGFLOW_FLOWS.relocationProfileInterpretation, input, { timeoutMs: 120_000, sessionId: sessionReference });
    return reconcileProfileRefinement(confirmed, draft, result, Boolean(message?.trim()), answers, message?.trim() ?? "");
}
