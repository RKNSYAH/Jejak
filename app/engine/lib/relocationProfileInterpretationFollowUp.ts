import { isProfileDestination, SENSITIVE_TEXT, type RelocationProfileProposal } from "./relocationProfileInterpretationValidation";
import { isRecord } from "./zoneGeometry";
import { relocationGoalLabels, type RelocationGoal } from "./relocationGoal";
import { extractUserProfile, onboardingTaxonomy } from "../extractUserProfile";
import { extractProfileActiveMode, extractProfileTransportMode, getProfileTransportQuestion, parseProfileTransportAnswer, type ProfileTransportMode } from "./relocationProfileInterpretationTransport";
import { housingLabels } from "../onboarding/demoData";
import type { Housing } from "../onboarding/types";

type StatedHousing = Exclude<Housing, "unsure">;

export type ProfileClarificationAnswer = { question: string; answer: string; field?: "commute_minutes" | "transport_mode" };
export type ProfileFollowUpDetails = {
    commute_minutes?: number;
    transport_mode?: ProfileTransportMode;
    active_mode?: "walk" | "bicycle";
    destination?: { name: string; precision: "city" | "area" | "point"; latitude?: number; longitude?: number };
    // Empty when the user answered "Belum yakin": kos and apartment rents are both compared.
    housing_types?: StatedHousing[];
};

export function getProfileClarificationField(question: string): "commute_minutes" | "transport_mode" | "housing_types" | "destination" | "goal" | null {
    if (/\b(waktu tempuh|waktu perjalanan|lama.{0,30}perjalanan|durasi.{0,30}perjalanan|travel time)\b|how long.{0,40}(travel|journey|commute)/iu.test(question)) return "commute_minutes";
    if (/\b(transport(?:asi|ation)?|angkutan|moda|naik apa|kendaraan|commute mode|travel mode)\b|how.{0,24}(travel|commute|get to work)/iu.test(question)) return "transport_mode";
    if (/\b(?:jenis|tipe) hunian\b|\bhousing type\b|\bkost?\b.{0,30}\bapartemen\b|\bapartemen\b.{0,30}\bkost?\b/iu.test(question)) return "housing_types";
    if (/\bcommute\b/iu.test(question)) return "commute_minutes";
    if (/\b(kantor(?:ku|mu|nya)?|office|workplace|work location|lokasi kerja|tempat kerja|lokasi tujuan(?:mu|nya)?|tujuan spesifik)\b|where.{0,24}work/iu.test(question)) return "destination";
    if (/tujuan pindah|kerja.{0,30}kuliah|work.{0,30}study/iu.test(question)) return "goal";
    return null;
}

export function getProfileHousingQuestion(): string {
    return "Jenis hunian apa yang kamu cari?";
}

export const profileHousingChoices = ["kos", "apartment", "unsure"] as const;

export function parseProfileHousingAnswer(answer: string): Housing | null {
    return profileHousingChoices.find((type) => housingLabels[type].toLowerCase() === answer.trim().toLowerCase()) ?? null;
}

const housingTerms: [StatedHousing, RegExp][] = [
    ["kos", /\b(?:kos|kost|kosan|kostan|ngekos|ngekost|indekos)\b/iu],
    ["apartment", /\b(?:apartemen|apartment)\b/iu],
    ["house", /\b(?:kontrakan|ngontrak|sewa rumah|rent a house)\b/iu],
];

// Rent is scored per housing type, so only a stated type counts: "bukan kos" is not a choice, and neither is a model guess.
export function extractProfileHousingTypes(story: string): StatedHousing[] {
    const stated = new Set<StatedHousing>();
    // Commas end a clause too, so "bukan kos, cari apartemen" negates only kos.
    for (const clause of story.split(/[.,!?;\n]+|\b(?:tapi|tetapi|but)\b/iu)) {
        for (const [type, pattern] of housingTerms) {
            const match = clause.match(pattern);
            if (match && !/\b(?:tidak|tak|nggak|gak|ga|bukan|tanpa|not|never|without|avoid)\b(?:\s+\S+){0,3}\s*$/iu.test(clause.slice(0, match.index))) stated.add(type);
        }
    }
    return housingTerms.map(([type]) => type).filter((type) => stated.has(type));
}

