import type { MapCategory, RegionFact } from "../types";
import { getRelocationGoal } from "../lib/relocationGoal";
import { onboardingTaxonomy } from "../extractUserProfile";
import { isRecord } from "../lib/zoneGeometry";
import type { PersistedRelocationProfile } from "../lib/relocationProfile";
import type { CommuteResponse } from "../routing/types";
import type { ZoneGeometry } from "../types";
import { previewDestination } from "../routing/sampling";
import { estimatePlanningReach, planningReachBand, pointDistanceKm } from "./planningReach";
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
    commute?: CommuteResponse | null;
    // Loaded boundaries let a district count as reached when its outline touches the reach circle.
    geometry?: ZoneGeometry | null;
};

const housingTypes: Exclude<Housing, "unsure">[] = ["kos", "apartment"];

// Use 10% margin for the budget
export const BUDGET_MARGIN = 0.1;

// Only the best-ranked districts are highlighted while the form or story is still open.
export const TOP_RANK_COUNT = 5;

export function distanceLabel(km: number): string {
    return `Sekitar ${km.toLocaleString("id-ID", { maximumFractionDigits: km < 10 ? 1 : 0 })} km dari tujuan`;
}

// The recommended few: best ranked and not beyond the commute reach the user set.
export function isTopRanked(item: Pick<LiveDistrictRecommendation, "rank" | "beyondReach">): boolean {
    return item.rank !== null && item.rank <= TOP_RANK_COUNT && !item.beyondReach;
}

function distanceToDestination(center: [number, number] | null, destination: [number, number] | null): number | null {
    if (!center || !destination) return null;
    const distance = pointDistanceKm(center, destination);
    return Number.isFinite(distance) ? distance : null;
}

function withinBudget(value: number, limit: number): boolean {
    return value <= limit * (1 + BUDGET_MARGIN);
}

function amount(value: unknown): number | null {
    const raw = isRecord(value) ? value.amount : value;
    return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
}

function text(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && !!item.trim()).map((item) => item.trim()) : [];
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

type ProfilePriorityWeights = NonNullable<LivePreviewPreferences["priorityWeights"]>;

function normalizedProfileWeights(weights: Record<string, number>): ProfilePriorityWeights {
    const dimensions = ["career", "education", "housing", "cost_of_living", "commute", "environment"] as const;
    const values = dimensions.map((dimension) => {
        const value = weights[dimension];
        return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
    });
    const total = values.reduce((sum, value) => sum + value, 0);
    const normalized = total > 0 ? values.map((value) => value / total) : values;
    return {
        career: normalized[0], education: normalized[1], housing: normalized[2],
        cost_of_living: normalized[3], commute: normalized[4], environment: normalized[5],
    };
}

