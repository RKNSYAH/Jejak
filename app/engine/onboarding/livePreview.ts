import type { MapCategory, RegionFact } from "../types";
import { getRelocationGoal } from "../lib/relocationGoal";
import { isRecord } from "../lib/zoneGeometry";
import type { PersistedRelocationProfile } from "../lib/relocationProfile";
import type {
    FormAnswers,
    FormStep,
    Housing,
    LiveDistrictRecommendation,
    LiveOnboardingPreview,
    LivePreviewPreferences,
    OnboardingArea,
    OnboardingCampus,
    OnboardingCity,
} from "./types";

export type PreviewInput = {
    cities: OnboardingCity[];
    areas: OnboardingArea[];
    destinations: OnboardingCampus[];
};

const housingTypes: Exclude<Housing, "unsure">[] = ["kos", "apartment"];

// Use 10% margin for the budget
export const BUDGET_MARGIN = 0.1;

function withinBudget(value: number, limit: number): boolean {
    return value <= limit * (1 + BUDGET_MARGIN);
}

function amount(value: unknown): number | null {
    const raw = isRecord(value) ? value.amount : value;
    return typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : null;
}

function cityKey(value: string): string {
    return value.toLowerCase().trim().replace(/^(kota|kabupaten|kab\.)\s+(administrasi|adm\.?)?\s*/, "")
        .replace(/[^a-z0-9]+/g, " ").trim();
}

function valueWeight(weights: Record<string, number>, keys: string[]): number {
    return keys.reduce((sum, key) => sum + (typeof weights[key] === "number" && Number.isFinite(weights[key]) ? Math.max(0, weights[key]) : 0), 0);
}

function normalizedWeights(raw: [number, number, number, number]): LivePreviewPreferences["weights"] {
    const total = raw.reduce((sum, value) => sum + value, 0);
    if (!total) return { opportunity: 0, affordability: 0, mobility: 0, environment: 0 };
    const values = raw.map((value) => value / total * 100);
    return {
        opportunity: Math.round(values[0]), affordability: Math.round(values[1]),
        mobility: Math.round(values[2]), environment: Math.round(values[3]),
    };
}

export function profilePreviewPreferences(profile: PersistedRelocationProfile, cities: OnboardingCity[]): LivePreviewPreferences | null {
    const hard = profile.hard_constraints;
    const soft = profile.soft_preferences;
    const targets = Array.isArray(hard.destination_cities) ? hard.destination_cities.filter((item): item is string => typeof item === "string") : [];
    const normalizedTargets = new Set(targets.map(cityKey).filter(Boolean));
    const matches = cities.filter((city) => normalizedTargets.has(cityKey(city.city_id)) || normalizedTargets.has(cityKey(city.city_name)));
    const cityId = matches.length === 1 ? matches[0].city_id : null;
    const rawHousing = Array.isArray(soft.housing_types) ? soft.housing_types : [];
    const housing = rawHousing.filter((item): item is Housing => item === "kos" || item === "apartment" || item === "house" || item === "unsure");
    const destinationValue = isRecord(soft.destination) ? soft.destination : hard.destination;
    const rawDestination = isRecord(destinationValue) ? destinationValue : null;
    const latitude = rawDestination && typeof rawDestination.latitude === "number" ? rawDestination.latitude : null;
    const longitude = rawDestination && typeof rawDestination.longitude === "number" ? rawDestination.longitude : null;
    const destinationPoint: [number, number] | null = latitude !== null && longitude !== null &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? [longitude, latitude] : null;
    const mode = soft.transport_mode;
    const transport = mode === "transit" || mode === "motorcycle" || mode === "car" || mode === "active" ? mode : null;
    const goal = getRelocationGoal({ hard_constraints: hard, soft_preferences: soft });
    if (!goal) return null;
    const weights = profile.priority_weights;
    return {
        goal,
        cityId,
        monthlyBudget: amount(hard.monthly_budget),
        maximumRent: amount(hard.housing_budget),
        housing,
        destinationId: null,
        destinationName: rawDestination && typeof rawDestination.name === "string" ? rawDestination.name : null,
        destinationPoint,
        transport,
        commuteMinutes: typeof hard.commute_minutes === "number" && Number.isFinite(hard.commute_minutes) ? hard.commute_minutes : null,
        overBudget: "mark",
        weights: normalizedWeights([
            valueWeight(weights, ["career", "education"]),
            valueWeight(weights, ["housing", "cost_of_living"]),
            valueWeight(weights, ["commute"]),
            valueWeight(weights, ["environment"]),
        ]),
    };
}

