import type { RelocationProfileTaxonomy } from "../extractUserProfile";
import { LANGFLOW_CONTRACTS } from "./langflowContracts";
import { isStringList } from "./zoneFitExplanationValidation";
import { isRecord } from "./zoneGeometry";
import { isRelocationGoal } from "./relocationGoal";

export type RelocationProfileProposal = {
    hard_constraints: Record<string, unknown>;
    soft_preferences: Record<string, unknown>;
    priority_weights: Record<string, number>;
    inferred_fields: string[];
    clarification_questions: string[];
    requires_confirmation: true;
    confirmed: false;
    taxonomy_version: string;
    contract_version: typeof LANGFLOW_CONTRACTS.relocationProfileInterpretation;
    writes_performed: false;
    decision_trace: Record<string, unknown>;
    runtime_usage: unknown;
};

const PROFILE_FIELDS = new Set([
    "goal", "target_fields", "target_occupations", "destination_cities", "monthly_budget", "housing_budget",
    "commute_minutes", "work_arrangement", "education_level", "language_preferences", "priorities", "deal_breakers",
    "transport_mode", "destination", "housing_types", "occupation", "study_field", "career_stage",
    "departure_time", "extras", "over_budget", "active_mode",
]);
const WEIGHT_FIELDS = new Set(["career", "housing", "commute", "education", "cost_of_living", "environment"]);
// Decimal coordinates are not identity-number strings.
export const SENSITIVE_TEXT = /\b(nik|ktp|passport|paspor|religion|agama|ethnicity|etnis|diagnosis|alamat rumah|home address)\b|(?<![\d.])(?:\d[ -]?){16}(?![\d.])/iu;

function validateBudget(value: unknown) {
    return isRecord(value) && Object.keys(value).length === 3 &&
        typeof value.amount === "number" && Number.isSafeInteger(value.amount) && value.amount >= 0 && value.amount <= 1_000_000_000 &&
        value.currency === "IDR" && value.period === "month";
}

export function isProfileDestination(value: unknown): boolean {
    return isRecord(value) && !Object.keys(value).some((key) => !["name", "precision", "latitude", "longitude"].includes(key)) &&
        typeof value.name === "string" && !!value.name.trim() && value.name.length <= 200 &&
        ["city", "area", "point"].includes(String(value.precision)) &&
        (value.precision === "point" ? typeof value.latitude === "number" && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
            typeof value.longitude === "number" && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180
            : value.latitude === undefined && value.longitude === undefined);
}

function validateProfileValues(values: Record<string, unknown>, taxonomy: RelocationProfileTaxonomy) {
    const sectorIds = new Set(taxonomy.sectors.map(({ id }) => id));
    const occupationIds = new Set(taxonomy.occupations.map(({ id }) => id));

    for (const [field, value] of Object.entries(values)) {
        if (!PROFILE_FIELDS.has(field)) return false;
        if (value === null) continue;
        if (field === "goal") {
            if (!isRelocationGoal(value)) return false;
            continue;
        }
        if (field === "transport_mode") {
            if (typeof value !== "string" || !["transit", "motorcycle", "car", "active"].includes(value)) return false;
            continue;
        }
        if (field === "active_mode") {
            if (value !== "walk" && value !== "bicycle") return false;
            continue;
        }
        if (field === "over_budget") {
            if (value !== "mark" && value !== "hide") return false;
            continue;
        }
        if (["occupation", "study_field", "career_stage", "departure_time"].includes(field)) {
            if (typeof value !== "string" || value.length > 200 || SENSITIVE_TEXT.test(value)) return false;
            continue;
        }
        if (["housing_types", "extras"].includes(field)) {
            if (!isStringList(value, 20) || value.some((item) => item.length > 100 || SENSITIVE_TEXT.test(item))) return false;
            continue;
        }
        if (["target_fields", "target_occupations", "destination_cities", "language_preferences", "priorities", "deal_breakers"].includes(field)) {
            if (!isStringList(value, 50) || value.some((item) => item.length > 200)) return false;
            if (field === "target_fields" && value.some((id) => !sectorIds.has(id))) return false;
            if (field === "target_occupations" && value.some((id) => !occupationIds.has(id))) return false;
            continue;
        }
        if (field === "destination") {
            if (!isProfileDestination(value)) return false;
            continue;
        }
        if (field === "monthly_budget" || field === "housing_budget") {
            if (!validateBudget(value)) return false;
            continue;
        }
        if (field === "commute_minutes") {
            if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 240) return false;
            continue;
        }
        if (Array.isArray(value)) {
            if (!isStringList(value, 50) || value.some((item) => item.length > 200)) return false;
            continue;
        }
        if (typeof value === "string") {
            if (value.length > 2000 || SENSITIVE_TEXT.test(value)) return false;
            continue;
        }
        if (typeof value !== "number" || !Number.isFinite(value)) return false;
    }

    return true;
}

export function validateRelocationProfileProposal(value: unknown, taxonomy: RelocationProfileTaxonomy): RelocationProfileProposal {
    if (!isRecord(value) || JSON.stringify(value).length > 60_000) throw new Error("INVALID_RELOCATION_PROFILE_INTERPRETATION_PROFILE");

    if (
        !isRecord(value.hard_constraints) || !validateProfileValues(value.hard_constraints, taxonomy) ||
        !isRecord(value.soft_preferences) || !validateProfileValues(value.soft_preferences, taxonomy) ||
        !isRecord(value.priority_weights) || !isStringList(value.inferred_fields, PROFILE_FIELDS.size) ||
        !isStringList(value.clarification_questions, 20) || value.clarification_questions.some((question) => !question.trim() || question.length > 4000) ||
        value.requires_confirmation !== true || value.confirmed !== false ||
        value.taxonomy_version !== taxonomy.version || value.contract_version !== LANGFLOW_CONTRACTS.relocationProfileInterpretation || value.writes_performed !== false ||
        !isRecord(value.decision_trace) || !("runtime_usage" in value)
    ) {
        throw new Error("INVALID_RELOCATION_PROFILE_INTERPRETATION_PROFILE");
    }

    if (value.inferred_fields.some((field) => !PROFILE_FIELDS.has(field))) throw new Error("INVALID_RELOCATION_PROFILE_INTERPRETATION_PROFILE");

    const weightEntries = Object.entries(value.priority_weights);
    if (
        weightEntries.some(([key, weight]) => !WEIGHT_FIELDS.has(key) || typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || weight > 1) ||
        (weightEntries.length > 0 && Math.abs(weightEntries.reduce((sum, [, weight]) => sum + Number(weight), 0) - 1) > 0.000001)
    ) {
        throw new Error("INVALID_RELOCATION_PROFILE_INTERPRETATION_PROFILE");
    }

    if (SENSITIVE_TEXT.test(JSON.stringify(value))) throw new Error("INVALID_RELOCATION_PROFILE_INTERPRETATION_PROFILE");
    return value as unknown as RelocationProfileProposal;
}
