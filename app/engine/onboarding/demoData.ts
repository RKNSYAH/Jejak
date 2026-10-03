import type { DemoDestination, FormAnswers, Weights } from "./types";

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
export const getDestination = (id: string | null) => demoDestinations.find((item) => item.id === id);
export const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);
