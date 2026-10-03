import { isLF05Destination, SENSITIVE_TEXT, type LF05ProposedProfile } from "./lf05Validation";
import { isRecord } from "./zoneGeometry";
import { relocationGoalLabels, type RelocationGoal } from "./relocationGoal";
import { extractUserProfile, onboardingTaxonomy } from "../extractUserProfile";
import { extractLF05ActiveMode, extractLF05TransportMode, getLF05TransportQuestion, parseLF05TransportAnswer, type LF05TransportMode } from "./lf05Transport";

export type LF05ClarificationAnswer = { question: string; answer: string; field?: "commute_minutes" | "transport_mode" };
export type LF05FollowUpDetails = {
    commute_minutes?: number;
    transport_mode?: LF05TransportMode;
    active_mode?: "walk" | "bicycle";
    destination?: { name: string; precision: "city" | "area" | "point"; latitude?: number; longitude?: number };
};

export function getLF05ClarificationField(question: string): "commute_minutes" | "transport_mode" | "destination" | "goal" | null {
    if (/\b(waktu tempuh|waktu perjalanan|lama.{0,30}perjalanan|durasi.{0,30}perjalanan|travel time)\b|how long.{0,40}(travel|journey|commute)/iu.test(question)) return "commute_minutes";
    if (/\b(transport(?:asi|ation)?|angkutan|moda|naik apa|kendaraan|commute mode|travel mode)\b|how.{0,24}(travel|commute|get to work)/iu.test(question)) return "transport_mode";
    if (/\bcommute\b/iu.test(question)) return "commute_minutes";
    if (/\b(kantor(?:ku|mu|nya)?|office|workplace|work location|lokasi kerja|tempat kerja|lokasi tujuan(?:mu|nya)?|tujuan spesifik)\b|where.{0,24}work/iu.test(question)) return "destination";
    if (/tujuan pindah|kerja.{0,30}kuliah|work.{0,30}study/iu.test(question)) return "goal";
    return null;
}

export function parseLF05CommuteAnswer(answer: string): number | null {
    const match = answer.trim().match(/^(\d{1,3})(?:\s*(?:menit|mnt|minutes?|mins?))?$/iu);
    const minutes = match ? Number(match[1]) : NaN;
    return Number.isInteger(minutes) && minutes >= 0 && minutes <= 240 ? minutes : null;
}

export function validateFollowUpDetails(value: unknown): LF05FollowUpDetails {
    if (value === undefined) return {};
    if (!isRecord(value) || Object.keys(value).some((key) => !["commute_minutes", "transport_mode", "active_mode", "destination"].includes(key)) ||
        (value.commute_minutes !== undefined && (typeof value.commute_minutes !== "number" || !Number.isInteger(value.commute_minutes) || value.commute_minutes < 0 || value.commute_minutes > 240)) ||
        (value.transport_mode !== undefined && (typeof value.transport_mode !== "string" || !["transit", "motorcycle", "car", "active"].includes(value.transport_mode)))) {
        throw new Error("INVALID_CLARIFICATION_ANSWERS");
    }
    if (value.active_mode !== undefined && (value.transport_mode !== "active" || (value.active_mode !== "walk" && value.active_mode !== "bicycle")))
        throw new Error("INVALID_CLARIFICATION_ANSWERS");
    if (value.destination !== undefined && !isLF05Destination(value.destination)) throw new Error("INVALID_CLARIFICATION_ANSWERS");
    if (SENSITIVE_TEXT.test(JSON.stringify(value))) throw new Error("SENSITIVE_ONBOARDING_INPUT");
    return value as LF05FollowUpDetails;
}

