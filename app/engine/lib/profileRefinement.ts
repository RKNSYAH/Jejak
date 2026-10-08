import { onboardingTaxonomy } from "../extractUserProfile";
import { LANGFLOW_CONTRACTS } from "./langflowContracts";
import { SENSITIVE_TEXT, validateRelocationProfileProposal, type RelocationProfileProposal } from "./relocationProfileInterpretationValidation";
import { normalizeRelocationProfileInputs, RELOCATION_PROFILE_SCHEMA_VERSION, type PersistedRelocationProfile } from "./relocationProfile";
import { getRelocationGoal, relocationGoalLabels } from "./relocationGoal";
import { isRecord } from "./zoneGeometry";
import { getProfileClarificationField, type ProfileClarificationAnswer } from "./relocationProfileInterpretationFollowUp";

const BUCKETS = ["hard_constraints", "soft_preferences"] as const;
const WEIGHTS = ["career", "housing", "commute", "education", "cost_of_living", "environment"] as const;
const REMOTE_WEIGHTS = ["career", "housing", "commute", "education", "cost_of_living"] as const;
const ANSWER_FIELDS = new Set([
    "goal", "target_fields", "target_occupations", "destination_cities", "monthly_budget", "housing_budget",
    "commute_minutes", "work_arrangement", "education_level", "language_preferences", "priorities", "deal_breakers",
    "transport_mode",
]);
const ANSWERING_FIELDS = new Set([
    "goal", "monthly_budget", "housing_budget", "destination_cities", "commute_minutes", "priorities",
    "target_fields", "transport_mode",
]);
const PROFILE_KEYS = new Set([
    "goal", "target_fields", "target_occupations", "destination_cities", "monthly_budget", "housing_budget",
    "commute_minutes", "work_arrangement", "education_level", "language_preferences", "priorities", "deal_breakers",
    "transport_mode", "destination", "housing_types", "occupation", "study_field", "career_stage", "departure_time",
    "extras", "over_budget", "active_mode",
]);

export function validateRelocationDraft(value: unknown, allowMissingWeights = false): PersistedRelocationProfile {
    if (!isRecord(value) || JSON.stringify(value).length > 60_000 || value.schema_version !== RELOCATION_PROFILE_SCHEMA_VERSION ||
        value.taxonomy_version !== onboardingTaxonomy.version || value.contract_version !== LANGFLOW_CONTRACTS.relocationProfileInterpretation ||
        Object.keys(value).some((key) => !["schema_version", "hard_constraints", "soft_preferences", "priority_weights", "taxonomy_version", "contract_version"].includes(key)) ||
        !isRecord(value.hard_constraints) || !isRecord(value.soft_preferences) || !isRecord(value.priority_weights)) {
        throw new Error("INVALID_PROFILE_DRAFT");
    }
    for (const group of [value.hard_constraints, value.soft_preferences]) {
        if (Object.keys(group).some((key) => !PROFILE_KEYS.has(key))) throw new Error("INVALID_PROFILE_DRAFT");
    }
    const priorityWeights = value.priority_weights;
    const weights = Object.entries(priorityWeights);
    if ((!allowMissingWeights && weights.length === 0) || weights.length > WEIGHTS.length ||
        weights.some(([key, weight]) => !WEIGHTS.includes(key as typeof WEIGHTS[number]) || typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1) ||
        (weights.length > 0 && Math.abs(weights.reduce((sum, [, weight]) => sum + Number(weight), 0) - 1) > 0.000001)) throw new Error("INVALID_PROFILE_DRAFT");

    let wrapped: RelocationProfileProposal;
    try {
        wrapped = validateRelocationProfileProposal({
            hard_constraints: value.hard_constraints, soft_preferences: value.soft_preferences,
            priority_weights: value.priority_weights, inferred_fields: [], clarification_questions: [],
            requires_confirmation: true, confirmed: false, taxonomy_version: onboardingTaxonomy.version,
            contract_version: LANGFLOW_CONTRACTS.relocationProfileInterpretation, writes_performed: false, decision_trace: {}, runtime_usage: null,
        }, onboardingTaxonomy);
    } catch {
        throw new Error("INVALID_PROFILE_DRAFT");
    }
    if (!getRelocationGoal(wrapped)) throw new Error("INVALID_PROFILE_DRAFT");
    return value as unknown as PersistedRelocationProfile;
}

function equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) &&
        a.length === b.length && a.every((item, index) => equal(item, b[index]));
    if (isRecord(a) || isRecord(b)) {
        if (!isRecord(a) || !isRecord(b)) return false;
        const aKeys = Object.keys(a).sort();
        const bKeys = Object.keys(b).sort();
        return aKeys.length === bKeys.length && aKeys.every((key, index) => key === bKeys[index] && equal(a[key], b[key]));
    }
    return false;
}

function sameWeightDistribution(left: Record<string, number>, right: Record<string, number>): boolean {
    const leftTotal = Object.values(left).reduce((sum, value) => sum + value, 0);
    const rightTotal = REMOTE_WEIGHTS.reduce((sum, key) => sum + (right[key] ?? 0), 0);
    if (leftTotal === 0 || rightTotal === 0) return leftTotal === rightTotal;
    return REMOTE_WEIGHTS.every((key) => Math.abs((left[key] ?? 0) / leftTotal - (right[key] ?? 0) / rightTotal) <= 0.000001);
}

export function getProfileChanges(before: PersistedRelocationProfile, after: PersistedRelocationProfile): string[] {
    const changes: string[] = [];
    for (const bucket of BUCKETS) {
        const keys = new Set([...Object.keys(before[bucket]), ...Object.keys(after[bucket])]);
        for (const key of keys) if (!equal(before[bucket][key], after[bucket][key])) changes.push(key);
    }
    if (!equal(before.priority_weights, after.priority_weights)) changes.push("priorities");
    return [...new Set(changes)].sort();
}

export type NativeProfileRefinementInput = {
    mode: "refinement";
    language: "id";
    session_reference: string;
    privacy_screened: true;
    message: string;
    answers: Record<string, unknown>;
    current_profile: {
        hard_constraints: Record<string, unknown>;
        soft_preferences: Record<string, unknown>;
        priority_weights: Record<string, number>;
    };
    answering: string[];
    taxonomy: typeof onboardingTaxonomy;
};

export function buildNativeProfileRefinementInput(
    confirmed: PersistedRelocationProfile,
    draft: PersistedRelocationProfile,
    message: string | undefined,
    clarificationAnswers: ProfileClarificationAnswer[],
    sessionReference: string,
    language: "id",
): NativeProfileRefinementInput {
    const explicitChanges = getProfileChanges(confirmed, draft);
    const currentProfile = projectRemoteProfile(confirmed);
    const answers: Record<string, unknown> = {};
    const answering = new Set<string>();

    for (const field of explicitChanges) {
        if (field === "priorities" && !equal(confirmed.priority_weights, draft.priority_weights)) {
            const weights = Object.fromEntries(REMOTE_WEIGHTS.flatMap((key) =>
                Object.hasOwn(draft.priority_weights, key) ? [[key, draft.priority_weights[key]]] : []));
            // The deployed contract permits nested objects only for IDR budgets.
            if (Object.keys(weights).length) answers.priorities = Object.entries(weights)
                .map(([key, value]) => `${key} ${Math.round(value * 100)}%`);
            answering.add("priorities");
            continue;
        }
        if (!ANSWER_FIELDS.has(field)) continue;
        const value = getProfileValue(draft, field);
        if (hasMeaningfulValue(value)) answers[field] = value;
        answering.add(field === "destination" ? "destination_cities" : field);
    }

    const clarifiedLines: string[] = [];
    for (const answer of clarificationAnswers) {
        clarifiedLines.push(`${answer.question.trim()} — ${answer.answer.trim()}`);
        const field = getClarificationAnswerField(answer);
        if (field && ANSWER_FIELDS.has(field) && hasMeaningfulValue(answer.answer)) {
            answers[field] = field === "commute_minutes" ? Number(answer.answer.match(/^\d+/u)?.[0]) : answer.answer.trim();
            if (hasMeaningfulValue(answers[field])) answering.add(field);
        }
    }

    const naturalMessage = message?.trim() ?? "";
    // Keep the deployed profile interpretation key allowlist unchanged; transmit the local subtype in prose.
    const activeMode = draft.soft_preferences.active_mode;
    const activeContext = draft.soft_preferences.transport_mode === "active" && (activeMode === "walk" || activeMode === "bicycle")
        ? `Moda aktif yang ditetapkan: ${activeMode === "walk" ? "jalan kaki" : "sepeda"}. Jangan menggantinya dengan moda aktif lain.` : "";
    let finalMessage: string;
    if (naturalMessage) {
        finalMessage = [naturalMessage, activeContext, clarifiedLines.length ? `Jawaban klarifikasi:\n${clarifiedLines.join("\n")}` : ""].filter(Boolean).join("\n\n");
    } else {
        const descriptions = explicitChanges.filter((field) => ANSWER_FIELDS.has(field) || field === "priorities")
            .map((field) => describeTypedChange(field, draft));
        const instruction = descriptions.length
            ? `Periksa perubahan preferensi berikut tanpa mengubah nilai yang ditetapkan: ${descriptions.join("; ")}.`
            : "Periksa perubahan preferensi berikut tanpa mengubah nilai yang ditetapkan: perubahan preferensi lokal.";
        finalMessage = [instruction, activeContext, clarifiedLines.length ? `Jawaban klarifikasi:\n${clarifiedLines.join("\n")}` : ""].filter(Boolean).join("\n\n");
    }

    const input: NativeProfileRefinementInput = {
        mode: "refinement", language, session_reference: sessionReference, privacy_screened: true,
        message: finalMessage, answers, current_profile: currentProfile,
        answering: [...answering].filter((field) => ANSWERING_FIELDS.has(field)), taxonomy: onboardingTaxonomy,
    };
    const serializedCurrentProfile = JSON.stringify(input.current_profile);
    if (finalMessage.length > 4000 || !finalMessage.trim() || serializedCurrentProfile.length > 12_000 || JSON.stringify(input).length > 20_000) {
        throw new Error("INVALID_PROFILE_REFINEMENT");
    }
    if (SENSITIVE_TEXT.test(JSON.stringify(input))) throw new Error("SENSITIVE_ONBOARDING_INPUT");
    return input;
}

