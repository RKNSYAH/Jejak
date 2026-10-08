import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateLiveOnboarding, formPreviewPreferences, profilePreviewPreferences } from "../app/engine/onboarding/livePreview";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import { buildFormRelocationProfile } from "../app/engine/lib/relocationProfile";
import type { LivePreviewPreferences, OnboardingArea, OnboardingCity } from "../app/engine/onboarding/types";
import type { RegionFact } from "../app/engine/types";

const sector = "software_and_it_services";
const cities: OnboardingCity[] = [{ city_id: "jakarta-selatan", city_name: "Jakarta Selatan", district_count: 2, center: null, is_sample: false }];
const fact = (metric: string, value: number, sector_ids?: string[]): RegionFact => ({
    metric, value, sector_ids, unit: "count", source: "Sourced district data", period_end: "2026-01-01",
    evidence_type: "observed", limitations: null, is_sample: false,
});
const area = (id: string, facts: RegionFact[]): OnboardingArea => ({
    zone_id: id, zone_name: id, city_id: cities[0].city_id, city_name: cities[0].city_name,
    is_sample: false, center: null, facts, campuses: [], transit_stop_count: 0, living_cost: null,
});
const answers = { ...initialFormAnswers, city: cities[0].city_id, sector,
    weights: { opportunity: 100, affordability: 0, mobility: 0, environment: 0 } };
const base: LivePreviewPreferences = { ...formPreviewPreferences(answers), monthlyBudget: null, maximumRent: null, commuteMinutes: null };
const evaluate = (preferences: LivePreviewPreferences, areas: OnboardingArea[]) =>
    evaluateLiveOnboarding(preferences, 1, { cities, areas, destinations: [] });

test("form and confirmed profile retain the same career/study criteria and score shared sector evidence", () => {
    const both = { ...answers, goal: "both" as const, studyField: "Teknologi informasi", education: "S1" };
    const form = formPreviewPreferences(both);
    const saved = profilePreviewPreferences(buildFormRelocationProfile(both), cities)!;
    for (const key of ["occupation", "targetOccupations", "sectors", "studyField", "educationLevel", "careerStage"] as const) {
        assert.deepEqual(form[key], saved[key], key);
    }
    assert.deepEqual(saved.targetOccupations, ["software_engineer"]);
    assert.equal(saved.careerStage, null, "hidden legacy experience is not a confirmed preference");
    const areas = [area("a", [fact("company_count", 2, [sector])]), area("b", [fact("company_count", 10, [sector])])];
    const scores = (preferences: LivePreviewPreferences) => evaluate(preferences, areas).districts.map((item) => item.score);
    assert.deepEqual(scores(form), [0, 100]);
    assert.deepEqual(scores(saved), scores(form));
});

test("only mapped sector facts affect sector fit; unrelated generic company totals do not", () => {
    const areas = [
        area("a", [fact("company_count", 10_000), fact("employed_people:kbli_j", 20, [sector]), { ...fact("median_monthly_rent_idr", 1_500_000), unit: "IDR" }]),
        area("b", [fact("company_count", 1), fact("employed_people:kbli_j", 100, [sector]), { ...fact("median_monthly_rent_idr", 1_500_000), unit: "IDR" }]),
    ];
    assert.equal(evaluate(base, areas).ranked[0].district.zone_id, "b");
    const unsupported = evaluate({ ...base, sectors: ["telecommunications"] }, areas);
    assert.ok(unsupported.districts.every((item) => item.score === null));
    assert.ok(unsupported.districts[0].unknowns.includes("Data sektor pilihanmu belum tersedia"));
    const missingMapping = areas.map((item) => ({ ...item, facts: item.facts.map((value) => ({ ...value, sector_ids: undefined })) }));
    assert.equal(evaluate(base, missingMapping).ranked.length, 0);
});

test("occupation and education preferences cannot be satisfied by generic company/campus counts", () => {
    const areas = [area("a", [fact("company_count", 100)])];
    const career = evaluate({ ...base, sectors: [], careerStage: "fresh_graduate" }, areas);
    assert.equal(career.districts[0].score, null);
    assert.ok(career.districts[0].unknowns.includes("Kecocokan pekerjaan belum tersedia"));
    assert.ok(career.districts[0].unknowns.includes("Data tahap karier belum tersedia"));
    const campuses = [{ id: "1", name: "IT University S1", center: [106.8, -6.2] as [number, number], source: "Campus directory", source_url: null, is_sample: false }];
    const education = evaluate({ ...base, goal: "study", studyField: "Teknologi informasi", educationLevel: "S1" }, [{ ...areas[0], campuses }]);
    assert.equal(education.districts[0].score, null);
    assert.ok(education.districts[0].unknowns.includes("Data program studi pilihanmu belum tersedia"));
    assert.ok(education.districts[0].unknowns.includes("Data jenjang pendidikan pilihanmu belum tersedia"));
});

test("unsupported matching does not erase supported affordability or invent a district salary preference", () => {
    const areas = [area("a", [fact("company_count", 2, [sector]), fact("median_monthly_rent_idr", 1_000_000)]),
        area("b", [fact("company_count", 10, [sector]), fact("median_monthly_rent_idr", 2_000_000)])];
    const order = (values: OnboardingArea[]) => evaluate(base, values).ranked.map((item) => item.district.zone_id);
    assert.deepEqual(order(areas), order(areas.map((item, index) => ({ ...item,
        facts: [...item.facts, fact("average_monthly_wage_idr", index ? 1_000_000 : 100_000_000)],
    }))));
    const housing = evaluate({ ...base, sectors: [], weights: { opportunity: 50, affordability: 50, mobility: 0, environment: 0 } }, areas);
    assert.equal(housing.ranked[0].district.zone_id, "a");
    assert.ok(housing.districts.every((item) => item.score !== null && item.unknowns.includes("Kecocokan pekerjaan belum tersedia")));
});

test("vacancies and industry worker counts normalize separately, with sourced zeros preserved", () => {
    const areas = [area("a", [fact("opening_count", 5, [sector]), fact("employed_people:kbli_j", 100, [sector])]),
        area("b", [fact("opening_count", 0, [sector]), fact("employed_people:kbli_j", 100_000, [sector])])];
    assert.deepEqual(evaluate(base, areas).districts.map((item) => item.score), [50, 50]);
    const unavailable = areas.map((item) => ({ ...item, facts: item.facts.map((value) => ({ ...value, evidence_type: "unavailable" as const })) }));
    assert.ok(evaluate(base, unavailable).districts.every((item) => item.score === null));
});

test("uneven career coverage uses common indicators rather than comparing different evidence bases", () => {
    const areas = [area("a", [fact("company_count", 2, [sector]), fact("opening_count", 50, [sector])]),
        area("b", [fact("company_count", 10, [sector])]), area("missing", [])];
    const result = evaluate(base, areas);
    assert.deepEqual(result.districts.map((item) => item.score), [0, 100, null], "only company counts are comparable");
    const disjoint = evaluate(base, [area("a", [fact("company_count", 2, [sector])]), area("b", [fact("opening_count", 50, [sector])])]);
    assert.ok(disjoint.districts.every((item) => item.score === null));
    assert.ok(disjoint.districts[0].unknowns.includes("Data sektor belum sebanding"));
});
