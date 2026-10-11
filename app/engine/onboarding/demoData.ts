import { onboardingTaxonomy } from "../extractUserProfile";
import { relocationGoalLabels } from "../lib/relocationGoal";
import { isRecord } from "../lib/zoneGeometry";
import type { DemoDestination, FormAnswers, Housing, Weights } from "./types";

export const defaultWeights: Weights = { opportunity: 40, affordability: 30, mobility: 20, environment: 10 };
export const defaultAnswers: FormAnswers = {
    goal: "work", occupation: "Software engineer", sector: null, studyField: "Teknologi informasi", education: "S1",
    city: "jakarta-selatan", experience: "early", monthlyBudget: 6_000_000, maximumRent: 2_500_000,
    overBudget: "mark", housing: ["kos"], destinationId: "kuningan", destinationName: null, destinationPoint: null, transport: "transit",
    commuteMinutes: 45, departure: "morning", weights: defaultWeights, extras: ["internet"],
};

// Interactive onboarding does not infer a destination or removed optional preferences.
export const initialFormAnswers: FormAnswers = {
    ...defaultAnswers,
    destinationId: null,
    experience: null,
    extras: [],
};

// Office points represent areas, not exact buildings. Campus points are illustrative area anchors.
export const demoDestinations: DemoDestination[] = [
    { id: "kuningan", name: "Kuningan", center: [106.8304, -6.2297], kind: "office" },
    { id: "scbd", name: "SCBD", center: [106.8098, -6.2253], kind: "office" },
    { id: "simatupang", name: "TB Simatupang", center: [106.8008, -6.2912], kind: "office" },
    { id: "campus-pasar-minggu", name: "Kawasan kampus Pasar Minggu", center: [106.837, -6.299], kind: "campus" },
    { id: "campus-cilandak", name: "Kawasan kampus Cilandak", center: [106.794, -6.313], kind: "campus" },
];
export const transportLabels = { transit: "transport umum", motorcycle: "motor", car: "mobil", active: "jalan kaki" };
// Capitalised labels for form options, review rows and settings; walk/bicycle refine a saved "active" mode.
export const transportModeLabels: Record<string, string> = {
    transit: "Transport umum", motorcycle: "Motor", car: "Mobil", active: "Aktif · belum dibedakan",
    walk: "Jalan kaki", bicycle: "Sepeda · rute belum didukung",
};
export const housingLabels: Record<Housing, string> = { kos: "Kos", apartment: "Apartemen", house: "Rumah", unsure: "Belum yakin" };
export const departureLabels: Record<FormAnswers["departure"], string> = { morning: "Pagi", midday: "Siang", evening: "Sore atau malam", flexible: "Fleksibel" };
export const overBudgetLabels: Record<FormAnswers["overBudget"], string> = { mark: "Tampilkan dan tandai", hide: "Sembunyikan" };
export const priorityLabels: Record<string, string> = {
    career: "Karier", education: "Pendidikan", housing: "Biaya hunian",
    cost_of_living: "Biaya hidup", commute: "Waktu tempuh", environment: "Lingkungan",
};
export const getDestination = (id: string | null) => demoDestinations.find((item) => item.id === id);
export const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);

const taxonomyLabels = (entries: { id: string; label: string }[] = []) => Object.fromEntries(entries.map(({ id, label }) => [id, label]));
const valueLabels: Record<string, Record<string, string>> = {
    goal: relocationGoalLabels, transport_mode: transportModeLabels, active_mode: transportModeLabels,
    departure_time: departureLabels, over_budget: overBudgetLabels, housing_types: housingLabels,
    extras: { internet: "Internet", healthcare: "Layanan kesehatan", quiet: "Lingkungan tenang" },
    target_occupations: taxonomyLabels(onboardingTaxonomy.occupations), target_fields: taxonomyLabels(onboardingTaxonomy.sectors),
    destination_cities: taxonomyLabels(onboardingTaxonomy.areas),
};

export function formatProfileValue(field: string, value: unknown): string {
    if (value === null || value === undefined || value === "" || Array.isArray(value) && value.length === 0) return "Belum diisi";
    if (isRecord(value) && typeof value.amount === "number") return `Rp${formatRupiah(value.amount)} per bulan`;
    if (isRecord(value) && typeof value.name === "string") return `${value.name}${value.precision === "point" ? " · titik peta" : ""}`;
    if (field === "commute_minutes" && typeof value === "number") return `${value} menit sekali jalan`;
    const label = (item: unknown) => valueLabels[field]?.[String(item)] ?? String(item);
    if (Array.isArray(value)) return value.map(label).join(", ");
    return isRecord(value) ? JSON.stringify(value) : label(value);
}
