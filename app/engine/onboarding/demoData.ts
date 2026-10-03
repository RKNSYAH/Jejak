import type { DemoDestination, DemoDistrict, FormAnswers, Weights } from "./types";

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
export const cityCenters = {
    "jakarta-selatan": [106.812, -6.27], bandung: [107.6191, -6.9175],
    yogyakarta: [110.3695, -7.7956], unsure: [106.812, -6.27],
} satisfies Record<string, [number, number]>;
export const cityLabels = { "jakarta-selatan": "Jakarta Selatan", bandung: "Bandung", yogyakarta: "Yogyakarta", unsure: "Belum yakin" };
export const transportLabels = { transit: "transport umum", motorcycle: "motor", car: "mobil", active: "jalan kaki" };
export const getDestination = (id: string | null) => demoDestinations.find((item) => item.id === id);
export const formatRupiah = (value: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(value);

function district(id: string, name: string, center: [number, number], rent: number, career: number,
    education: number, environment: number, times: number[], extras: DemoDistrict["extras"]): DemoDistrict {
    return {
        id, name, center, rent: { kos: rent, apartment: rent + 1_400_000, house: rent + 600_000 },
        otherCosts: 1_950_000, career, education, environment,
        commute: Object.fromEntries(demoDestinations.map((destination, index) => [destination.id, times[index]])),
        extras, is_sample: true,
    };
}

// Synthetic values for interaction testing, not observed rents, opportunities, or routing evidence.
export const demoDistricts: DemoDistrict[] = [
    district("pesanggrahan", "Pesanggrahan", [106.755, -6.256], 1_500_000, 45, 55, 65, [58, 48, 40, 60, 42], ["quiet"]),
    district("kebayoran-lama", "Kebayoran Lama", [106.782, -6.249], 1_900_000, 62, 65, 70, [48, 35, 35, 49, 30], ["healthcare"]),
    district("kebayoran-baru", "Kebayoran Baru", [106.799, -6.242], 3_200_000, 94, 75, 80, [30, 15, 37, 42, 35], ["internet", "healthcare"]),
    district("setiabudi", "Setiabudi", [106.825, -6.215], 3_100_000, 98, 70, 45, [15, 25, 50, 48, 55], ["internet", "healthcare"]),
    district("tebet", "Tebet", [106.853, -6.234], 2_400_000, 96, 78, 78, [20, 32, 40, 30, 50], ["internet", "healthcare"]),
    district("mampang-prapatan", "Mampang Prapatan", [106.820, -6.251], 2_100_000, 78, 60, 65, [25, 22, 30, 35, 40], ["internet"]),
    district("pancoran", "Pancoran", [106.841, -6.258], 1_800_000, 85, 72, 64, [30, 38, 32, 22, 42], ["internet", "healthcare"]),
    district("cilandak", "Cilandak", [106.800, -6.291], 1_900_000, 65, 90, 88, [46, 40, 15, 30, 15], ["internet", "quiet"]),
    district("pasar-minggu", "Pasar Minggu", [106.833, -6.289], 1_700_000, 68, 92, 80, [40, 45, 20, 15, 28], ["quiet", "healthcare"]),
    district("jagakarsa", "Jagakarsa", [106.820, -6.331], 1_400_000, 35, 88, 96, [55, 60, 25, 30, 28], ["quiet"]),
];