export function parseProfileCommuteAnswer(answer: string): number | null {
    const match = answer.trim().match(/^(\d{1,3})(?:\s*(?:menit|mnt|minutes?|mins?))?$/iu);
    const minutes = match ? Number(match[1]) : NaN;
    return Number.isInteger(minutes) && minutes >= 0 && minutes <= 240 ? minutes : null;
}

export function validateFollowUpDetails(value: unknown): ProfileFollowUpDetails {
    if (value === undefined) return {};
    if (!isRecord(value) || Object.keys(value).some((key) => !["commute_minutes", "transport_mode", "active_mode", "destination", "housing_types"].includes(key)) ||
        (value.housing_types !== undefined && (!Array.isArray(value.housing_types) || new Set(value.housing_types).size !== value.housing_types.length ||
            value.housing_types.some((type) => !housingTerms.some(([stated]) => stated === type)))) ||
        (value.commute_minutes !== undefined && (typeof value.commute_minutes !== "number" || !Number.isInteger(value.commute_minutes) || value.commute_minutes < 0 || value.commute_minutes > 240)) ||
        (value.transport_mode !== undefined && (typeof value.transport_mode !== "string" || !["transit", "motorcycle", "car", "active"].includes(value.transport_mode)))) {
        throw new Error("INVALID_CLARIFICATION_ANSWERS");
    }
    if (value.active_mode !== undefined && (value.transport_mode !== "active" || (value.active_mode !== "walk" && value.active_mode !== "bicycle")))
        throw new Error("INVALID_CLARIFICATION_ANSWERS");
    if (value.destination !== undefined && !isProfileDestination(value.destination)) throw new Error("INVALID_CLARIFICATION_ANSWERS");
    if (SENSITIVE_TEXT.test(JSON.stringify(value))) throw new Error("SENSITIVE_ONBOARDING_INPUT");
    return value as ProfileFollowUpDetails;
}

// A field binding identifies explicit input, never a model inference or confirmation.
export function validateClarificationAnswers(value: unknown): ProfileClarificationAnswer[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 20 || value.some((item) =>
        !isRecord(item) || Object.keys(item).some((key) => !["question", "answer", "field"].includes(key)) ||
        (item.field !== undefined && !["commute_minutes", "transport_mode"].includes(String(item.field))) ||
        typeof item.question !== "string" || !item.question.trim() || item.question.length > 4000 ||
        typeof item.answer !== "string" || !item.answer.trim() || item.answer.length > 1000)) {
        throw new Error("INVALID_CLARIFICATION_ANSWERS");
    }
    const answers = (value as ProfileClarificationAnswer[]).map(({ question, answer, field }) => {
        const detected = getProfileClarificationField(question);
        const boundField = field ?? (detected === "commute_minutes" || detected === "transport_mode" ? detected : undefined);
        const minutes = boundField === "commute_minutes" ? parseProfileCommuteAnswer(answer) : null;
        const transport = boundField === "transport_mode" ? parseProfileTransportAnswer(answer) : null;
        if ((boundField === "commute_minutes" && minutes === null) || (boundField === "transport_mode" && transport === null)) throw new Error("INVALID_CLARIFICATION_ANSWERS");
        const activeMode = transport === "active" ? extractProfileActiveMode(answer) : null;
        return { question: question.trim(), answer: boundField === "commute_minutes" ? `${minutes} menit` : activeMode ?? transport ?? answer.trim(), ...(boundField ? { field: boundField } : {}) };
    });
    if (new Set(answers.map((item) => item.question)).size !== answers.length) throw new Error("INVALID_CLARIFICATION_ANSWERS");
    return answers;
}

