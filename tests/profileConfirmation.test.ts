import { test } from "node:test";
import assert from "node:assert/strict";
import { missingProfileItems, profileChips, profileFeasibility } from "../app/engine/onboarding/profileConfirmation";
import type { LiveOnboardingPreview } from "../app/engine/onboarding/types";

const profile = {
    hard_constraints: {
        destination_cities: ["Jakarta Selatan"],
        monthly_budget: { amount: 6_000_000, currency: "IDR", period: "month" },
        housing_budget: { amount: 4_000_000, currency: "IDR", period: "month" },
        commute_minutes: 45,
    },
    soft_preferences: { goal: "work", occupation: "Software engineer", housing_types: ["kos"], transport_mode: "transit" },
    priority_weights: { career: 0.5, housing: 0.2, commute: 0.2, education: 0, cost_of_living: 0.1 },
};

test("confirmation chips summarize goal, city, rent, commute, and the top priority", () => {
    assert.deepEqual(profileChips(profile), ["Kerja · Software engineer", "Jakarta Selatan", "Kos ≤ Rp4 jt", "≤ 45 mnt", "Karier 50%"]);
});

test("missing items list the empty limits, a city-only destination, and unconfirmed priorities", () => {
    assert.deepEqual(missingProfileItems(profile, ["priorities"]), ["Lokasi kantor", "Prioritas belum dikonfirmasi"]);
    assert.deepEqual(missingProfileItems({
        ...profile, soft_preferences: { ...profile.soft_preferences, destination: { name: "Kuningan", precision: "area" } },
    }), []);
    assert.deepEqual(missingProfileItems({ hard_constraints: {}, soft_preferences: { goal: "study" }, priority_weights: {} }),
        ["Kota tujuan", "Anggaran bulanan", "Batas sewa", "Waktu tempuh", "Moda transportasi", "Lokasi kampus", "Prioritas"]);
});

test("feasibility counts kecamatan that pass every limit and stays unrated without evidence", () => {
    const preview = (eligible: (boolean | null)[]) => ({
        available: true,
        districts: eligible.map((value) => ({ eligible: value })),
        eligibleCount: eligible.filter((value) => value === true).length,
    }) as unknown as LiveOnboardingPreview;
    assert.deepEqual(profileFeasibility(null), { level: 0, label: "Belum dihitung" });
    assert.deepEqual(profileFeasibility(preview([null, null])), { level: 0, label: "Belum dihitung" });
    assert.deepEqual(profileFeasibility(preview([false, false, null])), { level: 1, label: "Sulit" });
    assert.deepEqual(profileFeasibility(preview([true, false])), { level: 2, label: "Ketat" });
    assert.deepEqual(profileFeasibility(preview([true, true, true, false])), { level: 3, label: "Realistis" });
});
