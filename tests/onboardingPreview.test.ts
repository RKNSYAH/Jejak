import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { defaultAnswers, demoDistricts } from "../app/engine/onboarding/demoData";
import { availableDestinations, evaluateOnboarding, parseFormSession, priorityKeys, redistributeWeights, toggleHousing, validateFormStep } from "../app/engine/onboarding/preview";
import { isBoundary } from "../app/engine/lib/zoneGeometry";

test("the reference rent scenario qualifies eight districts and excludes expensive areas", () => {
    const preview = evaluateOnboarding(defaultAnswers, 2);
    assert.equal(preview.affordableCount, 8);
    assert.equal(preview.eligibleCount, 8);
    assert.deepEqual(preview.districts.filter((item) => !item.eligible).map((item) => item.district.id).sort(), ["kebayoran-baru", "setiabudi"]);
    assert.equal(evaluateOnboarding({ ...defaultAnswers, maximumRent: 1_500_000 }, 2).eligibleCount, 2);
    assert.equal(evaluateOnboarding({ ...defaultAnswers, monthlyBudget: 3_000_000 }, 2).eligibleCount, 0);
});

test("housing alternatives use an available selected type, while unsure is exclusive", () => {
    assert.deepEqual(toggleHousing(["kos"], "unsure"), ["unsure"]);
    assert.deepEqual(toggleHousing(["unsure"], "apartment"), ["apartment"]);
    assert.deepEqual(toggleHousing(["kos", "apartment"], "kos"), ["apartment"]);
    assert.equal(evaluateOnboarding({ ...defaultAnswers, housing: ["apartment"] }, 2).affordableCount, 0);
    assert.equal(evaluateOnboarding({ ...defaultAnswers, housing: ["apartment", "kos"] }, 2).affordableCount, 8);
});

test("commute settings and unknown destinations genuinely change eligibility", () => {
    const base = evaluateOnboarding(defaultAnswers);
    assert.equal(base.eligibleCount, 4);
    assert.ok(evaluateOnboarding({ ...defaultAnswers, transport: "motorcycle" }).eligibleCount > base.eligibleCount);
    assert.ok(evaluateOnboarding({ ...defaultAnswers, departure: "midday" }).eligibleCount > base.eligibleCount);
    assert.equal(evaluateOnboarding({ ...defaultAnswers, destinationId: null }).eligibleCount, 8);
    assert.ok(evaluateOnboarding({ ...defaultAnswers, destinationId: "simatupang" }).ranked.some((item) => item.district.id === "cilandak"));
    assert.ok(base.districts.filter((item) => !item.eligible).every((item) => item.rank === null));
});

test("priority edits preserve integer 100-percent totals, including zero-share extremes", () => {
    let weights = { ...defaultAnswers.weights };
    for (const key of priorityKeys) for (let value = 0; value <= 100; value++) {
        weights = redistributeWeights(weights, key, value);
        assert.equal(weights[key], value);
        assert.equal(Object.values(weights).reduce((sum, weight) => sum + weight, 0), 100);
        assert.ok(Object.values(weights).every((weight) => Number.isInteger(weight) && weight >= 0));
    }
    assert.deepEqual(redistributeWeights({ opportunity: 100, affordability: 0, mobility: 0, environment: 0 }, "opportunity", 40), {
        opportunity: 40, affordability: 20, mobility: 20, environment: 20,
    });
});

test("weights reorder eligible districts without relaxing hard limits", () => {
    const common = { ...defaultAnswers, destinationId: null };
    const career = evaluateOnboarding({ ...common, weights: { opportunity: 100, affordability: 0, mobility: 0, environment: 0 } });
    const environment = evaluateOnboarding({ ...common, weights: { opportunity: 0, affordability: 0, mobility: 0, environment: 100 } });
    assert.equal(career.ranked[0].district.id, "tebet");
    assert.equal(environment.ranked[0].district.id, "jagakarsa");
    assert.deepEqual(career.ranked.map((item) => item.district.id).sort(), environment.ranked.map((item) => item.district.id).sort());
    assert.ok(!career.ranked.some((item) => item.district.id === "setiabudi"));
    assert.ok(demoDistricts.every((district) => district.is_sample));
});

test("unknown cities provide no copied district results and study has campus choices", () => {
    assert.equal(evaluateOnboarding({ ...defaultAnswers, city: "bandung" }).available, false);
    assert.equal(evaluateOnboarding({ ...defaultAnswers, city: "yogyakarta" }).districts.length, 0);
    assert.equal(evaluateOnboarding({ ...defaultAnswers, city: "unsure" }).districts.length, 10);
    assert.ok(availableDestinations("study").every((item) => item.kind === "campus"));
});

test("draft parsing rejects corrupt and invalid completed profiles", () => {
    const session = { version: 1, status: "active", step: 2, answers: structuredClone(defaultAnswers) };
    assert.equal(parseFormSession(session)?.step, 2);
    assert.equal(parseFormSession({ ...session, version: 99 }), null);
    assert.equal(parseFormSession({ ...session, answers: { ...session.answers, weights: { opportunity: 100 } } }), null);
    assert.equal(parseFormSession({ ...session, answers: { ...session.answers, destinationId: "unknown" } }), null);
    assert.equal(parseFormSession({ ...session, answers: { ...session.answers, monthlyBudget: null } }), null);
    assert.ok(validateFormStep({ ...defaultAnswers, maximumRent: 7_000_000 }, 2).maximumRent);
    assert.equal(parseFormSession({ ...session, status: "completed", answers: { ...session.answers, monthlyBudget: 0 } }), null);
});

test("bundled demo geometry has ten trusted, valid boundaries matching sample IDs", () => {
    const geometry = JSON.parse(readFileSync(new URL("../public/onboarding/jakarta-selatan.geojson", import.meta.url), "utf8"));
    assert.equal(geometry.features.length, 10);
    assert.ok(geometry.source_url.startsWith("https://geoservices.big.go.id/"));
    assert.deepEqual(geometry.features.map((feature: { properties: { zone_id: string } }) => feature.properties.zone_id).sort(), demoDistricts.map((district) => district.id).sort());
    assert.ok(geometry.features.every((feature: { geometry: unknown }) => isBoundary(feature.geometry)));
});
