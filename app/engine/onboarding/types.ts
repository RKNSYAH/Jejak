import type { RelocationGoal } from "../lib/relocationGoal";
import type { RegionFact } from "../types";
import type { CommuteEstimate, CommuteResponse } from "../routing/types";
import type { PlanningReach, PlanningReachBand } from "./planningReach";

// Legacy cleanup only; new drafts must use draftKeys(userId) and an owner envelope.
export const FORM_DRAFT_KEY = "jejak:relocation-form:v1";
export const STORY_DRAFT_KEY = "jejak:relocation-onboarding";
export function draftKeys(userId: string) {
    return {
        form: `jejak:relocation-form:v2:${userId}`,
        story: `jejak:relocation-onboarding:v2:${userId}`,
    };
}
export type FormStep = 1 | 2 | 3 | 4;
export type Housing = "kos" | "apartment" | "house" | "unsure";
export type Transport = "transit" | "motorcycle" | "car" | "active";
export type Priority = "opportunity" | "affordability" | "mobility" | "environment";
export type Weights = Record<Priority, number>;
export type City = string;
type Extra = "internet" | "healthcare" | "quiet";
export type FormAnswers = {
    goal: RelocationGoal;
    occupation: string;
    sector: string | null;
    studyField: string;
    education: string;
    city: City;
    experience?: "graduate" | "early" | "experienced" | null;
    monthlyBudget: number;
    maximumRent: number;
    overBudget: "mark" | "hide";
    housing: Housing[];
    destinationId: string | null;
    destinationName: string | null;
    destinationPoint: [number, number] | null;
    transport: Transport;
    commuteMinutes: 15 | 30 | 45 | 60;
    departure: "morning" | "midday" | "evening" | "flexible";
    weights: Weights;
    extras: Extra[];
};
export type FormSession = {
    version: 1;
    status: "active" | "paused" | "skipped" | "completed";
    step: FormStep;
    answers: FormAnswers;
};
export type DemoDestination = {
    id: string;
    name: string;
    center: [number, number];
    kind: "office" | "campus";
};

export type OnboardingCity = {
    city_id: string;
    city_name: string;
    district_count: number;
    center: [number, number] | null;
    is_sample: boolean;
};

export type OnboardingCampus = {
    id: string;
    name: string;
    center: [number, number];
    source: string;
    source_url: string | null;
    is_sample: boolean;
};

export type OnboardingArea = {
    zone_id: string;
    zone_name: string;
    city_id: string;
    city_name: string;
    is_sample: boolean;
    center: [number, number] | null;
    facts: RegionFact[];
    campuses: OnboardingCampus[];
    transit_stop_count: number;
    living_cost: {
        value: number;
        source: string;
        source_url: string | null;
        limitations: string | null;
        is_sample: boolean;
    } | null;
};

export type LiveDistrictRecommendation = {
    district: OnboardingArea;
    rent: number | null;
    rentFact: RegionFact | null;
    monthlyCost: number | null;
    commuteMinutes: number | null;
    commuteEstimate: CommuteEstimate | null;
    // Straight-line km from the district point to the destination. Ranks only; it is not a journey time.
    distanceKm: number | null;
    financialEligible: boolean | null;
    reachBand: PlanningReachBand;
    // Outside the estimated reach with no route evidence to say otherwise: ranks after the rest, never excluded.
    beyondReach: boolean;
    eligible: boolean | null;
    exclusions: string[];
    unknowns: string[];
    reasons: string[];
    score: number | null;
    rank: number | null;
};

export type LivePreviewPreferences = {
    goal: RelocationGoal;
    occupation?: string | null;
    targetOccupations?: string[];
    sectors?: string[];
    studyField?: string | null;
    educationLevel?: string | null;
    careerStage?: string | null;
    cityId: string | null;
    monthlyBudget: number | null;
    maximumRent: number | null;
    housing: Housing[];
    destinationId: string | null;
    destinationName: string | null;
    destinationPoint: [number, number] | null;
    transport: Transport | null;
    commuteMinutes: number | null;
    departure?: FormAnswers["departure"] | null;
    overBudget: "mark" | "hide";
    weights: Weights;
    priorityWeights?: {
        career: number;
        education: number;
        housing: number;
        cost_of_living: number;
        commute: number;
        environment?: number;
    };
};

export type LivePreviewMapContext = {
    step: FormStep;
    completed: boolean;
    goal: RelocationGoal;
    overBudget: "mark" | "hide";
    destinationId: string | null;
    destinationPoint: [number, number] | null;
};

export type LiveOnboardingPreview = {
    available: boolean;
    city: OnboardingCity | null;
    cities: OnboardingCity[];
    destinations: OnboardingCampus[];
    districts: LiveDistrictRecommendation[];
    ranked: LiveDistrictRecommendation[];
    affordableCount: number;
    eligibleCount: number;
    is_sample: boolean;
    commuteAvailable: boolean;
    commute: CommuteResponse | null;
    planningReach: PlanningReach | null;
    preferences: LivePreviewPreferences;
};