// A field binding identifies explicit input, never a model inference or confirmation.
export function validateClarificationAnswers(value: unknown): LF05ClarificationAnswer[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 20 || value.some((item) =>
        !isRecord(item) || Object.keys(item).some((key) => !["question", "answer", "field"].includes(key)) ||
        (item.field !== undefined && !["commute_minutes", "transport_mode"].includes(String(item.field))) ||
        typeof item.question !== "string" || !item.question.trim() || item.question.length > 4000 ||
        typeof item.answer !== "string" || !item.answer.trim() || item.answer.length > 1000)) {
        throw new Error("INVALID_CLARIFICATION_ANSWERS");
    }
    const answers = (value as LF05ClarificationAnswer[]).map(({ question, answer, field }) => {
        const detected = getLF05ClarificationField(question);
        const boundField = field ?? (detected === "commute_minutes" || detected === "transport_mode" ? detected : undefined);
        const minutes = boundField === "commute_minutes" ? parseLF05CommuteAnswer(answer) : null;
        const transport = boundField === "transport_mode" ? parseLF05TransportAnswer(answer) : null;
        if ((boundField === "commute_minutes" && minutes === null) || (boundField === "transport_mode" && transport === null)) throw new Error("INVALID_CLARIFICATION_ANSWERS");
        const activeMode = transport === "active" ? extractLF05ActiveMode(answer) : null;
        return { question: question.trim(), answer: boundField === "commute_minutes" ? `${minutes} menit` : activeMode ?? transport ?? answer.trim(), ...(boundField ? { field: boundField } : {}) };
    });
    if (new Set(answers.map((item) => item.question)).size !== answers.length) throw new Error("INVALID_CLARIFICATION_ANSWERS");
    return answers;
}

export function resolveLF05FollowUpDetails(answers: LF05ClarificationAnswer[], details: LF05FollowUpDetails, story = ""): LF05FollowUpDetails {
    const explicit = { ...validateFollowUpDetails(details) };
    for (const item of validateClarificationAnswers(answers)) {
        if (item.field === "commute_minutes" && explicit.commute_minutes === undefined) explicit.commute_minutes = parseLF05CommuteAnswer(item.answer)!;
        if (item.field === "transport_mode" && explicit.transport_mode === undefined) {
            explicit.transport_mode = parseLF05TransportAnswer(item.answer)!;
            const activeMode = extractLF05ActiveMode(item.answer);
            if (explicit.transport_mode === "active" && activeMode) explicit.active_mode = activeMode;
        }
    }
    const storyTransport = extractLF05TransportMode(story);
    if (explicit.transport_mode === undefined && storyTransport) {
        explicit.transport_mode = storyTransport;
        const activeMode = extractLF05ActiveMode(story);
        if (storyTransport === "active" && activeMode) explicit.active_mode = activeMode;
    }
    return explicit;
}

export function groundLF05Transport(proposal: LF05ProposedProfile, story: string, details: LF05FollowUpDetails = {}): LF05ProposedProfile {
    const hard = { ...proposal.hard_constraints };
    const soft = { ...proposal.soft_preferences };
    const transport = details.transport_mode ?? extractLF05TransportMode(story);
    delete hard.transport_mode;
    delete soft.transport_mode;
    delete hard.active_mode;
    delete soft.active_mode;
    if (transport) soft.transport_mode = transport;
    // An explicit generic active follow-up overrides the story subtype as ambiguous.
    const activeMode = details.active_mode ?? (details.transport_mode === undefined ? extractLF05ActiveMode(story) : null);
    if (transport === "active" && activeMode) soft.active_mode = activeMode;
    return { ...proposal, hard_constraints: hard, soft_preferences: soft,
        inferred_fields: proposal.inferred_fields.filter((field) => field !== "transport_mode" && field !== "active_mode") };
}

export function applyLF05ExplicitDetails(proposal: LF05ProposedProfile, goal?: RelocationGoal, details: LF05FollowUpDetails = {}): LF05ProposedProfile {
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

// A value the user corrected on the review step replaces LF-05's and is no longer an inference.
export function applyLF05FieldEdit(proposal: LF05ProposedProfile, field: string, value: unknown): LF05ProposedProfile {
    const hard = { ...proposal.hard_constraints };
    const soft = { ...proposal.soft_preferences };
    const inSoft = Object.hasOwn(soft, field) && !Object.hasOwn(hard, field);
    // New values follow applyLF05ExplicitDetails: places and travel mode are preferences, the rest constraints.
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
    }
    return { ...proposal, hard_constraints: hard, soft_preferences: soft,
        inferred_fields: proposal.inferred_fields.filter((item) => item !== field && !(field === "transport_mode" && item === "active_mode")) };
}