export function profilePreviewPreferences(profile: PersistedRelocationProfile, cities: OnboardingCity[]): LivePreviewPreferences | null {
    const hard = profile.hard_constraints;
    const soft = profile.soft_preferences;
    const rawTargets = hard.destination_cities ?? soft.destination_cities;
    const targets = Array.isArray(rawTargets) ? rawTargets.filter((item): item is string => typeof item === "string") : [];
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
    // Legacy active means walking OR cycling. Never silently turn it into pedestrian fit.
    const transport = mode === "transit" || mode === "motorcycle" || mode === "car" ||
        (mode === "active" && soft.active_mode === "walk") ? mode : null;
    const goal = getRelocationGoal({ hard_constraints: hard, soft_preferences: soft });
    if (!goal) return null;
    const weights = profile.priority_weights;
    return {
        goal,
        occupation: goal === "study" ? null : text(soft.occupation),
        targetOccupations: goal === "study" ? [] : strings(soft.target_occupations),
        sectors: goal === "study" ? [] : strings(soft.target_fields),
        studyField: goal === "work" ? null : text(soft.study_field ?? hard.study_field),
        educationLevel: goal === "work" ? null : text(soft.education_level ?? hard.education_level),
        careerStage: goal === "study" ? null : text(soft.career_stage),
        cityId,
        monthlyBudget: amount(hard.monthly_budget),
        maximumRent: amount(hard.housing_budget),
        housing,
        destinationId: null,
        destinationName: rawDestination && typeof rawDestination.name === "string" ? rawDestination.name : null,
        destinationPoint,
        transport,
        departure: ["morning", "midday", "evening", "flexible"].includes(String(soft.departure_time))
            ? soft.departure_time as FormAnswers["departure"] : null,
        commuteMinutes: typeof hard.commute_minutes === "number" && Number.isFinite(hard.commute_minutes) ? hard.commute_minutes : null,
        overBudget: soft.over_budget === "hide" ? "hide" : "mark",
        weights: normalizedWeights([
            valueWeight(weights, ["career", "education"]),
            valueWeight(weights, ["housing", "cost_of_living"]),
            valueWeight(weights, ["commute"]),
            valueWeight(weights, ["environment"]),
        ]),
        priorityWeights: normalizedProfileWeights(weights),
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
    return area.facts.filter((fact) => fact.evidence_type !== "unavailable" && fact.metric.split(":")[0] === "median_monthly_rent_idr" &&
        requested.includes(housingType(fact) as Exclude<Housing, "unsure">));
}

function numericFact(area: OnboardingArea, metric: string): RegionFact | null {
    return area.facts.find((fact) => fact.metric === metric && fact.evidence_type !== "unavailable") ?? null;
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
    const budgeted = priced.some((item) => item.financialEligible !== null);
    const fitting = budgeted ? priced.filter((item) => item.financialEligible === true) : priced;
    const counted = fitting.length ? fitting : priced;
    const costs = counted.map((item) => item.monthlyCost);
    return {
        low: Math.floor(Math.min(...costs) / COST_ROUNDING) * COST_ROUNDING,
        high: fitting.length ? Math.ceil(Math.max(...costs) / COST_ROUNDING) * COST_ROUNDING : null,
        is_sample: counted.some(isLiveRecommendationSample),
    };
}

function meanSupported(values: Array<number | null>): number | null {
    const supported = values.filter((value): value is number => value !== null);
    return supported.length ? supported.reduce((sum, value) => sum + value, 0) / supported.length : null;
}

function careerSignal(area: OnboardingArea, answers: LivePreviewPreferences, metric: string): number | null {
    const sectors = answers.sectors ?? [];
    // No normalized occupation/stage dataset yet: generic companies cannot prove a match.
    if (!sectors.length && (answers.occupation || answers.targetOccupations?.length || answers.careerStage)) return null;
    const facts = area.facts.filter((fact) => fact.metric.split(":")[0] === metric && fact.evidence_type !== "unavailable" &&
        Number.isFinite(fact.value) && fact.value >= 0 &&
        (!sectors.length ? metric !== "employed_people" : fact.sector_ids?.some((sector) => sectors.includes(sector))));
    if (!facts.length) return null;
    // ponytail: use the strongest mapped KBLI signal, not a sum of overlapping industry groups.
    // Add disjoint industry aggregation only when the source mapping supports it.
    return Math.log1p(Math.max(...facts.map((fact) => fact.value)));
}

function educationSignal(area: OnboardingArea, answers: LivePreviewPreferences): number | null {
    // Campus presence is not proof that a requested program/qualification is offered.
    if (answers.studyField || answers.educationLevel) return null;
    return area.campuses.length > 0 ? area.campuses.length : null;
}

function profileDimensionScore(area: OnboardingArea, dimension: keyof ProfilePriorityWeights, housing: Housing[] = ["unsure"]): number | null {
    if (dimension === "housing") {
        const rent = rentFacts(area, housing.filter((type): type is Exclude<Housing, "unsure"> => type !== "unsure"))
            .reduce<number | null>((lowest, fact) =>
            lowest === null || fact.value < lowest ? fact.value : lowest, null);
        return rent !== null && rent > 0 ? 1 / rent : null;
    }
    if (dimension === "cost_of_living") {
        const cost = area.living_cost?.value;
        return typeof cost === "number" && Number.isFinite(cost) && cost > 0 ? 1 / cost : null;
    }
    if (dimension === "commute") return null; // Stop counts never proxy journey time.
    return null;
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
    const occupation = answers.goal === "study" ? null : text(answers.occupation);
    const matchedOccupation = onboardingTaxonomy.occupations.find((item) => [item.label, ...item.aliases]
        .some((alias) => alias.toLowerCase() === occupation?.toLowerCase()));
    return {
        goal: answers.goal, cityId: answers.city === "unsure" ? null : answers.city,
        occupation, targetOccupations: matchedOccupation ? [matchedOccupation.id] : [],
        sectors: answers.goal !== "study" && answers.sector ? [answers.sector] : [],
        studyField: answers.goal === "work" ? null : text(answers.studyField),
        educationLevel: answers.goal === "work" ? null : text(answers.education),
        // The form no longer asks career stage; do not revive hidden legacy defaults.
        careerStage: null,
        monthlyBudget: answers.monthlyBudget, maximumRent: answers.maximumRent, housing: answers.housing,
        destinationId: answers.destinationId, destinationName: answers.destinationName,
        destinationPoint: answers.destinationPoint, transport: answers.transport,
        commuteMinutes: answers.commuteMinutes, overBudget: answers.overBudget, weights: answers.weights,
        departure: answers.departure,
    };
}

export function evaluateLiveOnboarding(answers: LivePreviewPreferences, step: FormStep, input: PreviewInput): LiveOnboardingPreview {
    const city = input.cities.find((item) => item.city_id === answers.cityId) ?? null;
    const selectedTypes = answers.housing.filter((type): type is Exclude<Housing, "unsure"> => type !== "unsure");
    const destination = previewDestination(answers, input.destinations);
    const planningReach = step >= 3 ? estimatePlanningReach(answers, input.destinations) : null;
    const commute = step >= 3 && input.commute?.mode === answers.transport &&
        JSON.stringify(input.commute.destination) === JSON.stringify(destination) ? input.commute : null;
    const byId = new Map(commute?.estimates.map((estimate) => [estimate.id, estimate]) ?? []);
    // Normalize different measures separately: vacancies, companies and workers
    // are complementary indicators, never interchangeable counts.
    const rawCareerSignals = ["company_count", "opening_count", "employed_people"].map((metric) =>
        input.areas.map((area) => careerSignal(area, answers, metric)));
    const hasCareerEvidence = input.areas.map((_, index) => rawCareerSignals.some((signal) => signal[index] !== null));
    // Compare career-evidenced districts on the same indicators. A missing
    // vacancy count must not silently give the remaining indicators extra weight.
    const careerSignals = rawCareerSignals.filter((signal) => signal.every((value, index) => !hasCareerEvidence[index] || value !== null))
        .map((signal) => normalize(signal));
    const career = input.areas.map((_, index) => meanSupported(careerSignals.map((signal) => signal[index])));
    const education = normalize(input.areas.map((area) => educationSignal(area, answers)));
    const boundaries = new Map<string, ZoneGeometry["features"][number]["geometry"][]>();
    if (planningReach) for (const feature of input.geometry?.features ?? []) {
        boundaries.set(feature.properties.zone_id, [...boundaries.get(feature.properties.zone_id) ?? [], feature.geometry]);
    }
    const raw = input.areas.map((area, index) => {
        const choices = rentFacts(area, selectedTypes.length ? selectedTypes : ["unsure"]);
        const rentFact = choices.length ? choices.reduce((lowest, current) => current.value < lowest.value ? current : lowest) : null;
        const rent = rentFact?.value ?? null;
        const monthlyCost = rent !== null && area.living_cost ? rent + area.living_cost.value : null;
        const exclusions: string[] = [];
        const unknowns: string[] = [];
        const reasons: string[] = [];
        if (answers.goal !== "study") {
            if (answers.occupation || answers.targetOccupations?.length) unknowns.push("Kecocokan pekerjaan belum tersedia");
            if (answers.careerStage) unknowns.push("Data tahap karier belum tersedia");
            if (answers.sectors?.length) {
                if (career[index] === null) unknowns.push(hasCareerEvidence[index] ? "Data sektor belum sebanding" : "Data sektor pilihanmu belum tersedia");
                else reasons.push("Sinyal sektor pilihanmu tersedia · bukan kecocokan pekerjaan");
            }
        }
        if (answers.goal !== "work") {
            if (answers.studyField) unknowns.push("Data program studi pilihanmu belum tersedia");
            if (answers.educationLevel) unknowns.push("Data jenjang pendidikan pilihanmu belum tersedia");
        }

        if (step >= 2) {
            if (answers.maximumRent !== null) {
                if (rent === null) unknowns.push("Belum ada rata-rata sewa untuk tipe hunian ini");
                else if (!withinBudget(rent, answers.maximumRent)) exclusions.push("Sewa di atas batasmu");
                else reasons.push("Sewa dalam batasmu");
            }
            if (answers.monthlyBudget !== null) {
                if (!area.living_cost || monthlyCost === null) unknowns.push("Biaya hidup kota belum tersedia");
                else if (!withinBudget(monthlyCost, answers.monthlyBudget)) exclusions.push("Perkiraan biaya bulanan di atas anggaran");
                else reasons.push("Perkiraan biaya bulanan dalam anggaran");
            }
        }

        const financiallyConstrained = answers.maximumRent !== null || answers.monthlyBudget !== null;
        const financialUnknown = unknowns.some((item) => /sewa|biaya hidup/i.test(item));
        const financialEligible = step < 2 || !financiallyConstrained ? null : exclusions.length ? false : financialUnknown ? null : true;
        const affordable = financiallyConstrained && financialEligible === true;
        const commuteEstimate = byId.get(area.zone_id) ?? null;
        const routeKnown = commuteEstimate?.status === "ok" && commuteEstimate.minutes !== null &&
            !!commute?.provenance && commute.provenance.freshness !== "stale";
        const commuteMinutes = commuteEstimate?.minutes?.high ?? null;
        const distanceKm = distanceToDestination(area.center, destination);
        if (step >= 2 && distanceKm !== null) reasons.push(distanceLabel(distanceKm));
        const reachBand = planningReachBand(area.center, planningReach, boundaries.get(area.zone_id));
        let commuteUnknown = false;
        if (step >= 3) {
            if (!destination) { unknowns.push("Pilih lokasi tujuan untuk memeriksa perjalanan"); commuteUnknown = true; }
            else if (!routeKnown) {
                const status = commuteEstimate?.status;
                unknowns.push(status === "outside_coverage" ? "Rute di luar cakupan moda ini" : status === "departure_required" ? "Pilih waktu berangkat untuk rute transit" :
                    status === "no_service" ? "Tanggal di luar layanan GTFS" : status === "no_route" ? "Rute tidak ditemukan untuk titik sampel" :
                    status === "partial" ? "Sebagian titik sampel belum terhubung" : commute?.provenance?.freshness === "stale" ? "Data rute lama; batas belum dinilai" : planningReach ? "Waktu tempuh belum dinilai" : "Estimasi rute belum tersedia");
                commuteUnknown = true;
            } else if (answers.commuteMinutes !== null && commuteEstimate!.minutes!.low > answers.commuteMinutes) {
                exclusions.push("Estimasi titik sampel melebihi batas perjalanan");
            } else if (answers.commuteMinutes !== null && commuteMinutes! > answers.commuteMinutes) {
                unknowns.push("Sebagian titik sampel melebihi batas perjalanan"); commuteUnknown = true;
            } else reasons.push("Perjalanan titik sampel sesuai estimasi");
        }
        const constrained = (step >= 2 && financiallyConstrained) || (step >= 3 && answers.commuteMinutes !== null);
        const eligible = !constrained ? null : exclusions.length ? false : financialUnknown ||
            (step >= 3 && answers.commuteMinutes !== null && commuteUnknown) ? null : true;
        if (rent !== null && rentFact) reasons.unshift(`Rata-rata sewa Rp${Math.round(rent).toLocaleString("id-ID")} · ${rentFact.source}`);

        return {
            district: area, rent, rentFact, monthlyCost, commuteMinutes, commuteEstimate, distanceKm, financialEligible,
            reachBand, beyondReach: commute === null && reachBand === "outside",
            eligible, exclusions, unknowns, reasons, score: null, rank: null,
            affordabilityRaw: answers.monthlyBudget !== null ? monthlyCost : rent,
            mobilityRaw: destination ? routeKnown && commuteMinutes !== null ? -commuteMinutes : null :
                area.transit_stop_count > 0 ? Math.log1p(area.transit_stop_count) : null,
            affordable,
        };
    });

    const affordability = normalize(raw.map((item) => item.affordabilityRaw), true);
    const opportunity = input.areas.map((_, index) => answers.goal === "work" ? career[index] : answers.goal === "study" ? education[index] :
        meanSupported([career[index], education[index]]));
    // Route times rank when any exist. Otherwise a chosen destination ranks by straight-line distance, so
    // far-away districts that only pass the rent limit don't read as good fits. Distance never excludes one.
    const useDistance = destination !== null && !raw.some((item) => item.mobilityRaw !== null);
    // A distance shared by every district separates nothing, so a lone or equidistant district gets no score from it.
    const distances = raw.map((item) => item.distanceKm === null ? null : -item.distanceKm);
    const nearness = normalize(new Set(distances.filter((value) => value !== null)).size > 1 ? distances : distances.map(() => null));
    const mobility = useDistance ? nearness : normalize(raw.map((item) => item.mobilityRaw));
    const profileDimensions = answers.priorityWeights ? {
        career,
        education,
        housing: normalize(input.areas.map((area) => profileDimensionScore(area, "housing", answers.housing))),
        cost_of_living: normalize(input.areas.map((area) => profileDimensionScore(area, "cost_of_living"))),
        commute: useDistance ? nearness : normalize(raw.map((item) => item.commuteEstimate?.status === "ok" && commute?.provenance?.freshness !== "stale" &&
            item.commuteMinutes !== null ? -item.commuteMinutes : null)),
    } : null;
    const weights = answers.weights;
    const districts: LiveDistrictRecommendation[] = raw.map((item, index) => {
        const dimensions = profileDimensions && answers.priorityWeights ? [
            [answers.priorityWeights.career, profileDimensions.career[index]],
            [answers.priorityWeights.education, profileDimensions.education[index]],
            [answers.priorityWeights.housing, profileDimensions.housing[index]],
            [answers.priorityWeights.cost_of_living, profileDimensions.cost_of_living[index]],
            [answers.priorityWeights.commute, profileDimensions.commute[index]],
        ] as const : [
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

    // Changing the commute time or mode moves the reach, so districts outside it drop below the rest. This only
    // reorders: the reach is an assumption-based estimate, so it never excludes a district or changes a score.
    const ranked = districts.filter((item) => item.eligible !== false && item.score !== null)
        .sort((a, b) => Number(a.beyondReach) - Number(b.beyondReach) || (b.score ?? 0) - (a.score ?? 0) || a.district.zone_id.localeCompare(b.district.zone_id));
    ranked.forEach((item, index) => { item.rank = index + 1; });
    return {
        available: city !== null && input.areas.length > 0,
        city, cities: input.cities, destinations: input.destinations,
        districts, ranked, affordableCount: raw.filter((item) => item.affordable).length,
        eligibleCount: districts.filter((item) => item.eligible === true).length,
        is_sample: districts.some(isLiveRecommendationSample),
        commuteAvailable: raw.some((item) => item.commuteMinutes !== null),
        commute,
        planningReach,
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
        case "mobility": return item.commuteMinutes;
        default: return item.score;
    }
}