export function resolveProfileFollowUpDetails(answers: ProfileClarificationAnswer[], details: ProfileFollowUpDetails, story = ""): ProfileFollowUpDetails {
    const explicit = { ...validateFollowUpDetails(details) };
    for (const item of validateClarificationAnswers(answers)) {
        if (item.field === "commute_minutes" && explicit.commute_minutes === undefined) explicit.commute_minutes = parseProfileCommuteAnswer(item.answer)!;
        if (item.field === "transport_mode" && explicit.transport_mode === undefined) {
            explicit.transport_mode = parseProfileTransportAnswer(item.answer)!;
            const activeMode = extractProfileActiveMode(item.answer);
            if (explicit.transport_mode === "active" && activeMode) explicit.active_mode = activeMode;
        }
        const housing = getProfileClarificationField(item.question) === "housing_types" ? parseProfileHousingAnswer(item.answer) : null;
        if (housing && explicit.housing_types === undefined) explicit.housing_types = housing === "unsure" ? [] : [housing];
    }
    const storyHousing = extractProfileHousingTypes(story);
    if (explicit.housing_types === undefined && storyHousing.length) explicit.housing_types = storyHousing;
    const storyTransport = extractProfileTransportMode(story);
    if (explicit.transport_mode === undefined && storyTransport) {
        explicit.transport_mode = storyTransport;
        const activeMode = extractProfileActiveMode(story);
        if (storyTransport === "active" && activeMode) explicit.active_mode = activeMode;
    }
    return explicit;
}

export function groundProfileTransport(proposal: RelocationProfileProposal, story: string, details: ProfileFollowUpDetails = {}): RelocationProfileProposal {
    const hard = { ...proposal.hard_constraints };
    const soft = { ...proposal.soft_preferences };
    const transport = details.transport_mode ?? extractProfileTransportMode(story);
    delete hard.transport_mode;
    delete soft.transport_mode;
    delete hard.active_mode;
    delete soft.active_mode;
    if (transport) soft.transport_mode = transport;
    // An explicit generic active follow-up overrides the story subtype as ambiguous.
    const activeMode = details.active_mode ?? (details.transport_mode === undefined ? extractProfileActiveMode(story) : null);
    if (transport === "active" && activeMode) soft.active_mode = activeMode;
    return { ...proposal, hard_constraints: hard, soft_preferences: soft,
        inferred_fields: proposal.inferred_fields.filter((field) => field !== "transport_mode" && field !== "active_mode") };
}

// Explicit details re-add a stated housing type afterwards; whatever the model guessed is discarded.
export function dropModelHousing(proposal: RelocationProfileProposal): RelocationProfileProposal {
    const hard = { ...proposal.hard_constraints };
    const soft = { ...proposal.soft_preferences };
    delete hard.housing_types;
    delete soft.housing_types;
    return { ...proposal, hard_constraints: hard, soft_preferences: soft,
        inferred_fields: proposal.inferred_fields.filter((field) => field !== "housing_types") };
}

export function applyProfileExplicitDetails(proposal: RelocationProfileProposal, goal?: RelocationGoal, details: ProfileFollowUpDetails = {}): RelocationProfileProposal {
    const hard = { ...proposal.hard_constraints };
    const soft = { ...proposal.soft_preferences };
    for (const [field, value] of Object.entries(details)) {
        delete hard[field];
        delete soft[field];
        if (field === "commute_minutes") hard[field] = value;
        else soft[field] = value;
    }
    if (goal) { hard.goal = goal; delete soft.goal; }
    return { ...proposal, hard_constraints: hard, soft_preferences: soft,
        inferred_fields: proposal.inferred_fields.filter((field) => !(goal && field === "goal") && !Object.hasOwn(details, field)) };
}

// A review-step correction replaces the interpreted value and is no longer an inference.
export function applyProfileFieldEdit(proposal: RelocationProfileProposal, field: string, value: unknown): RelocationProfileProposal {
    const hard = { ...proposal.hard_constraints };
    const soft = { ...proposal.soft_preferences };
    const inSoft = Object.hasOwn(soft, field) && !Object.hasOwn(hard, field);
    // New values follow applyProfileExplicitDetails: places and travel mode are preferences, the rest constraints.
    const target = inSoft || (!Object.hasOwn(hard, field) && (field === "transport_mode" || field === "destination")) ? soft : hard;
    delete hard[field];
    delete soft[field];
    target[field] = value;
    if (field === "transport_mode") {
        delete hard.transport_mode;
        soft.transport_mode = value;
        delete hard.active_mode;
        delete soft.active_mode;
        if (value === "walk" || value === "bicycle") {
            soft.transport_mode = "active";
            soft.active_mode = value;
        }
    } else if (field === "active_mode") {
        soft.transport_mode = "active";
        soft.active_mode = value;
    }
    return { ...proposal, hard_constraints: hard, soft_preferences: soft,
        inferred_fields: proposal.inferred_fields.filter((item) => item !== field && !(field === "transport_mode" && item === "active_mode")) };
}