export function getLF05TargetCity(proposal: LF05ProposedProfile | null, story: string): string | null {
    const cities = proposal?.hard_constraints.destination_cities ?? proposal?.soft_preferences.destination_cities;
    const city = Array.isArray(cities) ? cities.find((item) => typeof item === "string" && item.trim()) : typeof cities === "string" ? cities : null;
    return typeof city === "string" ? onboardingTaxonomy.areas?.find((area) => area.id === city)?.label ?? city : extractUserProfile(story).targetCity;
}

export function getLF05ClarificationQuestions(proposal: LF05ProposedProfile, story: string, answers: LF05ClarificationAnswer[] = [], goal?: RelocationGoal, details: LF05FollowUpDetails = {}): string[] {
    const answered = new Set(answers.map(({ question }) => question.trim()));
    const destinationAnswered = !!details.destination || answers.some(({ question }) => getLF05ClarificationField(question) === "destination");
    const questions = proposal.clarification_questions.filter((question) => {
        const field = getLF05ClarificationField(question);
        if (field === "transport_mode") return false; // One deterministic question, never a model-picked mode.
        return !answered.has(question.trim()) && !(field === "goal" && goal) && !(field === "destination" && destinationAnswered) && !(field && Object.hasOwn(details, field));
    });
    const transport = resolveLF05FollowUpDetails(answers, details, story).transport_mode;
    if (!transport) questions.push(getLF05TransportQuestion());
    const destination = proposal.hard_constraints.destination ?? proposal.soft_preferences.destination;
    const city = getLF05TargetCity(proposal, story);
    const hasSpecificDestination = isRecord(destination) && destination.precision !== "city" && typeof destination.name === "string" && destination.name.toLowerCase() !== city?.toLowerCase();
    if (!hasSpecificDestination && !destinationAnswered && !questions.some((question) => getLF05ClarificationField(question) === "destination")) {
        questions.push(city ? `Sudah tahu lokasi tujuan spesifik di ${city}?` : "Sudah tahu lokasi tujuanmu?");
    }
    return [...new Set(questions)];
}

export function buildLF05Message(message: string, answers: LF05ClarificationAnswer[]): string {
    const combined = answers.length ? `${message.trim()}\n\nJawaban pertanyaan lanjutan:\n${answers.map(({ question, answer }) => `${question}\nJawaban: ${answer}`).join("\n\n")}` : message.trim();
    if (combined.length > 12000) throw new Error("INVALID_CLARIFICATION_ANSWERS");
    if (SENSITIVE_TEXT.test(combined)) throw new Error("SENSITIVE_ONBOARDING_INPUT");
    return combined;
}

// Screen and send exactly the same combined input, including structured choices.
export function buildLF05FollowUpMessage(message: string, answers: LF05ClarificationAnswer[], goal?: RelocationGoal, details: LF05FollowUpDetails = {}): string {
    const followUps = [...validateClarificationAnswers(answers)];
    if (goal) {
        const index = followUps.findIndex((item) => item.question === "Tujuan pindah");
        if (index >= 0) followUps.splice(index, 1);
        followUps.push({ question: "Tujuan pindah", answer: relocationGoalLabels[goal] });
    }
    if (details.commute_minutes !== undefined) followUps.push({ question: "Batas waktu tempuh sekali jalan", answer: `${details.commute_minutes} menit` });
    if (details.transport_mode) followUps.push({ question: "Moda transportasi", answer: details.active_mode ?? details.transport_mode });
    if (details.destination) followUps.push({ question: "Lokasi tujuan", answer: JSON.stringify(details.destination) });
    return buildLF05Message(message, followUps);
}