function projectRemoteProfile(profile: PersistedRelocationProfile): NativeProfileRefinementInput["current_profile"] {
    const projectGroup = (source: Record<string, unknown>) => Object.fromEntries(Object.entries(source)
        .filter(([field, value]) => ANSWER_FIELDS.has(field) && hasMeaningfulValue(value)));
    return {
        hard_constraints: projectGroup(profile.hard_constraints),
        soft_preferences: projectGroup(profile.soft_preferences),
        priority_weights: Object.fromEntries(REMOTE_WEIGHTS.flatMap((key) =>
            Object.hasOwn(profile.priority_weights, key) ? [[key, profile.priority_weights[key]]] : [])),
    };
}

function getProfileValue(profile: PersistedRelocationProfile, field: string): unknown {
    if (field === "priorities") return profile.soft_preferences.priorities ?? profile.hard_constraints.priorities;
    if (Object.hasOwn(profile.hard_constraints, field)) return profile.hard_constraints[field];
    return profile.soft_preferences[field];
}

function getClarificationAnswerField(answer: ProfileClarificationAnswer): string | null {
    if (answer.field) return answer.field;
    const field = getRefinementQuestionField(answer.question);
    return field === "destination" ? "destination_cities" : field;
}

function describeTypedChange(field: string, profile: PersistedRelocationProfile): string {
    const value = field === "priorities" && !hasMeaningfulValue(profile.soft_preferences.priorities)
        ? profile.priority_weights : getProfileValue(profile, field);
    if (["monthly_budget", "housing_budget"].includes(field) && isRecord(value) && typeof value.amount === "number") {
        const label = field === "housing_budget" ? "batas sewa" : "anggaran bulanan";
        return `${label} Rp${value.amount.toLocaleString("id-ID")}/bulan`;
    }
    const labels: Record<string, string> = {
        goal: "tujuan", target_fields: "bidang", target_occupations: "pekerjaan", destination_cities: "kota tujuan",
        commute_minutes: "batas perjalanan", work_arrangement: "pengaturan kerja", education_level: "pendidikan",
        language_preferences: "bahasa", priorities: "prioritas", deal_breakers: "hal yang dihindari", transport_mode: "transportasi",
    };
    const describedValue = field === "goal" && typeof value === "string" && value in relocationGoalLabels
        ? relocationGoalLabels[value as keyof typeof relocationGoalLabels]
        : field === "transport_mode" && typeof value === "string"
        ? ({ transit: "angkutan umum", motorcycle: "motor", car: "mobil", active: "jalan kaki atau sepeda" } as Record<string, string>)[value] ?? value
        : field === "target_fields" && Array.isArray(value)
        ? value.map((id) => onboardingTaxonomy.sectors.find((sector) => sector.id === id)?.label ?? id).join(", ")
        : field === "target_occupations" && Array.isArray(value)
        ? value.map((id) => onboardingTaxonomy.occupations.find((occupation) => occupation.id === id)?.label ?? id).join(", ")
        : field === "priorities" && isRecord(value)
        ? REMOTE_WEIGHTS.filter((key) => typeof value[key] === "number")
            .map((key) => `${key} ${Math.round(Number(value[key]) * 100)}%`).join(", ")
        : Array.isArray(value) ? value.join(", ")
        : typeof value === "string" ? value : JSON.stringify(value);
    return `${labels[field] ?? field}: ${describedValue}`;
}

