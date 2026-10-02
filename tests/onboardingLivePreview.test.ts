import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLiveOnboarding, monthlyCostRange, profilePreviewPreferences } from "../app/engine/onboarding/livePreview";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import type { OnboardingArea, OnboardingCity } from "../app/engine/onboarding/types";
import type { PersistedRelocationProfile } from "../app/engine/lib/relocationProfile";

const cities: OnboardingCity[] = [{
    city_id: "jakarta-selatan", city_name: "Kota Administrasi Jakarta Selatan", district_count: 2,
    center: [106.8, -6.25], is_sample: false,
}];

const areas: OnboardingArea[] = [
    {
        zone_id: "jakarta-selatan-a", zone_name: "Kecamatan A", city_id: cities[0].city_id,
        city_name: cities[0].city_name, is_sample: false, center: [106.8, -6.25],
        facts: [{ metric: "median_monthly_rent_idr", value: 1_800_000, unit: "IDR", source: "Survei hunian",
            period_end: "2026-06-30", evidence_type: "derived", limitations: null, is_sample: false,
            dimension_key: "housing_type", dimension_value: "kos" }],
        campuses: [], transit_stop_count: 4,
        living_cost: { value: 3_000_000, source: "Biaya kota", source_url: "https://example.test/cost",
            limitations: "Keranjang satu orang", is_sample: false },
    },
    {
        zone_id: "jakarta-selatan-b", zone_name: "Kecamatan B", city_id: cities[0].city_id,
        city_name: cities[0].city_name, is_sample: false, center: [106.82, -6.24],
        facts: [{ metric: "median_monthly_rent_idr", value: 2_800_000, unit: "IDR", source: "Survei hunian",
            period_end: "2026-06-30", evidence_type: "derived", limitations: null, is_sample: false,
            dimension_key: "housing_type", dimension_value: "kos" }],
        campuses: [], transit_stop_count: 1,
        living_cost: { value: 3_000_000, source: "Biaya kota", source_url: "https://example.test/cost",
            limitations: "Keranjang satu orang", is_sample: false },
    },
];

test("live onboarding ranks database evidence and never fabricates a commute duration", () => {
    const answers = {
        ...initialFormAnswers,
        city: cities[0].city_id,
        monthlyBudget: 6_000_000,
        maximumRent: 2_500_000,
        housing: ["kos"] as const,
        destinationId: "jakarta-selatan:42",
        destinationName: "Kampus contoh",
        destinationPoint: [106.82, -6.24] as [number, number],
    };
    const preview = evaluateLiveOnboarding({
        goal: answers.goal, cityId: answers.city, monthlyBudget: answers.monthlyBudget,
        maximumRent: answers.maximumRent, housing: [...answers.housing], destinationId: answers.destinationId,
        destinationName: answers.destinationName, destinationPoint: answers.destinationPoint,
        transport: answers.transport, commuteMinutes: answers.commuteMinutes,
        overBudget: answers.overBudget, weights: answers.weights,
    }, 3, { cities, areas, destinations: [] });

    assert.equal(preview.commuteAvailable, false);
    assert.equal(preview.ranked[0]?.district.zone_id, "jakarta-selatan-a");
    assert.equal(preview.ranked[0]?.eligible, true);
    assert.equal(preview.ranked[0]?.commuteMinutes, null);
    assert.ok(preview.ranked[0]?.unknowns.includes("Estimasi rute belum tersedia"));
    assert.equal(preview.districts.find((item) => item.district.zone_id === "jakarta-selatan-b")?.eligible, false);
});

test("a missing cost source stays unverified instead of becoming a zero-cost fit", () => {
    const areaWithoutCityCosts = { ...areas[0], living_cost: null } satisfies OnboardingArea;
    const preview = evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: 6_000_000, maximumRent: 2_500_000,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: "transit", commuteMinutes: 45, overBudget: "mark",
        weights: { opportunity: 40, affordability: 30, mobility: 20, environment: 10 },
    }, 4, { cities, areas: [areaWithoutCityCosts], destinations: [] });

    assert.equal(preview.affordableCount, 0);
    assert.equal(preview.districts[0].eligible, null);
    assert.ok(preview.districts[0].unknowns.includes("Biaya hidup kota belum tersedia"));
});

test("missing city costs do not score rent as a complete monthly-budget estimate", () => {
    const areaWithoutCityCosts = { ...areas[0], living_cost: null } satisfies OnboardingArea;
    const preview = evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: 6_000_000, maximumRent: null,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: null, commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 0, affordability: 100, mobility: 0, environment: 0 },
    }, 4, { cities, areas: [areaWithoutCityCosts], destinations: [] });

    assert.equal(preview.districts[0].score, null);
    assert.equal(preview.ranked.length, 0);
});

