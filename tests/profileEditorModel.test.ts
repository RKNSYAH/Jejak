import assert from "node:assert/strict";
import { test } from "node:test";
import type { PersistedRelocationProfile } from "../app/engine/lib/relocationProfile";
import { displayedWeights, parseAmount, profileFieldsDiffer, profileStory, summarizeProfileChanges, updatePriority } from "../app/user/profileEditorModel";

function profile(): PersistedRelocationProfile {
    return {
        schema_version: "relocation-profile-v1",
        taxonomy_version: "2026-09",
        contract_version: "lf05-v2",
        hard_constraints: { goal: "work", monthly_budget: { amount: 4_000_000, currency: "IDR", period: "month" }, destination_cities: ["BANDUNG"] },
        soft_preferences: { destination: { name: "Bandung", precision: "city" } },
        priority_weights: { career: 0.3, education: 0.1, housing: 0.2, cost_of_living: 0.1, commute: 0.2, environment: 0.1 },
    };
}

test("profile recap addresses kamu and resolves stored city IDs without inventing a quote", () => {
    const saved = profile();
    saved.hard_constraints.destination_cities = ["bandung-kota"];
    assert.equal(profileStory(saved, [{ city_id: "bandung-kota", city_name: "Kota Bandung" }]),
        "Kamu ingin pindah untuk bekerja dengan kota tujuan Kota Bandung.");
});

test("priority editor normalizes integer percentages and preserves cost split and environment", () => {
    const current = profile();
    const next = updatePriority(current, "career", 50);
    const shown = displayedWeights(next);
    assert.equal(Object.values(shown).reduce((sum, value) => sum + value, 0), 100);
    assert.equal(shown.career, 50);
    assert.equal(next.priority_weights.environment, 0.07);
    assert.ok(Math.abs(next.priority_weights.housing / next.priority_weights.cost_of_living - 2) < 1e-10);
    assert.ok(Math.abs(Object.values(next.priority_weights).reduce((sum, value) => sum + value, 0) - 1) < 1e-10);
});

test("environment remains an editable zero-valued dimension only when explicitly retained", () => {
    const legacy = profile();
    legacy.priority_weights.environment = 0;
    assert.equal("environment" in displayedWeights(legacy), false);
    assert.equal("environment" in displayedWeights(legacy, true), true);
    const cleared = updatePriority(profile(), "environment", 0, true);
    assert.equal(cleared.priority_weights.environment, 0);
    assert.equal("environment" in displayedWeights(cleared, true), true);
});

test("profile field diff ignores object key order but finds real value changes", () => {
    assert.equal(profileFieldsDiffer({ value: { amount: 2, currency: "IDR" } }, { value: { currency: "IDR", amount: 2 } }), false);
    assert.equal(profileFieldsDiffer({ value: ["kos", "house"] }, { value: ["house", "kos"] }), true);
    const before = profile();
    const after = structuredClone(before);
    after.hard_constraints.monthly_budget = { amount: 5_000_000, currency: "IDR", period: "month" };
    const summary = summarizeProfileChanges(before, after);
    assert.equal(summary.count, 1);
    assert.deepEqual(summary.details[0], { key: "Anggaran", before: "Rp4.000.000 / bulan", after: "Rp5.000.000 / bulan" });
});

test("numeric budget parser accepts nullable whole rupiah amounts within configured limits", () => {
    assert.deepEqual(parseAmount(""), { valid: true, value: null });
    assert.deepEqual(parseAmount("0"), { valid: true, value: 0 });
    assert.deepEqual(parseAmount("1000000000"), { valid: true, value: 1_000_000_000 });
    assert.deepEqual(parseAmount("1000000001"), { valid: false, value: null });
    assert.deepEqual(parseAmount("1.5"), { valid: false, value: null });
});
