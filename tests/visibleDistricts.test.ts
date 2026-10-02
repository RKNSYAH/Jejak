import assert from "node:assert/strict";
import { test } from "node:test";
import { visiblePreviewDistricts } from "../app/engine/onboarding/visibleDistricts";
import type { LiveOnboardingPreview } from "../app/engine/onboarding/types";

function preview(overBudget: "mark" | "hide") {
    return {
        districts: [true, false, null].map((eligible) => ({ eligible })),
        preferences: { overBudget },
    } as Pick<LiveOnboardingPreview, "districts" | "preferences">;
}

test("mark keeps fitting, excluded, and unknown districts available", () => {
    assert.deepEqual(visiblePreviewDistricts(preview("mark")).map((item) => item.eligible), [true, false, null]);
});

test("hide removes known exclusions, not unknown evidence", () => {
    assert.deepEqual(visiblePreviewDistricts(preview("hide")).map((item) => item.eligible), [true, null]);
    assert.equal(visiblePreviewDistricts(preview("hide"), false).length, 3);
});
