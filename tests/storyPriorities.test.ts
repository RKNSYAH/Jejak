import assert from "node:assert/strict";
import { test } from "node:test";
import { storyPriorityWeights, updateStoryPriority } from "../app/engine/onboarding/storyPriorities";
import { priorityKeys } from "../app/engine/onboarding/preview";
import { validateLF05Proposal } from "../app/engine/lib/lf05Validation";
import { onboardingTaxonomy } from "../app/engine/extractUserProfile";

test("story sliders retain six-dimensional splits and always sum to 100%", () => {
    const original = { career: 0.3, education: 0.2, housing: 0.15, cost_of_living: 0.05, commute: 0.2, environment: 0.1 };
    assert.deepEqual(storyPriorityWeights(original), { opportunity: 50, affordability: 20, mobility: 20, environment: 10 });
    for (const key of priorityKeys) for (const value of [0, 1, 33, 65, 99, 100]) {
        const weights = updateStoryPriority(original, "both", key, value);
        const displayed = storyPriorityWeights(weights);
        assert.equal(displayed[key], value);
        assert.equal(Object.values(displayed).reduce((sum, weight) => sum + weight, 0), 100);
        assert.ok(Math.abs(Object.values(weights).reduce((sum, weight) => sum + weight, 0) - 1) < 0.000001);
        if (weights.education) assert.ok(Math.abs(weights.career / weights.education - 1.5) < 0.000001);
        if (weights.cost_of_living) assert.ok(Math.abs(weights.housing / weights.cost_of_living - 3) < 0.000001);
        validateLF05Proposal({ hard_constraints: { goal: "both" }, soft_preferences: {}, priority_weights: weights,
            inferred_fields: [], clarification_questions: [], requires_confirmation: true, confirmed: false,
            taxonomy_version: onboardingTaxonomy.version, contract_version: "lf05-v2", writes_performed: false,
            decision_trace: {}, runtime_usage: null }, onboardingTaxonomy);
    }
    assert.equal(original.career, 0.3);
});

test("empty and single-dimension story priorities can be edited for work, study, and both", () => {
    assert.deepEqual(storyPriorityWeights({}), { opportunity: 0, affordability: 0, mobility: 0, environment: 0 });
    for (const goal of ["work", "study", "both"] as const) {
        const weights = updateStoryPriority({}, goal, "opportunity", 60);
        assert.equal(weights.career, goal === "study" ? 0 : goal === "both" ? 0.3 : 0.6);
        assert.equal(weights.education, goal === "work" ? 0 : goal === "both" ? 0.3 : 0.6);
        assert.equal(Object.values(storyPriorityWeights(weights)).reduce((sum, value) => sum + value, 0), 100);
    }
    assert.equal(storyPriorityWeights({ career: 1 / 3, housing: 1 / 3, commute: 1 / 3 }).opportunity, 33);
    const weights = updateStoryPriority({ career: 1 }, "work", "opportunity", 0);
    assert.equal(Object.values(storyPriorityWeights(weights)).reduce((sum, value) => sum + value, 0), 100);
});
