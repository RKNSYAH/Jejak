import type { PersistedRelocationProfile } from "../engine/lib/relocationProfile";

export type PriorityKey = "career" | "education" | "cost" | "mobility" | "environment";
export type ProfilePriorityWeights = Record<PriorityKey, number>;
export type AmountParseResult = { valid: true; value: number | null } | { valid: false; value: null };
export type ProfileChange = { key: string; before: string; after: string };

const CHANGE_LABELS: Record<string, string> = {
    goal: "Tujuan", destination_cities: "Kota tujuan", target_fields: "Bidang kerja", target_occupations: "Pekerjaan",
    study_field: "Bidang studi", education_level: "Pendidikan", monthly_budget: "Anggaran", housing_budget: "Batas sewa",
    commute_minutes: "Perjalanan", housing_types: "Hunian", transport_mode: "Transportasi", destination: "Lokasi tujuan",
    departure_time: "Waktu berangkat", priorities: "Prioritas", work_arrangement: "Pengaturan kerja", career_stage: "Tahap karier",
    language_preferences: "Bahasa", deal_breakers: "Batas tambahan", extras: "Faktor tambahan", over_budget: "Kecamatan di atas anggaran",
};

export function cloneProfile(profile: PersistedRelocationProfile): PersistedRelocationProfile {
    return JSON.parse(JSON.stringify(profile)) as PersistedRelocationProfile;
}

export function readWeights(weights: Record<string, number>): ProfilePriorityWeights {
    return {
        career: weights.career ?? 0,
        education: weights.education ?? 0,
        cost: (weights.housing ?? 0) + (weights.cost_of_living ?? 0),
        mobility: weights.commute ?? 0,
        environment: weights.environment ?? 0,
    };
}

function integerPercentages(weights: ProfilePriorityWeights, enabled: PriorityKey[]): Record<PriorityKey, number> {
    const raw = enabled.map((key) => Math.max(0, weights[key]));
    const total = raw.reduce((sum, value) => sum + value, 0);
    if (!total) return Object.fromEntries(enabled.map((key) => [key, 0])) as Record<PriorityKey, number>;

    const exact = raw.map((value) => value / total * 100);
    const result = exact.map(Math.floor);
    const left = 100 - result.reduce((sum, value) => sum + value, 0);
    const order = exact.map((value, index) => ({ index, remainder: value - result[index] }))
        .sort((a, b) => b.remainder - a.remainder);
    for (let index = 0; index < left; index += 1) result[order[index % order.length].index] += 1;
    return Object.fromEntries(enabled.map((key, index) => [key, result[index]])) as Record<PriorityKey, number>;
}

export function displayedWeights(profile: PersistedRelocationProfile, includeEnvironment = (profile.priority_weights.environment ?? 0) > 0): Record<PriorityKey, number> {
    const weights = readWeights(profile.priority_weights);
    const enabled: PriorityKey[] = ["career", "education", "cost", "mobility"];
    if (includeEnvironment || weights.environment > 0) enabled.push("environment");
    return integerPercentages(weights, enabled);
}

export function updatePriority(
    profile: PersistedRelocationProfile,
    priority: PriorityKey,
    percentage: number,
    includeEnvironment = (profile.priority_weights.environment ?? 0) > 0,
): PersistedRelocationProfile {
    const weights = displayedWeights(profile, includeEnvironment);
    const enabled = Object.keys(weights).filter((key) => weights[key as PriorityKey] !== undefined) as PriorityKey[];
    const next = { ...weights, [priority]: Math.max(0, Math.min(100, Math.round(percentage))) };
    const remainder = 100 - next[priority];
    const otherKeys = enabled.filter((key) => key !== priority);
    const otherTotal = otherKeys.reduce((sum, key) => sum + weights[key], 0);
    const raw: ProfilePriorityWeights = { career: 0, education: 0, cost: 0, mobility: 0, environment: 0 };
    raw[priority] = next[priority];
    for (const key of otherKeys) raw[key] = otherTotal ? weights[key] / otherTotal * remainder : remainder / otherKeys.length;
    const percentages = integerPercentages(raw, enabled);
    const stored: Record<string, number> = { ...profile.priority_weights };
    const costTotal = percentages.cost / 100;
    const previousCost = (profile.priority_weights.housing ?? 0) + (profile.priority_weights.cost_of_living ?? 0);
    const housingShare = previousCost > 0 ? (profile.priority_weights.housing ?? 0) / previousCost : 0.5;
    stored.housing = costTotal * housingShare;
    stored.cost_of_living = costTotal * (1 - housingShare);
    stored.career = percentages.career / 100;
    stored.education = percentages.education / 100;
    stored.commute = percentages.mobility / 100;
    if (enabled.includes("environment")) stored.environment = percentages.environment / 100;
    return { ...profile, priority_weights: stored };
}