function housingType(fact: RegionFact): string | null {
    if (fact.dimension_key === "housing_type" && fact.dimension_value) return fact.dimension_value.toLowerCase();
    const suffix = fact.metric.split(":")[1];
    if (suffix) return suffix.toLowerCase();
    return fact.metric === "median_monthly_rent_idr" ? "kos" : null;
}

function rentFacts(area: OnboardingArea, selected: Housing[]) {
    const requested = selected.includes("unsure") || selected.length === 0 ? housingTypes : selected;
    return area.facts.filter((fact) => fact.metric.split(":")[0] === "median_monthly_rent_idr" &&
        requested.includes(housingType(fact) as Exclude<Housing, "unsure">));
}

function numericFact(area: OnboardingArea, metric: string): RegionFact | null {
    return area.facts.find((fact) => fact.metric === metric) ?? null;
}

export function isLiveRecommendationSample(item: Pick<LiveDistrictRecommendation, "district" | "rentFact">): boolean {
    return item.district.is_sample || item.rentFact?.is_sample === true || item.district.living_cost?.is_sample === true ||
        item.district.facts.some((fact) => fact.is_sample) || item.district.campuses.some((campus) => campus.is_sample);
}

const COST_ROUNDING = 500_000;

// `high` is null when no district fits the budget; only the cheapest starting cost is known then.
export type MonthlyCostRange = { low: number; high: number | null; is_sample: boolean };

// Estimated monthly spending (cheapest requested rent + city living cost) across the districts that fit the
// user's budget, widened to whole Rp500.000 steps so it reads as an estimate rather than an exact figure.
// Without a budget every priced district counts.
export function monthlyCostRange(preview: Pick<LiveOnboardingPreview, "districts">): MonthlyCostRange | null {
    const priced = preview.districts.filter((item): item is LiveDistrictRecommendation & { monthlyCost: number } => item.monthlyCost !== null);
    if (!priced.length) return null;
    const budgeted = priced.some((item) => item.eligible !== null);
    const fitting = budgeted ? priced.filter((item) => item.eligible === true) : priced;
    const counted = fitting.length ? fitting : priced;
    const costs = counted.map((item) => item.monthlyCost);
    return {
        low: Math.floor(Math.min(...costs) / COST_ROUNDING) * COST_ROUNDING,
        high: fitting.length ? Math.ceil(Math.max(...costs) / COST_ROUNDING) * COST_ROUNDING : null,
        is_sample: counted.some(isLiveRecommendationSample),
    };
}

function featureScore(area: OnboardingArea, goal: LivePreviewPreferences["goal"], dimension: "opportunity" | "mobility"): number | null {
    if (dimension === "mobility") return area.transit_stop_count > 0 ? Math.log1p(area.transit_stop_count) : null;
    if (goal === "study") return area.campuses.length > 0 ? area.campuses.length : null;
    const rawCompanyCount = numericFact(area, "company_count")?.value;
    const companyCount = typeof rawCompanyCount === "number" && Number.isFinite(rawCompanyCount) && rawCompanyCount >= 0
        ? rawCompanyCount : null;
    if (goal === "both") {
        const campuses = area.campuses.length;
        return companyCount !== null && campuses ? (Math.log1p(companyCount) + Math.log1p(campuses)) / 2 :
            companyCount !== null ? Math.log1p(companyCount) : campuses ? Math.log1p(campuses) : null;
    }
    return companyCount !== null ? Math.log1p(companyCount) : null;
}

function normalize(values: Array<number | null>, invert = false): Array<number | null> {
    const present = values.filter((value): value is number => value !== null && Number.isFinite(value));
    if (!present.length) return values.map(() => null);
    const minimum = Math.min(...present);
    const maximum = Math.max(...present);
    return values.map((value) => {
        if (value === null || !Number.isFinite(value)) return null;
        if (minimum === maximum) return 50;
        const result = (value - minimum) / (maximum - minimum) * 100;
        return Math.round(invert ? 100 - result : result);
    });
}

export function formPreviewPreferences(answers: FormAnswers): LivePreviewPreferences {
    return {
        goal: answers.goal, cityId: answers.city === "unsure" ? null : answers.city,
        monthlyBudget: answers.monthlyBudget, maximumRent: answers.maximumRent, housing: answers.housing,
        destinationId: answers.destinationId, destinationName: answers.destinationName,
        destinationPoint: answers.destinationPoint, transport: answers.transport,
        commuteMinutes: answers.commuteMinutes, overBudget: answers.overBudget, weights: answers.weights,
    };
}

