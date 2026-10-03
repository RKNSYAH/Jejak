import { demoDestinations, initialFormAnswers } from "./demoData";
import type { FormAnswers, FormSession, FormStep, Housing, Priority, Weights } from "./types";
import { isCentroid, isRegionCode } from "../lib/zoneGeometry";

export const priorityKeys: Priority[] = ["opportunity", "affordability", "mobility", "environment"];

export function redistributeWeights(weights: Weights, key: Priority, value: number): Weights {
    const chosen = Math.max(0, Math.min(100, Math.round(value)));
    const others = priorityKeys.filter((candidate) => candidate !== key);
    const remaining = 100 - chosen;
    const oldTotal = others.reduce((sum, candidate) => sum + weights[candidate], 0);
    const shares = others.map((candidate) => ({
        key: candidate, value: remaining * (oldTotal ? weights[candidate] / oldTotal : 1 / others.length),
    }));
    const result = { ...weights, [key]: chosen };
    shares.forEach((share) => { result[share.key] = Math.floor(share.value); });
    const missing = remaining - shares.reduce((sum, share) => sum + Math.floor(share.value), 0);
    shares.sort((a, b) => (b.value % 1) - (a.value % 1));
    for (let index = 0; index < missing; index++) result[shares[index].key]++;
    return result;
}

// Priorities suggested by steps 1-3. Neutral answers (the form defaults) give 40/30/20/10; a hard
// budget cap or tight budget lifts affordability, a short commute, walking or a fixed destination
// lifts mobility, and wanting both work and study lifts opportunity.
export function suggestWeights(answers: FormAnswers): Weights {
    const raw: Weights = {
        opportunity: answers.goal === "both" ? 45 : 40,
        affordability: 30 + (answers.overBudget === "hide" ? 10 : 0) + (answers.monthlyBudget < 4_000_000 ? 10 : 0),
        mobility: 20 + { 15: 15, 30: 8, 45: 0, 60: -8 }[answers.commuteMinutes] + (answers.transport === "active" ? 5 : 0) +
            (answers.destinationPoint || answers.destinationId ? 5 : 0),
        environment: 10,
    };
    const total = priorityKeys.reduce((sum, key) => sum + raw[key], 0);
    return redistributeWeights(raw, "opportunity", Math.round(raw.opportunity / total * 100));
}

// Weights track the suggestion until the user edits a slider; after that they differ from it and stay put.
export function followSuggestedWeights(before: FormAnswers, after: FormAnswers): FormAnswers {
    const suggested = suggestWeights(before);
    return after.weights === before.weights && priorityKeys.every((key) => before.weights[key] === suggested[key])
        ? { ...after, weights: suggestWeights(after) } : after;
}

export function toggleHousing(current: Housing[], choice: Housing): Housing[] {
    if (choice === "unsure") return ["unsure"];
    const selected = current.filter((item) => item !== "unsure");
    return selected.includes(choice) ? selected.filter((item) => item !== choice) : [...selected, choice];
}

// A completed form keeps showing the final (priorities) step on the map.
export function displayStep(session: FormSession): FormStep {
    return session.status === "completed" ? 4 : session.step;
}

export function validateFormStep(answers: FormAnswers, step: FormStep): Record<string, string> {
    const errors: Record<string, string> = {};
    if (step === 1) {
        if (answers.goal !== "study" && !answers.occupation.trim()) errors.occupation = "Isi pekerjaan atau bidang kariermu.";
        if (answers.goal !== "work" && !answers.studyField.trim()) errors.studyField = "Isi bidang yang ingin kamu pelajari.";
    }
    if (step === 2) {
        if (!Number.isSafeInteger(answers.monthlyBudget) || answers.monthlyBudget <= 0 || answers.monthlyBudget > 1_000_000_000) {
            errors.monthlyBudget = "Isi anggaran bulanan antara Rp1 dan Rp1 miliar.";
        }
        if (!Number.isSafeInteger(answers.maximumRent) || answers.maximumRent <= 0 || answers.maximumRent > 1_000_000_000) {
            errors.maximumRent = "Isi batas sewa antara Rp1 dan Rp1 miliar.";
        } else if (answers.maximumRent > answers.monthlyBudget) {
            errors.maximumRent = "Batas sewa tidak boleh melebihi anggaran hidup.";
        }
        if (!answers.housing.length) errors.housing = "Pilih jenis hunian, atau pilih Belum yakin.";
    }
    return errors;
}

export function parseFormSession(value: unknown): FormSession | null {
    if (!value || typeof value !== "object") return null;
    const session = value as FormSession;
    const a = session.answers;
    const extras = a?.extras === undefined ? [] : a.extras;
    if (session.version !== 1 || !["active", "paused", "skipped", "completed"].includes(session.status) ||
        ![1, 2, 3, 4].includes(session.step) || !a || typeof a !== "object") return null;
    const choices: Record<string, readonly unknown[]> = {
        goal: ["work", "study", "both"],
        experience: [undefined, null, "graduate", "early", "experienced"], overBudget: ["mark", "hide"],
        transport: ["transit", "motorcycle", "car", "active"], commuteMinutes: [15, 30, 45, 60],
        departure: ["morning", "midday", "evening", "flexible"],
    };
    for (const [key, options] of Object.entries(choices)) if (!options.includes(a[key as keyof FormAnswers])) return null;
    if (typeof a.city !== "string" || a.city !== "unsure" && !isRegionCode(a.city)) return null;
    if (![a.occupation, a.studyField, a.education].every((text) => typeof text === "string" && text.length <= 200) ||
        (a.sector !== null && (typeof a.sector !== "string" || a.sector.length > 200)) ||
        (a.destinationId != null && (typeof a.destinationId !== "string" || a.destinationId.length > 200 ||
            (!/^[a-z0-9]+(?:-[a-z0-9]+)*:\d+$/.test(a.destinationId) && !demoDestinations.some((item) => item.id === a.destinationId)))) ||
        (a.destinationName != null && (typeof a.destinationName !== "string" || a.destinationName.length > 200)) ||
        (a.destinationPoint != null && !isCentroid(a.destinationPoint)) ||
        ![a.monthlyBudget, a.maximumRent].every((amount) => Number.isSafeInteger(amount) && amount >= 0 && amount <= 1_000_000_000) ||
        !Array.isArray(a.housing) || a.housing.some((item) => !["kos", "apartment", "house", "unsure"].includes(item)) ||
        new Set(a.housing).size !== a.housing.length || (a.housing.includes("unsure") && a.housing.length !== 1) ||
        !Array.isArray(extras) || extras.some((item) => !["internet", "healthcare", "quiet"].includes(item)) ||
        new Set(extras).size !== extras.length ||
        !a.weights || priorityKeys.some((key) => !Number.isInteger(a.weights[key]) || a.weights[key] < 0 || a.weights[key] > 100) ||
        priorityKeys.reduce((sum, key) => sum + a.weights[key], 0) !== 100) return null;
    if (session.status === "completed" && [1, 2, 3, 4].some((step) => Object.keys(validateFormStep(a, step as FormStep)).length)) return null;
    const answers = { ...initialFormAnswers, ...a, experience: a.experience ?? null, extras: [...extras], weights: { ...a.weights } };
    return { version: 1, status: session.status, step: session.step, answers };
}
