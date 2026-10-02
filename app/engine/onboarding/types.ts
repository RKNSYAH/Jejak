import type { RelocationGoal } from "../lib/relocationGoal";
import type { RegionFact } from "../types";

export const FORM_DRAFT_KEY = "jejak:relocation-form:v1";
export const STORY_DRAFT_KEY = "jejak:relocation-onboarding";
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
export type DemoDistrict = {
    id: string;
    name: string;
    center: [number, number];
    rent: Record<Exclude<Housing, "unsure">, number>;
    otherCosts: number;
    career: number;
    education: number;
    environment: number;
    commute: Record<string, number>;
    extras: Extra[];
    is_sample: true;
};
export type DemoDestination = {
    id: string;
    name: string;
    center: [number, number];
    kind: "office" | "campus";
};
export type DistrictRecommendation = {
    district: DemoDistrict;
    rent: number;
    monthlyCost: number;
    commuteMinutes: number | null;
    eligible: boolean;
    exclusions: string[];
    reasons: string[];
    score: number;
    rank: number | null;
};
export type OnboardingPreview = {
    available: boolean;
    districts: DistrictRecommendation[];
    ranked: DistrictRecommendation[];
    affordableCount: number;
    eligibleCount: number;
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
    commuteMinutes: null;
    eligible: boolean | null;
    exclusions: string[];
    unknowns: string[];
    reasons: string[];
    score: number | null;
    rank: number | null;
};

export type LivePreviewPreferences = {
    goal: RelocationGoal;
    cityId: string | null;
    monthlyBudget: number | null;
    maximumRent: number | null;
    housing: Housing[];
    destinationId: string | null;
    destinationName: string | null;
    destinationPoint: [number, number] | null;
    transport: Transport | null;
    commuteMinutes: number | null;
    overBudget: "mark" | "hide";
    weights: Weights;
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
    commuteAvailable: false;
    preferences: LivePreviewPreferences;
};