test("a sourced zero company count remains observed evidence rather than missing data", () => {
    const withCompanyCounts = areas.map((area, index) => ({
        ...area,
        facts: [...area.facts, {
            metric: "company_count", value: index === 0 ? 0 : 10, unit: "company", source: "Direktori perusahaan",
            period_end: null, evidence_type: "derived" as const, limitations: null, is_sample: false,
        }],
    }));
    const preview = evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: null,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: null, commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 100, affordability: 0, mobility: 0, environment: 0 },
    }, 4, { cities, areas: withCompanyCounts, destinations: [] });

    assert.equal(preview.districts.find((item) => item.district.zone_id === areas[0].zone_id)?.score, 0);
    assert.equal(preview.districts.find((item) => item.district.zone_id === areas[1].zone_id)?.score, 100);
});

test("story profile preview resolves a supported city without inventing missing budget values", () => {
    const profile: PersistedRelocationProfile = {
        schema_version: "relocation-profile-v1",
        hard_constraints: {
            goal: "study", destination_cities: ["Kota Administrasi Jakarta Selatan"],
            monthly_budget: { amount: 5_000_000, currency: "IDR", period: "month" }, housing_budget: null,
            commute_minutes: 45,
        },
        soft_preferences: { goal: "study", housing_types: ["kos"], transport_mode: "transit" },
        priority_weights: { education: 1, housing: 0.5, cost_of_living: 0.5, commute: 0.25 },
        taxonomy_version: "test", contract_version: "lf05-v2",
    };
    const preferences = profilePreviewPreferences(profile, cities);

    assert.equal(preferences?.cityId, "jakarta-selatan");
    assert.equal(preferences?.goal, "study");
    assert.equal(preferences?.monthlyBudget, 5_000_000);
    assert.equal(preferences?.maximumRent, null);
    assert.equal(profilePreviewPreferences({ ...profile,
        hard_constraints: { ...profile.hard_constraints, destination_cities: ["Jakarta"] },
    }, cities)?.cityId, null);
});

test("districts up to 10% over the rent limit stay eligible", () => {
    const withRent = (value: number) => ({ ...areas[0], facts: [{ ...areas[0].facts[0], value }] }) satisfies OnboardingArea;
    const evaluate = (rent: number) => evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: 2_000_000,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: "transit", commuteMinutes: 45, overBudget: "mark",
        weights: { opportunity: 40, affordability: 30, mobility: 20, environment: 10 },
    }, 2, { cities, areas: [withRent(rent)], destinations: [] }).districts[0];

    const within = evaluate(2_000_000);
    assert.equal(within.eligible, true);

    for (const rent of [2_100_000, 2_200_000]) {
        const near = evaluate(rent);
        assert.equal(near.eligible, true);
        assert.ok(near.reasons.includes("Sewa dalam batasmu"));
    }

    const over = evaluate(2_200_001);
    assert.equal(over.eligible, false);
    assert.ok(over.exclusions.includes("Sewa di atas batasmu"));
});

test("monthly cost range covers districts within the budget, widened to whole Rp500.000 steps", () => {
    const district = (monthlyCost: number | null, eligible: boolean | null, is_sample = false) => ({
        district: { ...areas[0], is_sample }, rentFact: null, monthlyCost, eligible,
    }) as unknown as Parameters<typeof monthlyCostRange>[0]["districts"][number];

    // An over-budget 28.5 jt district must not stretch the top of the range.
    assert.deepEqual(monthlyCostRange({ districts: [district(5_720_000, true), district(6_830_000, true), district(28_400_000, false), district(null, null)] }),
        { low: 5_500_000, high: 7_000_000, is_sample: false });
    assert.deepEqual(monthlyCostRange({ districts: [district(6_000_000, true)] }), { low: 6_000_000, high: 6_000_000, is_sample: false });
    // Nothing fits: only the cheapest starting cost is shown.
    assert.deepEqual(monthlyCostRange({ districts: [district(9_200_000, false), district(12_000_000, false)] }), { low: 9_000_000, high: null, is_sample: false });
    // No budget given: every priced district counts.
    assert.deepEqual(monthlyCostRange({ districts: [district(4_100_000, null), district(8_900_000, null)] }), { low: 4_000_000, high: 9_000_000, is_sample: false });
    assert.equal(monthlyCostRange({ districts: [district(5_000_000, true, true)] })?.is_sample, true);
    assert.equal(monthlyCostRange({ districts: [district(null, null)] }), null);
});