export function updateProfileField(
    profile: PersistedRelocationProfile,
    group: "hard_constraints" | "soft_preferences",
    field: string,
    value: unknown,
): PersistedRelocationProfile {
    const destination = { ...profile[group] };
    if (value === undefined) delete destination[field];
    else destination[field] = value;
    return { ...profile, [group]: destination };
}

export function parseAmount(raw: string, maximum = 1_000_000_000): AmountParseResult {
    if (raw === "") return { valid: true, value: null };
    if (!/^\d+$/.test(raw)) return { valid: false, value: null };
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum
        ? { valid: true, value }
        : { valid: false, value: null };
}

export function formatProfileValue(value: unknown): string {
    if (value === null || value === undefined || value === "" || Array.isArray(value) && value.length === 0) return "Belum diisi";
    if (value && typeof value === "object" && "amount" in value && typeof value.amount === "number") {
        return `Rp${new Intl.NumberFormat("id-ID").format(value.amount)} / bulan`;
    }
    if (Array.isArray(value)) return value.map(String).join(", ");
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        if (typeof record.name === "string") return record.name;
        return JSON.stringify(value);
    }
    return String(value);
}

export function summarizeProfileChanges(
    before: PersistedRelocationProfile | null,
    after: PersistedRelocationProfile | null,
    maximum = 2,
    includeEnvironment = (before?.priority_weights.environment ?? 0) > 0,
): { count: number; details: ProfileChange[] } {
    if (!before || !after) return { count: 0, details: [] };
    const changes: ProfileChange[] = [];
    for (const group of ["hard_constraints", "soft_preferences"] as const) {
        const keys = new Set([...Object.keys(before[group]), ...Object.keys(after[group])]);
        for (const key of keys) {
            if (profileFieldsDiffer({ value: before[group][key] }, { value: after[group][key] })) {
                changes.push({ key: CHANGE_LABELS[key] ?? key.replaceAll("_", " "), before: formatProfileValue(before[group][key]), after: formatProfileValue(after[group][key]) });
            }
        }
    }
    if (profileFieldsDiffer(before.priority_weights, after.priority_weights)) {
        const toPriorityLine = (profile: PersistedRelocationProfile) => Object.entries(displayedWeights(profile, includeEnvironment))
            .map(([key, value]) => `${priorityLabel(key)} ${value}%`).join(" · ");
        changes.push({ key: "Prioritas", before: toPriorityLine(before), after: toPriorityLine(after) });
    }
    return { count: changes.length, details: changes.slice(0, maximum) };
}

function priorityLabel(key: string): string {
    return ({ career: "Karier", education: "Pendidikan", cost: "Biaya", mobility: "Mobilitas", environment: "Lingkungan" } as Record<string, string>)[key] ?? key;
}

export function profileStory(profile: PersistedRelocationProfile, catalog: { city_id: string; city_name: string }[] = []): string {
    const hard = profile.hard_constraints;
    const soft = profile.soft_preferences;
    const goal = hard.goal ?? soft.goal;
    const targets = hard.destination_cities ?? soft.destination_cities;
    const cities = Array.isArray(targets) ? targets.map((value) => catalog.find((city) => city.city_id === value)?.city_name ?? value).join(", ") : "";
    const parts = [
        goal === "study" ? "Kamu ingin pindah untuk kuliah" : goal === "work" ? "Kamu ingin pindah untuk bekerja" : goal === "both" ? "Kamu ingin pindah untuk bekerja dan kuliah" : "Kamu sedang merencanakan pindah",
        cities ? `dengan kota tujuan ${cities}` : "tanpa kota tujuan yang dipastikan",
        typeof soft.study_field === "string" && soft.study_field ? `di bidang ${soft.study_field}` : "",
        typeof soft.occupation === "string" && soft.occupation ? `dengan pekerjaan ${soft.occupation}` : "",
    ].filter(Boolean);
    return `${parts.join(" ")}.`;
}

export function profileFieldsDiffer(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const stable = (value: unknown): string => {
        if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
        if (value && typeof value === "object") {
            return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
                .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`).join(",")}}`;
        }
        return JSON.stringify(value);
    };
    return stable(a) !== stable(b);
}