export function evaluateLiveOnboarding(answers: LivePreviewPreferences, step: FormStep, input: PreviewInput): LiveOnboardingPreview {
    const city = input.cities.find((item) => item.city_id === answers.cityId) ?? null;
    const selectedTypes = answers.housing.filter((type): type is Exclude<Housing, "unsure"> => type !== "unsure");
    const raw = input.areas.map((area) => {
        const choices = rentFacts(area, selectedTypes.length ? selectedTypes : ["unsure"]);
        const rentFact = choices.length ? choices.reduce((lowest, current) => current.value < lowest.value ? current : lowest) : null;
        const rent = rentFact?.value ?? null;
        const monthlyCost = rent !== null && area.living_cost ? rent + area.living_cost.value : null;
        const exclusions: string[] = [];
        const unknowns: string[] = [];
        const reasons: string[] = [];

        if (step >= 2) {
            if (answers.maximumRent !== null) {
                if (rent === null) unknowns.push("Belum ada median sewa untuk tipe hunian ini");
                else if (!withinBudget(rent, answers.maximumRent)) exclusions.push("Sewa di atas batasmu");
                else reasons.push("Sewa dalam batasmu");
            }
            if (answers.monthlyBudget !== null) {
                if (!area.living_cost || monthlyCost === null) unknowns.push("Biaya hidup kota belum tersedia");
                else if (!withinBudget(monthlyCost, answers.monthlyBudget)) exclusions.push("Perkiraan biaya bulanan di atas anggaran");
                else reasons.push("Perkiraan biaya bulanan dalam anggaran");
            }
        }

        if (step >= 3) {
            if (!answers.destinationId && !answers.destinationPoint && !answers.destinationName) unknowns.push("Pilih lokasi tujuan untuk memeriksa perjalanan");
            else unknowns.push("Estimasi rute belum tersedia");
        }

        const financiallyConstrained = answers.maximumRent !== null || answers.monthlyBudget !== null;
        const financialUnknown = unknowns.some((item) => /sewa|biaya hidup/i.test(item));
        const eligible = step < 2 || !financiallyConstrained ? null : exclusions.length ? false : financialUnknown ? null : true;
        const affordable = financiallyConstrained && eligible === true;
        if (rent !== null && rentFact) reasons.unshift(`Median sewa Rp${Math.round(rent).toLocaleString("id-ID")} · ${rentFact.source}`);

        return {
            district: area, rent, rentFact, monthlyCost, commuteMinutes: null,
            eligible, exclusions, unknowns, reasons, score: null, rank: null,
            affordabilityRaw: answers.monthlyBudget !== null ? monthlyCost : rent,
            opportunityRaw: featureScore(area, answers.goal, "opportunity"),
            mobilityRaw: featureScore(area, answers.goal, "mobility"),
            affordable,
        };
    });

    const affordability = normalize(raw.map((item) => item.affordabilityRaw), true);
    const opportunity = normalize(raw.map((item) => item.opportunityRaw));
    const mobility = normalize(raw.map((item) => item.mobilityRaw));
    const weights = answers.weights;
    const districts: LiveDistrictRecommendation[] = raw.map((item, index) => {
        const dimensions = [
            [weights.affordability, affordability[index]],
            [weights.opportunity, opportunity[index]],
            // Stop counts describe mapped access only; they are not commute minutes.
            [weights.mobility, mobility[index]],
        ] as const;
        const supportedWeight = dimensions.reduce((sum, [weight, value]) => sum + (value === null ? 0 : weight), 0);
        const score = supportedWeight
            ? Math.round(dimensions.reduce((sum, [weight, value]) => sum + (value === null ? 0 : weight * value), 0) / supportedWeight)
            : null;
        return { ...item, score };
    });

    const ranked = districts.filter((item) => item.eligible !== false && item.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.district.zone_id.localeCompare(b.district.zone_id));
    ranked.forEach((item, index) => { item.rank = index + 1; });
    return {
        available: city !== null && input.areas.length > 0,
        city, cities: input.cities, destinations: input.destinations,
        districts, ranked, affordableCount: raw.filter((item) => item.affordable).length,
        eligibleCount: districts.filter((item) => item.eligible === true).length,
        is_sample: districts.some(isLiveRecommendationSample),
        commuteAvailable: false,
        preferences: answers,
    };
}

export function onboardingCategoryValue(item: LiveDistrictRecommendation, category: MapCategory | null): number | null {
    switch (category) {
        case "employment": {
            const fact = numericFact(item.district, "company_count");
            return fact?.value ?? null;
        }
        case "education": return item.district.campuses.length ? item.district.campuses.length : null;
        case "housing": return item.rent;
        case "mobility": return item.district.transit_stop_count > 0 ? item.district.transit_stop_count : null;
        default: return item.score;
    }
}
