import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLiveOnboarding, isTopRanked, monthlyCostRange, profilePreviewPreferences } from "../app/engine/onboarding/livePreview";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import type { LivePreviewPreferences, OnboardingArea, OnboardingCity } from "../app/engine/onboarding/types";
import type { PersistedRelocationProfile } from "../app/engine/lib/relocationProfile";
import { buildFormRelocationProfile } from "../app/engine/lib/relocationProfile";

test("ambiguous active and cycling profiles never silently request walking estimates", () => {
    const walking = buildFormRelocationProfile({ ...initialFormAnswers, transport: "active" });
    assert.equal(profilePreviewPreferences(walking, [])?.transport, "active");
    for (const activeMode of [undefined, null, "bicycle"]) {
        const ambiguous = { ...walking, soft_preferences: { ...walking.soft_preferences, active_mode: activeMode } };
        assert.equal(profilePreviewPreferences(ambiguous, [])?.transport, null);
    }
});

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
    assert.equal(preview.ranked[0]?.eligible, null);
    assert.equal(preview.ranked[0]?.financialEligible, true);
    assert.equal(preview.ranked[0]?.commuteMinutes, null);
    assert.ok(preview.ranked[0]?.unknowns.includes("Waktu tempuh belum dinilai"));
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

test("only districts with positive rent data for the requested housing type can be recommended", () => {
    const companyFact = (value: number) => ({ metric: "company_count", value, unit: "company", source: "Direktori perusahaan",
        period_end: null, evidence_type: "derived" as const, limitations: null, is_sample: false });
    const unsupported = [
        { ...areas[1], zone_id: "missing-rent", facts: [companyFact(100)] },
        { ...areas[1], zone_id: "unavailable-rent", facts: [{ ...areas[1].facts[0], evidence_type: "unavailable" as const }, companyFact(100)] },
        { ...areas[1], zone_id: "wrong-housing-type", facts: [{ ...areas[1].facts[0], metric: "median_monthly_rent_idr:apartment", dimension_value: "apartment" }, companyFact(100)] },
        { ...areas[1], zone_id: "zero-rent", facts: [{ ...areas[1].facts[0], value: 0 }, companyFact(100)] },
    ] satisfies OnboardingArea[];
    const supported = { ...areas[0], facts: [...areas[0].facts, companyFact(1)] };
    const preview = evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: null,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: null, commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 100, affordability: 0, mobility: 0, environment: 0 },
    }, 4, { cities, areas: [supported, ...unsupported], destinations: [] });

    assert.deepEqual(preview.ranked.map((item) => item.district.zone_id), [supported.zone_id]);
    for (const id of ["missing-rent", "unavailable-rent", "wrong-housing-type", "zero-rent"]) {
        const item = preview.districts.find((district) => district.district.zone_id === id)!;
        assert.equal(item.rank, null);
        assert.equal(item.rent, null);
    }
    assert.equal(preview.districts.find((item) => item.district.zone_id === "missing-rent")?.score, 100);
    assert.deepEqual(evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: null,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: null, commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 100, affordability: 0, mobility: 0, environment: 0 },
    }, 4, { cities, areas: unsupported, destinations: [] }).ranked, []);
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

