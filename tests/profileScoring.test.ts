import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLiveOnboarding, profilePreviewPreferences } from "../app/engine/onboarding/livePreview";
import type { OnboardingArea, OnboardingCity } from "../app/engine/onboarding/types";
import type { PersistedRelocationProfile } from "../app/engine/lib/relocationProfile";

const city: OnboardingCity = {
    city_id: "city", city_name: "City", district_count: 2, center: null, is_sample: false,
};

function area(zone_id: string, companyCount: number | null, campusCount: number, is_sample = false): OnboardingArea {
    return {
        zone_id, zone_name: zone_id, city_id: city.city_id, city_name: city.city_name, is_sample,
        center: null,
        facts: [
            ...(companyCount === null ? [] : [{
                metric: "company_count", value: companyCount, unit: "company", source: "Directory",
                period_end: null, evidence_type: "derived" as const, limitations: null, is_sample,
            }]),
            { metric: "median_monthly_rent_idr", value: 1_500_000, unit: "IDR", source: "Housing survey",
                period_end: null, evidence_type: "derived", limitations: null, is_sample },
        ],
        campuses: Array.from({ length: campusCount }, (_, index) => ({
            id: `${zone_id}-campus-${index}`, name: `Campus ${index}`, center: [0, 0], source: "Directory",
            source_url: null, is_sample,
        })),
        transit_stop_count: 0, living_cost: null,
    };
}

const input = {
    cities: [city],
    areas: [area("career-zone", 100, 1), area("education-zone", 1, 10)],
    destinations: [],
};

function profile(priority_weights: Record<string, number>, extraSoft: Record<string, unknown> = {}): PersistedRelocationProfile {
    return {
        schema_version: "relocation-profile-v1",
        hard_constraints: { goal: "both", destination_cities: [city.city_id], monthly_budget: null,
            housing_budget: null, commute_minutes: null },
        soft_preferences: { goal: "both", housing_types: ["kos"], ...extraSoft },
        priority_weights,
        taxonomy_version: "test", contract_version: "lf05-v2",
    };
}

function profilePreview(priority_weights: Record<string, number>) {
    const preferences = profilePreviewPreferences(profile(priority_weights), [city]);
    assert.ok(preferences);
    return evaluateLiveOnboarding(preferences, 4, input);
}

test("separate profile career and education weights independently reverse combined-goal ranking", () => {
    const careerFirst = profilePreview({ career: 9, education: 1, housing: 0, cost_of_living: 0, commute: 0 });
    const educationFirst = profilePreview({ career: 1, education: 9, housing: 0, cost_of_living: 0, commute: 0 });

    assert.equal(careerFirst.ranked[0]?.district.zone_id, "career-zone");
    assert.equal(educationFirst.ranked[0]?.district.zone_id, "education-zone");
    assert.equal(careerFirst.preferences.priorityWeights?.career, 0.9);
    assert.equal(educationFirst.preferences.priorityWeights?.education, 0.9);
});

test("legacy form preferences retain aggregate combined-goal scoring", () => {
    const preview = evaluateLiveOnboarding({
        goal: "both", cityId: city.city_id, monthlyBudget: null, maximumRent: null, housing: ["kos"],
        destinationId: null, destinationName: null, destinationPoint: null, transport: null,
        commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 100, affordability: 0, mobility: 0, environment: 0 },
    }, 4, input);

    assert.equal(preview.preferences.priorityWeights, undefined);
    assert.equal(preview.ranked[0]?.district.zone_id, "career-zone");
});

test("missing career evidence stays unscored and sample provenance remains visible", () => {
    const preferences = profilePreviewPreferences(
        profile({ career: 1, education: 0, housing: 0, cost_of_living: 0, commute: 0 }), [city],
    );
    assert.ok(preferences);
    const unsupported = evaluateLiveOnboarding(preferences, 4, {
        ...input, areas: [area("missing-a", null, 0), area("missing-b", null, 0)],
    });
    assert.deepEqual(unsupported.districts.map((item) => item.score), [null, null]);
    assert.equal(unsupported.ranked.length, 0);

    const sampled = evaluateLiveOnboarding(preferences, 4, {
        ...input, areas: [area("sample", 4, 1, true)],
    });
    assert.equal(sampled.is_sample, true);
    assert.equal(sampled.districts[0].district.is_sample, true);
});

test("saved over-budget preference survives profile preview conversion", () => {
    const preferences = profilePreviewPreferences(
        profile({ career: 1, education: 0, housing: 0, cost_of_living: 0, commute: 0 }, { over_budget: "hide" }), [city],
    );
    assert.equal(preferences?.overBudget, "hide");
});

test("an explicit zero rent limit remains a constraint, not missing data", () => {
    const saved = profile({ housing: 1 });
    saved.hard_constraints.housing_budget = { amount: 0, currency: "IDR", period: "month" };
    const preferences = profilePreviewPreferences(saved, [city]);
    assert.ok(preferences);
    assert.equal(preferences.maximumRent, 0);
    const district = area("paid-rent", 1, 0);
    district.facts.push({ metric: "median_monthly_rent_idr", value: 1_000_000, unit: "IDR", source: "Housing survey",
        period_end: null, evidence_type: "derived", limitations: null, is_sample: false });
    const preview = evaluateLiveOnboarding(preferences, 4, { ...input, areas: [district] });
    assert.equal(preview.districts[0].eligible, false);
    assert.equal(preview.ranked.length, 0);
});

test("legacy soft city targets resolve when a hard target is absent", () => {
    const saved = profile({ career: 1 }, { destination_cities: [city.city_name] });
    delete saved.hard_constraints.destination_cities;
    assert.equal(profilePreviewPreferences(saved, [city])?.cityId, city.city_id);
});
