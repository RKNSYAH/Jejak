import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLiveOnboarding, isTopRanked, labeledDistrictIds, monthlyCostEstimate, profilePreviewPreferences } from "../app/engine/onboarding/livePreview";
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
    assert.equal(preview.districts.find((item) => item.district.zone_id === "jakarta-selatan-b")?.eligible, null);
    assert.ok(preview.districts.find((item) => item.district.zone_id === "jakarta-selatan-b")?.warnings.includes("Sewa rata-rata di atas batas"));
    assert.ok(preview.ranked.some((item) => item.district.zone_id === "jakarta-selatan-b"));
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

test("environment weight without park and facility counts does not change district ranking", () => {
    const rank = (environment: number) => evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: null,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: null, commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 0, affordability: 100, mobility: 0, environment: 0 },
        priorityWeights: { career: 0, education: 0, housing: 1 - environment, cost_of_living: 0, commute: 0, environment },
    }, 4, { cities, areas, destinations: [] }).ranked.map(({ district, score }) => [district.zone_id, score]);

    assert.deepEqual(rank(0.5), rank(0));
});

test("environment scores mapped parks and facilities per km², not raw counts", () => {
    const withPlaces = [
        { ...areas[0], area_km2: 10, park_count: 10, public_facility_count: 10 },
        { ...areas[1], area_km2: 2, park_count: 4, public_facility_count: 4 },
    ] satisfies OnboardingArea[];
    const preview = evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: null,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: null, commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 0, affordability: 0, mobility: 0, environment: 100 },
        priorityWeights: { career: 0, education: 0, housing: 0, cost_of_living: 0, commute: 0, environment: 1 },
    }, 4, { cities, areas: withPlaces, destinations: [] });

    // Fewer places overall, but twice as dense.
    assert.deepEqual(preview.ranked.map(({ district, score }) => [district.zone_id, score]), [["jakarta-selatan-b", 100], ["jakarta-selatan-a", 0]]);
    assert.ok(preview.ranked[0].reasons.includes("4 taman · 4 fasilitas umum · OpenStreetMap"));
});

test("a slightly cheaper city living cost does not outrank much cheaper rent", () => {
    const pricier = { ...areas[1], zone_id: "jakarta-pusat-b", city_id: "jakarta-pusat", city_name: "Kota Administrasi Jakarta Pusat",
        living_cost: { ...areas[1].living_cost!, value: 2_900_000 } } satisfies OnboardingArea;
    const preview = evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: null,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: null, commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 0, affordability: 100, mobility: 0, environment: 0 },
        priorityWeights: { career: 0, education: 0, housing: 0.5, cost_of_living: 0.5, commute: 0, environment: 0 },
    }, 4, { cities, areas: [areas[0], pricier], destinations: [] });

    assert.deepEqual(preview.ranked.map((item) => item.district.zone_id), ["jakarta-selatan-a", "jakarta-pusat-b"]);
});

test("map bubbles go to the top five, then the nearest other ranked districts", () => {
    const district = (id: string, rank: number, distanceKm: number | null, beyondReach = false) =>
        ({ district: { zone_id: id }, rank, distanceKm, beyondReach }) as unknown as Parameters<typeof labeledDistrictIds>[0]["ranked"][number];
    const ranked = [
        ...["a", "b", "c", "d", "e"].map((id, index) => district(id, index + 1, 20)),
        ...Array.from({ length: 10 }, (_, index) => district(`far-${index}`, index + 6, 30 - index)),
        district("near-beyond", 16, 1, true),
    ];
    const ids = [...labeledDistrictIds({ ranked })];
    assert.deepEqual(ids, ["a", "b", "c", "d", "e", "near-beyond", "far-9", "far-8", "far-7", "far-6"]);
    assert.deepEqual([...labeledDistrictIds({ ranked: ranked.map((item) => ({ ...item, distanceKm: null })) })].slice(5),
        ["far-0", "far-1", "far-2", "far-3", "far-4"]);
});

test("one extreme rent does not push every other district toward 100", () => {
    const extreme = { ...areas[1], zone_id: "jakarta-selatan-c", facts: [{ ...areas[1].facts[0], value: 28_000_000 }] } satisfies OnboardingArea;
    const scores = (input: OnboardingArea[]) => evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: 8_000_000, maximumRent: 2_000_000,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: null, commuteMinutes: null, overBudget: "mark",
        weights: { opportunity: 0, affordability: 100, mobility: 0, environment: 0 },
        priorityWeights: { career: 0.45, education: 0, housing: 0.36, cost_of_living: 0.14, commute: 0.05, environment: 0 },
    }, 2, { cities, areas: input, destinations: [] }).districts.slice(0, 2).map((item) => item.score);

    assert.deepEqual(scores([...areas, extreme]), scores(areas));
    assert.ok(scores(areas)[1]! < 90);
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