test("saved priority weights reorder districts without a destination", () => {
    const withCompanies = areas.map((area, index) => ({ ...area, facts: [...area.facts, {
        metric: "company_count", value: index === 0 ? 0 : 10, unit: "company", source: "Direktori perusahaan",
        period_end: null, evidence_type: "derived" as const, limitations: null, is_sample: false,
    }] }));
    const topFor = (priority_weights: Record<string, number>) => {
        const preferences = profilePreviewPreferences({
            schema_version: "relocation-profile-v1",
            hard_constraints: { goal: "work", destination_cities: [cities[0].city_name] },
            soft_preferences: { goal: "work", housing_types: ["kos"] },
            priority_weights, taxonomy_version: "test", contract_version: "lf05-v2",
        }, cities)!;
        return evaluateLiveOnboarding(preferences, 4, { cities, areas: withCompanies, destinations: [] }).ranked[0]?.district.zone_id;
    };

    assert.equal(topFor({ career: 1, housing: 0.2 }), "jakarta-selatan-b");
    assert.equal(topFor({ career: 0.2, housing: 1 }), "jakarta-selatan-a");
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
        district: { ...areas[0], is_sample }, rentFact: null, monthlyCost, eligible, financialEligible: eligible,
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

// Three kecamatan on one line: the nearest to the destination is the priciest, the farthest the cheapest.
const spread = [["near", 106.82, 2_000_000], ["mid", 106.9, 1_600_000], ["far", 107.2, 1_000_000]].map(([id, longitude, rent]) => ({
    ...areas[0], zone_id: String(id), zone_name: String(id), center: [Number(longitude), -6.24] as [number, number],
    transit_stop_count: 0, facts: [{ ...areas[0].facts[0], value: Number(rent) }],
}) satisfies OnboardingArea);
const nearDestination: [number, number] = [106.82, -6.24];

function spreadPreferences(destinationPoint: [number, number] | null): LivePreviewPreferences {
    return {
        goal: "work", cityId: cities[0].city_id, monthlyBudget: 8_000_000, maximumRent: 3_000_000, housing: ["kos"],
        destinationId: null, destinationName: destinationPoint ? "Titik pilihanmu" : null, destinationPoint,
        transport: "transit", commuteMinutes: 45, overBudget: "mark",
        weights: { opportunity: 0, affordability: 20, mobility: 80, environment: 0 },
    };
}

test("step 2 ranks by distance to the chosen destination without excluding or inventing a commute time", () => {
    const rankOf = (destinationPoint: [number, number] | null) => evaluateLiveOnboarding(spreadPreferences(destinationPoint), 2,
        { cities, areas: spread, destinations: [] });

    // No destination: only cost separates them, so the cheapest, farthest district leads.
    const without = rankOf(null);
    assert.deepEqual(without.ranked.map((item) => item.district.zone_id), ["far", "mid", "near"]);
    assert.ok(without.districts.every((item) => item.distanceKm === null));

    // A destination reorders them even though every district passes rent and budget.
    const withDestination = rankOf(nearDestination);
    assert.deepEqual(withDestination.ranked.map((item) => item.district.zone_id), ["near", "mid", "far"]);
    assert.deepEqual(withDestination.ranked.map((item) => item.rank), [1, 2, 3]);
    assert.ok(withDestination.districts.every((item) => item.eligible === true));
    assert.ok(withDestination.districts.every((item) => item.commuteMinutes === null));
    const [near, mid, far] = ["near", "mid", "far"].map((id) => withDestination.districts.find((item) => item.district.zone_id === id)!);
    assert.ok(near.distanceKm! < mid.distanceKm! && mid.distanceKm! < far.distanceKm!);
    assert.ok(near.reasons.some((reason) => reason.startsWith("Sekitar") && reason.endsWith("km dari tujuan")));
    assert.ok(far.reasons.some((reason) => reason.endsWith("km dari tujuan")));
});

test("a saved profile's commute weight ranks nearer districts first only once a destination exists", () => {
    const priorityWeights = { career: 0, education: 0, housing: 0.2, cost_of_living: 0, commute: 0.8 };
    const rankOf = (destinationPoint: [number, number] | null) => evaluateLiveOnboarding(
        { ...spreadPreferences(destinationPoint), priorityWeights }, 2, { cities, areas: spread, destinations: [] })
        .ranked.map((item) => item.district.zone_id);

    assert.deepEqual(rankOf(null), ["far", "mid", "near"]);
    assert.deepEqual(rankOf(nearDestination), ["near", "mid", "far"]);
});

test("changing the commute time reorders the recommendations without excluding or rescoring districts", () => {
    const weights = { opportunity: 0, affordability: 80, mobility: 20, environment: 0 };
    const evaluate = (step: 2 | 3, commuteMinutes: number) => evaluateLiveOnboarding(
        { ...spreadPreferences(nearDestination), transport: "car", commuteMinutes, weights }, step, { cities, areas: spread, destinations: [] });
    const order = (preview: ReturnType<typeof evaluate>) => preview.ranked.map((item) => item.district.zone_id);

    // Cost dominates, so with no reach applied (step 2) the cheapest, farthest district leads.
    assert.deepEqual(order(evaluate(2, 60)), ["far", "mid", "near"]);

    // 60 min by car still reaches "mid" (edge) but not "far"; 15 min reaches only "near".
    const wide = evaluate(3, 60), tight = evaluate(3, 15);
    assert.deepEqual(order(wide), ["mid", "near", "far"]);
    assert.deepEqual(order(tight), ["near", "far", "mid"]);
    assert.deepEqual(wide.ranked.filter(isTopRanked).map((item) => item.district.zone_id), ["mid", "near"]);
    assert.deepEqual(tight.ranked.filter(isTopRanked).map((item) => item.district.zone_id), ["near"]);

    // The reach is an estimate: it never excludes a district and never changes a score.
    assert.deepEqual(tight.districts.map((item) => item.score), wide.districts.map((item) => item.score));
    assert.ok([...wide.districts, ...tight.districts].every((item) => item.eligible === null && item.commuteMinutes === null));
});
