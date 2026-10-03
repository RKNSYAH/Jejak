import { onboardingTaxonomy } from "../extractUserProfile";
import { SENSITIVE_TEXT, validateLF05Proposal, type LF05ProposedProfile } from "./lf05Validation";
import { getRelocationGoal } from "./relocationGoal";
import { parseFormSession } from "../onboarding/preview";
import { getDestination } from "../onboarding/demoData";

export const RELOCATION_PROFILE_NAME = "primary";
export const RELOCATION_PROFILE_SCHEMA_VERSION = "relocation-profile-v1" as const;

export type PersistedRelocationProfile = {
    schema_version: typeof RELOCATION_PROFILE_SCHEMA_VERSION;
    hard_constraints: Record<string, unknown>;
    soft_preferences: Record<string, unknown>;
    priority_weights: Record<string, number>;
    taxonomy_version: string;
    contract_version: LF05ProposedProfile["contract_version"];
};

export type StoredRelocationProfile = {
    id: string;
    profile_name: string;
    revision: number;
    profile: PersistedRelocationProfile;
    confirmed_at: string;
    updated_at: string;
};

// Both paths share these slots; missing story values never inherit form defaults.
export function normalizeRelocationProfileInputs(
    hardConstraints: Record<string, unknown>,
    softPreferences: Record<string, unknown>,
    priorityWeights: Record<string, number>,
): PersistedRelocationProfile {
    if (hardConstraints.goal != null && softPreferences.goal != null && hardConstraints.goal !== softPreferences.goal) {
        throw new Error("INVALID_PROFILE_GOAL");
    }
    const goal = getRelocationGoal({ hard_constraints: hardConstraints, soft_preferences: softPreferences });
    if (!goal) throw new Error("PROFILE_GOAL_REQUIRED");
    const hard: Record<string, unknown> = {
        destination_cities: [], monthly_budget: null, housing_budget: null, commute_minutes: null, deal_breakers: [],
        ...hardConstraints, goal,
    };
    const soft: Record<string, unknown> = {
        target_fields: [], target_occupations: [], occupation: null, study_field: null, education_level: null,
        work_arrangement: null, language_preferences: [], housing_types: [], transport_mode: null,
        destination: null, career_stage: null, departure_time: null, extras: [], over_budget: "mark", ...softPreferences,
    };
    delete soft.goal;
    // LF-05 can put an explicit limit in either group. Keep one canonical location.
    for (const field of ["destination_cities", "monthly_budget", "housing_budget", "commute_minutes", "deal_breakers"] as const) {
        if (hardConstraints[field] == null && soft[field] != null) hard[field] = soft[field];
        delete soft[field];
    }
    return {
        schema_version: RELOCATION_PROFILE_SCHEMA_VERSION,
        hard_constraints: hard, soft_preferences: soft, priority_weights: { ...priorityWeights },
        taxonomy_version: onboardingTaxonomy.version, contract_version: "lf05-v2",
    };
}

export function buildFormRelocationProfile(value: unknown): PersistedRelocationProfile {
    const session = parseFormSession({ version: 1, status: "completed", step: 4, answers: value });
    if (!session || SENSITIVE_TEXT.test(JSON.stringify(value))) throw new Error("INVALID_FORM_PROFILE");
    const answers = session.answers;
    if (answers.sector && !onboardingTaxonomy.sectors.some((sector) => sector.id === answers.sector)) throw new Error("INVALID_FORM_PROFILE");
    const occupation = answers.goal === "study" ? null : answers.occupation.trim();
    const matchedOccupation = onboardingTaxonomy.occupations.find((item) => [item.label, ...item.aliases]
        .some((name) => name.toLowerCase() === occupation?.toLowerCase()));
    const destination = answers.destinationName && answers.destinationPoint
        ? {
            name: answers.destinationName,
            precision: "point", longitude: answers.destinationPoint[0], latitude: answers.destinationPoint[1],
        }
        : getDestination(answers.destinationId);
    const opportunity = answers.weights.opportunity / 100;
    return normalizeRelocationProfileInputs({
        goal: answers.goal,
        destination_cities: answers.city === "unsure" ? [] : [answers.city],
        monthly_budget: { amount: answers.monthlyBudget, currency: "IDR", period: "month" },
        housing_budget: { amount: answers.maximumRent, currency: "IDR", period: "month" },
        commute_minutes: answers.commuteMinutes,
    }, {
        occupation, target_occupations: matchedOccupation ? [matchedOccupation.id] : [],
        target_fields: answers.goal !== "study" && answers.sector ? [answers.sector] : [],
        study_field: answers.goal === "work" ? null : answers.studyField.trim(),
        education_level: answers.goal === "work" ? null : answers.education,
        // These questions are no longer collected by the form. Legacy drafts must
        // not silently submit defaults the user cannot review or change.
        career_stage: null,
        housing_types: answers.housing.filter((type) => type !== "unsure"),
        transport_mode: answers.transport, departure_time: answers.departure, extras: [], over_budget: answers.overBudget,
        ...(answers.transport === "active" ? { active_mode: "walk" } : {}),
        destination: destination ? {
            name: destination.name,
            precision: "precision" in destination ? destination.precision : "area",
            ...("longitude" in destination ? { longitude: destination.longitude, latitude: destination.latitude } : {}),
        } : null,
    }, {
        // Split opportunity for a combined goal, and affordability across rent/living costs.
        career: answers.goal === "study" ? 0 : answers.goal === "both" ? opportunity / 2 : opportunity,
        education: answers.goal === "work" ? 0 : answers.goal === "both" ? opportunity / 2 : opportunity,
        housing: answers.weights.affordability / 200, cost_of_living: answers.weights.affordability / 200,
        commute: answers.weights.mobility / 100, environment: answers.weights.environment / 100,
    });
}

export function buildPersistedRelocationProfile(
    proposalValue: unknown,
    confirmedFieldsValue: unknown,
): PersistedRelocationProfile {
    const proposal = validateLF05Proposal(proposalValue, onboardingTaxonomy);
    if (
        !Array.isArray(confirmedFieldsValue) ||
        confirmedFieldsValue.length > proposal.inferred_fields.length ||
        confirmedFieldsValue.some((field) => typeof field !== "string")
    ) {
        throw new Error("INVALID_PROFILE_CONFIRMATION");
    }

    const confirmedFields = new Set(confirmedFieldsValue as string[]);
    if (
        confirmedFields.size !== confirmedFieldsValue.length ||
        confirmedFields.size !== proposal.inferred_fields.length ||
        proposal.inferred_fields.some((field) => !confirmedFields.has(field))
    ) {
        throw new Error("PROFILE_CONFIRMATION_REQUIRED");
    }

    return normalizeRelocationProfileInputs(proposal.hard_constraints, proposal.soft_preferences, proposal.priority_weights);
}