export function reconcileProfileRefinement(
    confirmedValue: PersistedRelocationProfile,
    draftValue: PersistedRelocationProfile,
    modelValue: unknown,
    allowModelChanges: boolean,
    answers: ProfileClarificationAnswer[] = [],
    narrativeMessage = "",
): RelocationProfileProposal {
    // Older confirmed stories can lack weights. A new draft must still provide valid, explicit weights.
    const confirmed = validateRelocationDraft(confirmedValue, true);
    const draft = validateRelocationDraft(draftValue);
    const model = validateRelocationProfileProposal(modelValue, onboardingTaxonomy);
    const explicit = new Set(getProfileChanges(confirmed, draft));
    const hard = { ...draft.hard_constraints };
    const soft = { ...draft.soft_preferences };
    const weightValues = { ...draft.priority_weights };
    const modelValues = new Map<string, unknown>();
    for (const key of new Set([...Object.keys(model.hard_constraints), ...Object.keys(model.soft_preferences)])) {
        modelValues.set(key, Object.hasOwn(model.hard_constraints, key) ? model.hard_constraints[key] : model.soft_preferences[key]);
    }
    const inferred: string[] = [];
    if (allowModelChanges) {
        for (const [field, value] of modelValues) {
            if (explicit.has(field) || !hasMeaningfulValue(value)) continue;
            const modelHasHard = Object.hasOwn(model.hard_constraints, field);
            const existingBucket = Object.hasOwn(hard, field) ? hard : Object.hasOwn(soft, field) ? soft : null;
            const existing = existingBucket ? existingBucket[field] : undefined;
            if (equal(existing, value)) continue;
            const target = existingBucket && hasMeaningfulValue(existing) ? existingBucket : modelHasHard ? hard : soft;
            target[field] = value;
            inferred.push(field);
        }
        const modelRemoteWeights = Object.fromEntries(REMOTE_WEIGHTS.flatMap((key) =>
            Object.hasOwn(model.priority_weights, key) ? [[key, model.priority_weights[key]]] : []));
        const modelRemoteTotal = Object.values(modelRemoteWeights).reduce((sum, weight) => sum + weight, 0);
        const existingEnvironment = weightValues.environment ?? 0;
        const desiredEnvironment = Object.hasOwn(model.priority_weights, "environment")
            ? model.priority_weights.environment : existingEnvironment;
        const environmentChanged = desiredEnvironment !== existingEnvironment;
        const sameRemoteDistribution = modelRemoteTotal > 0 && sameWeightDistribution(modelRemoteWeights, weightValues);
        if (!explicit.has("priorities") && (environmentChanged || Object.keys(modelRemoteWeights).length > 0 && !sameRemoteDistribution)) {
            if (modelRemoteTotal > 0 && desiredEnvironment >= 0 && desiredEnvironment <= 1) {
                for (const key of REMOTE_WEIGHTS) weightValues[key] = (modelRemoteWeights[key] ?? 0) / modelRemoteTotal * (1 - desiredEnvironment);
                if (Object.hasOwn(weightValues, "environment") || desiredEnvironment > 0) weightValues.environment = desiredEnvironment;
                inferred.push("priorities");
            } else if (environmentChanged && desiredEnvironment >= 0 && desiredEnvironment <= 1) {
                const currentRemoteTotal = REMOTE_WEIGHTS.reduce((sum, key) => sum + (weightValues[key] ?? 0), 0);
                if (currentRemoteTotal > 0) {
                    for (const key of REMOTE_WEIGHTS) weightValues[key] = (weightValues[key] ?? 0) / currentRemoteTotal * (1 - desiredEnvironment);
                    weightValues.environment = desiredEnvironment;
                    inferred.push("priorities");
                }
            }
        }
    }
    // Normalization centralizes legacy goal/budget placement while retaining all untouched draft slots.
    const normalized = normalizeRelocationProfileInputs(hard, soft, weightValues);
    const normalizedDraft = normalizeRelocationProfileInputs(draft.hard_constraints, draft.soft_preferences, draft.priority_weights);
    const changedByModel = new Set(getProfileChanges(normalizedDraft, normalized));
    const finalInferred = [...new Set(inferred)].filter((field) => changedByModel.has(field));
    const known = { hard_constraints: normalizedDraft.hard_constraints, soft_preferences: normalizedDraft.soft_preferences };
    const answeredQuestions = new Set(answers.map(({ question, field }) => field ?? getRefinementQuestionField(question)).filter(Boolean));
    const questions = allowModelChanges ? model.clarification_questions
        .filter((question) => !answeredQuestions.has(getRefinementQuestionField(question)) &&
            (!isQuestionAlreadyAnswered(question, known) || isTopicRequested(question, narrativeMessage)) &&
            !answers.some(({ question: answerQuestion }) => answerQuestion.trim().toLocaleLowerCase() === question.trim().toLocaleLowerCase()))
        .slice(0, 20).map((question) => question.trim().slice(0, 1000)) : [];
    return validateRelocationProfileProposal({
        ...model, hard_constraints: normalized.hard_constraints, soft_preferences: normalized.soft_preferences,
        priority_weights: normalized.priority_weights, inferred_fields: finalInferred,
        clarification_questions: questions, requires_confirmation: true, confirmed: false, writes_performed: false,
    }, onboardingTaxonomy);
}

