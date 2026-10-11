import type { PersistedRelocationProfile } from "../lib/relocationProfile";
import { getRelocationGoal } from "../lib/relocationGoal";
import { isRecord } from "../lib/zoneGeometry";
import { formatProfileValue, priorityLabels } from "./demoData";
import type { LiveOnboardingPreview } from "./types";

export type ConfirmationProfile = Pick<PersistedRelocationProfile, "hard_constraints" | "soft_preferences" | "priority_weights">;

const compactMoney = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

function profileValue(profile: Pick<ConfirmationProfile, "hard_constraints" | "soft_preferences">, field: string): unknown {
    return profile.hard_constraints[field] ?? profile.soft_preferences[field];
}

function isMissing(value: unknown): boolean {
    return value === undefined || value === null || value === "" || Array.isArray(value) && value.length === 0;
}

export function formatProfileChip(field: string, profile: Pick<ConfirmationProfile, "hard_constraints" | "soft_preferences">, destinationLabel: string) {
    const soft = profile.soft_preferences;
    const value = profileValue(profile, field);
    if (field === "goal") {
        const job = typeof soft.occupation === "string" && soft.occupation.trim() ? soft.occupation.trim()
            : Array.isArray(soft.target_occupations) && soft.target_occupations.length ? formatProfileValue("target_occupations", soft.target_occupations) : null;
        return job ? `${formatProfileValue(field, value)} · ${job}` : formatProfileValue(field, value);
    }
    if (field === "housing_budget" && isRecord(value) && typeof value.amount === "number") {
        const types = Array.isArray(soft.housing_types) ? soft.housing_types.filter((type) => type !== "unsure") : [];
        return `${types.length === 1 ? formatProfileValue("housing_types", types) : "Sewa"} ≤ Rp${compactMoney.format(value.amount)}`;
    }
    if (field === "commute_minutes" && typeof value === "number") return `≤ ${value} mnt ke ${destinationLabel.toLowerCase()}`;
    return formatProfileValue(field, value);
}

export function profileChips(profile: ConfirmationProfile): string[] {
    const chips = ["goal", "destination_cities", "housing_budget"]
        .filter((field) => !isMissing(profileValue(profile, field)))
        .map((field) => formatProfileChip(field, profile, ""));
    const commute = profileValue(profile, "commute_minutes");
    if (typeof commute === "number") chips.push(`≤ ${commute} mnt`);
    const [top] = Object.entries(profile.priority_weights).sort(([, a], [, b]) => b - a);
    if (top && top[1] > 0) chips.push(`${priorityLabels[top[0]] ?? top[0]} ${Math.round(top[1] * 100)}%`);
    return chips;
}

export function missingProfileItems(profile: ConfirmationProfile, inferredFields: string[] = []): string[] {
    const goal = getRelocationGoal(profile);
    const destination = profileValue(profile, "destination");
    const items: [boolean, string][] = [
        [isMissing(profileValue(profile, "destination_cities")), "Kota tujuan"],
        [isMissing(profileValue(profile, "monthly_budget")), "Anggaran bulanan"],
        [isMissing(profileValue(profile, "housing_budget")), "Batas sewa"],
        [isMissing(profileValue(profile, "commute_minutes")), "Waktu tempuh"],
        [isMissing(profileValue(profile, "transport_mode")), "Moda transportasi"],
        [!isRecord(destination) || destination.precision === "city", `Lokasi ${goal === "study" ? "kampus" : goal === "both" ? "tujuan" : "kantor"}`],
        [!Object.values(profile.priority_weights).some((weight) => weight > 0), "Prioritas"],
        [inferredFields.includes("priorities"), "Prioritas belum dikonfirmasi"],
    ];
    return items.filter(([missing]) => missing).map(([, label]) => label);
}

export function profileFeasibility(preview: Pick<LiveOnboardingPreview, "available" | "districts" | "eligibleCount"> | null) {
    if (!preview?.available || !preview.districts.some((item) => item.eligible !== null)) return { level: 0, label: "Belum dihitung" };
    // ponytail: fixed counts of kecamatan that pass every limit; calibrate once ranking has outcome data.
    if (preview.eligibleCount >= 3) return { level: 3, label: "Realistis" };
    return preview.eligibleCount > 0 ? { level: 2, label: "Ketat" } : { level: 1, label: "Sulit" };
}