test("rent median above limit stays ranked as unverified; total monthly budget remains strict", () => {
    const withRent = (value: number) => ({ ...areas[0], facts: [{ ...areas[0].facts[0], value }] }) satisfies OnboardingArea;
    const evaluate = (rent: number) => evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: 2_000_000,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: "transit", commuteMinutes: 45, overBudget: "mark",
        weights: { opportunity: 40, affordability: 30, mobility: 20, environment: 10 },
    }, 2, { cities, areas: [withRent(rent)], destinations: [] }).districts[0];

    const within = evaluate(2_000_000);
    assert.equal(within.eligible, true);

    for (const rent of [2_000_001, 2_100_000, 2_200_000]) {
        const over = evaluate(rent);
        assert.equal(over.eligible, null);
        assert.equal(over.financialEligible, null);
        assert.ok(over.warnings.includes("Sewa rata-rata di atas batas"));
        assert.ok(over.unknowns.includes("Ketersediaan sewa di bawah batas belum terverifikasi"));
        assert.equal(over.rank, 1);
    }

    const comparison = evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: null, maximumRent: 2_000_000,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: "transit", commuteMinutes: 45, overBudget: "mark",
        weights: { opportunity: 0, affordability: 100, mobility: 0, environment: 0 },
    }, 2, { cities, areas, destinations: [] });
    const cheaper = comparison.districts.find((item) => item.district.zone_id === "jakarta-selatan-a");
    const overLimit = comparison.districts.find((item) => item.district.zone_id === "jakarta-selatan-b");
    assert.ok(cheaper && overLimit && cheaper.score !== null && overLimit.score !== null);
    assert.ok(overLimit.score < cheaper.score);
    assert.equal(overLimit?.rank, 2);

    const monthlyCostPreview = (budget: number) => evaluateLiveOnboarding({
        goal: "work", cityId: cities[0].city_id, monthlyBudget: budget, maximumRent: null,
        housing: ["kos"], destinationId: null, destinationName: null, destinationPoint: null,
        transport: "transit", commuteMinutes: 45, overBudget: "mark",
        weights: { opportunity: 40, affordability: 30, mobility: 20, environment: 10 },
    }, 2, { cities, areas: [areas[0]], destinations: [] }).districts[0];

    assert.equal(monthlyCostPreview(4_800_000).eligible, true);
    assert.equal(monthlyCostPreview(4_799_999).eligible, false);
});

test("monthly cost average uses complete costs from top recommendations, including over-limit medians", () => {
    const district = (monthlyCost: number | null, eligible: boolean | null, rank: number | null, beyondReach = false, is_sample = false) => ({
        district: { ...areas[0], is_sample }, rentFact: null, monthlyCost, eligible, financialEligible: eligible, rank, beyondReach,
    }) as unknown as Parameters<typeof monthlyCostEstimate>[0]["districts"][number];
    const estimate = (districts: ReturnType<typeof district>[]) => ({ districts }) as Parameters<typeof monthlyCostEstimate>[0];

    // Unranked and beyond-reach districts do not affect the estimate; over-limit rent data still contributes.
    assert.deepEqual(monthlyCostEstimate(estimate([district(5_720_000, true, 1), district(6_830_000, true, 2),
        district(28_400_000, null, 3), district(3_000_000, true, 6), district(2_000_000, true, 4, true), district(null, null, 5)])),
        { average: 13_650_000, is_sample: false });
    assert.deepEqual(monthlyCostEstimate(estimate([district(6_000_000, true, 1)])), { average: 6_000_000, is_sample: false });
    assert.deepEqual(monthlyCostEstimate(estimate([district(4_100_000, null, 1), district(8_900_000, null, 2)])),
        { average: 6_500_000, is_sample: false });
    assert.equal(monthlyCostEstimate(estimate([district(5_000_000, true, 1, false, true)]))?.is_sample, true);
    assert.equal(monthlyCostEstimate(estimate([district(5_000_000, true, 1), district(null, null, 2)]))?.average, 5_000_000);
    assert.equal(monthlyCostEstimate(estimate([district(null, null, 1)])), null);
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

test("changing the commute time reorders and rescales recommendations without excluding districts", () => {
    const weights = { opportunity: 0, affordability: 80, mobility: 20, environment: 0 };
    const evaluate = (step: 2 | 3, commuteMinutes: number) => evaluateLiveOnboarding(
        { ...spreadPreferences(nearDestination), transport: "car", commuteMinutes, weights }, step, { cities, areas: spread, destinations: [] });
    const order = (preview: ReturnType<typeof evaluate>) => preview.ranked.map((item) => item.district.zone_id);

    // Cost dominates, so with no reach applied (step 2) the cheapest, farthest district leads.
    assert.deepEqual(order(evaluate(2, 60)), ["far", "mid", "near"]);

    // 60 min by car still reaches "mid" (edge) but not "far"; 15 min reaches only "near". In the tight reach the
    // cheapest district is too far to outrank a nearer one.
    const wide = evaluate(3, 60), tight = evaluate(3, 15);
    assert.deepEqual(order(wide), ["mid", "near", "far"]);
    assert.deepEqual(order(tight), ["near", "mid", "far"]);
    assert.deepEqual(wide.ranked.filter(isTopRanked).map((item) => item.district.zone_id), ["mid", "near"]);
    assert.deepEqual(tight.ranked.filter(isTopRanked).map((item) => item.district.zone_id), ["near"]);

    // The reach never excludes a district; a far one regains score as the reach widens.
    const score = (preview: ReturnType<typeof evaluate>, id: string) => preview.districts.find((item) => item.district.zone_id === id)!.score!;
    assert.equal(score(tight, "near"), score(wide, "near"));
    assert.ok(score(tight, "far") < score(wide, "far"));
    assert.ok([...wide.districts, ...tight.districts].every((item) => item.eligible === null && item.commuteMinutes === null));
});
