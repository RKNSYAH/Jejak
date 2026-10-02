import { demoDistricts, demoDestinations, initialFormAnswers } from "./demoData";
import type { DemoDistrict, FormAnswers, FormSession, FormStep, Housing, OnboardingPreview, Priority, Weights } from "./types";
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

export function toggleHousing(current: Housing[], choice: Housing): Housing[] {
    if (choice === "unsure") return ["unsure"];
    const selected = current.filter((item) => item !== "unsure");
    return selected.includes(choice) ? selected.filter((item) => item !== choice) : [...selected, choice];
}

export function availableDestinations(goal: FormAnswers["goal"]) {
    return demoDestinations.filter((destination) => goal === "both" || destination.kind === (goal === "study" ? "campus" : "office"));
}

// A completed form keeps showing the final (priorities) step on the map.
export function displayStep(session: FormSession): FormStep {
    return session.status === "completed" ? 4 : session.step;
}

export function sampleCommute(district: DemoDistrict, answers: FormAnswers): number | null {
    if (!answers.destinationId) return null;
    const base = district.commute[answers.destinationId];
    if (base === undefined) return null;
    const modeFactor = { transit: 1, motorcycle: 0.7, car: 0.95, active: 2.4 }[answers.transport];
    const timeFactor = { morning: 1, midday: 0.8, evening: 1.12, flexible: 0.9 }[answers.departure];
    return Math.max(5, Math.round(base * modeFactor * timeFactor));
}

export function evaluateOnboarding(answers: FormAnswers, step: FormStep = 4): OnboardingPreview {
    const available = answers.city === "jakarta-selatan" || answers.city === "unsure";
    if (!available) return { available, districts: [], ranked: [], affordableCount: 0, eligibleCount: 0 };
    const housing = answers.housing.filter((item): item is Exclude<Housing, "unsure"> => item !== "unsure");
    const types = housing.length ? housing : ["kos", "apartment", "house"] as const;
    const transportCost = { transit: 450_000, motorcycle: 650_000, car: 1_100_000, active: 150_000 }[answers.transport];
    const districts = demoDistricts.map((district) => {
        const rent = Math.min(...types.map((type) => district.rent[type]));
        const monthlyCost = rent + district.otherCosts + transportCost;
        const commuteMinutes = sampleCommute(district, answers);
        const exclusions: string[] = [];
        if (step >= 2) {
            if (rent > answers.maximumRent) exclusions.push("Sewa contoh melebihi batas");
            if (monthlyCost > answers.monthlyBudget) exclusions.push("Biaya bulanan contoh melebihi anggaran");
        }
        if (step >= 3 && commuteMinutes !== null && commuteMinutes > answers.commuteMinutes) {
            exclusions.push("Perjalanan contoh melebihi batas");
        }
        const opportunity = answers.goal === "study" ? district.education : answers.goal === "both"
            ? (district.education + district.career) / 2 : district.career;
        const affordability = Math.max(0, 100 - rent / Math.max(answers.maximumRent, 1) * 35);
        const mobility = commuteMinutes === null ? 50 : Math.max(0, 100 - commuteMinutes);
        const extraMatches = answers.extras.filter((extra) => district.extras.includes(extra)).length;
        const environment = Math.min(100, district.environment + extraMatches * 3);
        const score = Math.round((opportunity * answers.weights.opportunity + affordability * answers.weights.affordability +
            mobility * answers.weights.mobility + environment * answers.weights.environment) / 100);
        const reasons = ["Sewa contoh dalam batasmu", "Biaya bulanan contoh sesuai anggaran"];
        if (commuteMinutes !== null) reasons.push(`Perjalanan contoh ${commuteMinutes} menit`);
        if (extraMatches) reasons.push(`${extraMatches} preferensi tambahan cocok`);
        return { district, rent, monthlyCost, commuteMinutes, exclusions, eligible: !exclusions.length, score, reasons, rank: null as number | null };
    });
    const ranked = districts.filter((item) => item.eligible).sort((a, b) => b.score - a.score || a.district.id.localeCompare(b.district.id));
    ranked.forEach((item, index) => { item.rank = index + 1; });
    return {
        available, districts, ranked, eligibleCount: ranked.length,
        affordableCount: districts.filter((item) => item.rent <= answers.maximumRent && item.monthlyCost <= answers.monthlyBudget).length,
    };
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