function getRefinementQuestionField(question: string): string | null {
    const field = getProfileClarificationField(question);
    if (field) return field;
    if (/\bke mana.{0,30}\b(pindah|tinggal)\b/iu.test(question)) return "destination";
    if (/\b(sewa|rent|housing budget|anggaran tempat tinggal)\b/iu.test(question)) return "housing_budget";
    return /\b(anggaran|budget|biaya|biaya hidup)\b/iu.test(question) ? "monthly_budget" : null;
}

function hasMeaningfulValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
}

function isQuestionAlreadyAnswered(
    question: string,
    profile: { hard_constraints: Record<string, unknown>; soft_preferences: Record<string, unknown> },
): boolean {
    const field = getRefinementQuestionField(question);
    if (field === "goal") return !!getRelocationGoal(profile);
    if (field === "commute_minutes") return hasMeaningfulValue(profile.hard_constraints.commute_minutes ?? profile.soft_preferences.commute_minutes);
    if (field === "transport_mode") return hasMeaningfulValue(profile.soft_preferences.transport_mode ?? profile.hard_constraints.transport_mode);
    if (field === "destination") return hasMeaningfulValue(profile.soft_preferences.destination ?? profile.hard_constraints.destination) ||
        hasMeaningfulValue(profile.hard_constraints.destination_cities ?? profile.soft_preferences.destination_cities);
    if (field === "housing_budget") {
        return hasMeaningfulValue(profile.hard_constraints.housing_budget ?? profile.soft_preferences.housing_budget);
    }
    if (field === "monthly_budget") {
        return hasMeaningfulValue(profile.hard_constraints.monthly_budget ?? profile.soft_preferences.monthly_budget);
    }
    return false;
}

function isTopicRequested(question: string, message: string): boolean {
    if (!message.trim()) return false;
    const field = getRefinementQuestionField(question);
    const patterns: Record<string, RegExp> = {
        goal: /\b(tujuan|kerja|kuliah|study|work)\b/iu,
        destination: /\b(pindah|kota|lokasi|tujuan|destination|move|relocat)\b/iu,
        commute_minutes: /\b(perjalanan|commute|waktu tempuh|menit|travel time)\b/iu,
        transport_mode: /\b(transport|kendaraan|motor|mobil|transit|naik)\b/iu,
        housing_budget: /\b(sewa\w*|rent\w*|kontrakan\w*|kos\w*|batas.{0,15}(?:sewa\w*|tempat tinggal))\b/iu,
        monthly_budget: /\b(anggaran|budget|biaya|pengeluaran|cost)\b/iu,
    };
    return !!field && patterns[field]?.test(message) === true;
}