export function getProfileTargetCity(proposal: RelocationProfileProposal | null, story: string): string | null {
    const cities = proposal?.hard_constraints.destination_cities ?? proposal?.soft_preferences.destination_cities;
    const city = Array.isArray(cities) ? cities.find((item) => typeof item === "string" && item.trim()) : typeof cities === "string" ? cities : null;
    return typeof city === "string" ? onboardingTaxonomy.areas?.find((area) => area.id === city)?.label ?? city : extractUserProfile(story).targetCity;
}

export function getProfileClarificationQuestions(proposal: RelocationProfileProposal, story: string, answers: ProfileClarificationAnswer[] = [], goal?: RelocationGoal, details: ProfileFollowUpDetails = {}): string[] {
    const answered = new Set(answers.map(({ question }) => question.trim()));
    const destinationAnswered = !!details.destination || answers.some(({ question }) => getProfileClarificationField(question) === "destination");
    const questions = proposal.clarification_questions.filter((question) => {
        const field = getProfileClarificationField(question);
        if (field === "transport_mode" || field === "housing_types") return false; // One deterministic question, never a model pick.
        return !answered.has(question.trim()) && !(field === "goal" && goal) && !(field === "destination" && destinationAnswered) && !(field && Object.hasOwn(details, field));
    });
    const transport = resolveProfileFollowUpDetails(answers, details, story).transport_mode;
    if (!transport) questions.push(getProfileTransportQuestion());
    const housing = proposal.hard_constraints.housing_types ?? proposal.soft_preferences.housing_types;
    if (!(Array.isArray(housing) && housing.length) && !answers.some(({ question }) => getProfileClarificationField(question) === "housing_types")) {
        questions.push(getProfileHousingQuestion());
    }
    const destination = proposal.hard_constraints.destination ?? proposal.soft_preferences.destination;
    const city = getProfileTargetCity(proposal, story);
    const hasSpecificDestination = isRecord(destination) && destination.precision !== "city" && typeof destination.name === "string" && destination.name.toLowerCase() !== city?.toLowerCase();
    if (!hasSpecificDestination && !destinationAnswered && !questions.some((question) => getProfileClarificationField(question) === "destination")) {
        questions.push(city ? `Sudah tahu lokasi tujuan spesifik di ${city}?` : "Sudah tahu lokasi tujuanmu?");
    }
    return [...new Set(questions)];
}

export function buildProfileMessage(message: string, answers: ProfileClarificationAnswer[]): string {
    const combined = answers.length ? `${message.trim()}\n\nJawaban pertanyaan lanjutan:\n${answers.map(({ question, answer }) => `${question}\nJawaban: ${answer}`).join("\n\n")}` : message.trim();
    if (combined.length > 12000) throw new Error("INVALID_CLARIFICATION_ANSWERS");
    if (SENSITIVE_TEXT.test(combined)) throw new Error("SENSITIVE_ONBOARDING_INPUT");
    return combined;
}

// Screen and send exactly the same combined input, including structured choices.
export function buildProfileFollowUpMessage(message: string, answers: ProfileClarificationAnswer[], goal?: RelocationGoal, details: ProfileFollowUpDetails = {}): string {
    const followUps = [...validateClarificationAnswers(answers)];
    if (goal) {
        const index = followUps.findIndex((item) => item.question === "Tujuan pindah");
        if (index >= 0) followUps.splice(index, 1);
        followUps.push({ question: "Tujuan pindah", answer: relocationGoalLabels[goal] });
    }
    if (details.commute_minutes !== undefined) followUps.push({ question: "Batas waktu tempuh sekali jalan", answer: `${details.commute_minutes} menit` });
    if (details.transport_mode) followUps.push({ question: "Moda transportasi", answer: details.active_mode ?? details.transport_mode });
    if (details.destination) followUps.push({ question: "Lokasi tujuan", answer: JSON.stringify(details.destination) });
    return buildProfileMessage(message, followUps);
}
