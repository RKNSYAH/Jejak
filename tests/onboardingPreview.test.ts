import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultAnswers, defaultWeights, initialFormAnswers } from "../app/engine/onboarding/demoData";
import { followSuggestedWeights, parseFormSession, priorityKeys, redistributeWeights, suggestWeights, toggleHousing, validateFormStep } from "../app/engine/onboarding/preview";

test("housing choices toggle, while unsure is exclusive", () => {
    assert.deepEqual(toggleHousing(["kos"], "unsure"), ["unsure"]);
    assert.deepEqual(toggleHousing(["unsure"], "apartment"), ["apartment"]);
    assert.deepEqual(toggleHousing(["kos", "apartment"], "kos"), ["apartment"]);
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

test("suggested priorities follow earlier answers, sum to 100, and leave user-edited weights alone", () => {
    assert.deepEqual(suggestWeights(initialFormAnswers), defaultWeights);
    const tight = { ...initialFormAnswers, monthlyBudget: 3_000_000, overBudget: "hide" as const, commuteMinutes: 15 as const };
    const suggested = suggestWeights(tight);
    assert.equal(priorityKeys.reduce((sum, key) => sum + suggested[key], 0), 100);
    assert.ok(suggested.affordability > defaultWeights.affordability && suggested.mobility > defaultWeights.mobility);
    assert.ok(suggestWeights({ ...initialFormAnswers, commuteMinutes: 60 }).mobility < defaultWeights.mobility);
    assert.deepEqual(followSuggestedWeights(initialFormAnswers, tight).weights, suggested);
    const edited = { ...initialFormAnswers, weights: redistributeWeights(defaultWeights, "environment", 50) };
    assert.equal(followSuggestedWeights(edited, { ...edited, ...tight, weights: edited.weights }).weights, edited.weights);
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

test("removed optional questions accept old and new drafts without inventing defaults", () => {
    assert.equal(initialFormAnswers.experience, null);
    assert.deepEqual(initialFormAnswers.extras, []);
    const session = { version: 1, status: "active", step: 4, answers: structuredClone(defaultAnswers) };
    assert.equal(parseFormSession(session)?.answers.experience, "early");
    const answers: Partial<typeof session.answers> = structuredClone(session.answers);
    delete answers.experience;
    delete answers.extras;
    const parsed = parseFormSession({ ...session, answers });
    assert.equal(parsed?.answers.experience, null);
    assert.deepEqual(parsed?.answers.extras, []);
    assert.equal(parseFormSession({ ...session, answers: { ...answers, experience: "unknown" } }), null);
    assert.equal(parseFormSession({ ...session, answers: { ...answers, extras: ["unknown"] } }), null);
});
