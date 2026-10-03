import assert from "node:assert/strict";
import { test } from "node:test";
import { onboardingTaxonomy } from "../app/engine/extractUserProfile";
import { buildFormRelocationProfile } from "../app/engine/lib/relocationProfile";
import type { LF05ClarificationAnswer } from "../app/engine/lib/lf05FollowUp";
import { buildNativeProfileRefinementInput, getProfileChanges, reconcileProfileRefinement, validateRelocationDraft } from "../app/engine/lib/profileRefinement";
import { defaultAnswers } from "../app/engine/onboarding/demoData";

const confirmed = buildFormRelocationProfile(defaultAnswers);
const modelProposal = (
    hard: Record<string, unknown>, soft: Record<string, unknown>, weights = confirmed.priority_weights,
    clarification_questions: string[] = [],
) => ({
    hard_constraints: hard, soft_preferences: soft, priority_weights: weights,
    inferred_fields: [], clarification_questions, requires_confirmation: true as const, confirmed: false as const,
    taxonomy_version: onboardingTaxonomy.version, contract_version: "lf05-v2" as const, writes_performed: false as const,
    decision_trace: {}, runtime_usage: null,
});

test("explicit walking subtype survives saved form and refinement without extending remote keys", () => {
    const walking = buildFormRelocationProfile({ ...defaultAnswers, transport: "active" });
    assert.equal(walking.soft_preferences.active_mode, "walk");
    const draft = { ...walking, soft_preferences: { ...walking.soft_preferences, active_mode: "bicycle" } };
    assert.equal(validateRelocationDraft(draft).soft_preferences.active_mode, "bicycle");
    const input = buildNativeProfileRefinementInput(walking, draft, undefined, [], "session-test", "id");
    assert.match(input.message, /Moda aktif yang ditetapkan: sepeda/);
    assert.equal("active_mode" in input.answers, false);
    const reconciled = reconcileProfileRefinement(walking, draft, modelProposal(walking.hard_constraints, walking.soft_preferences), false);
    assert.equal(reconciled.soft_preferences.active_mode, "bicycle");
});

test("refinement keeps explicit form and slider edits over LF-05 suggestions", () => {
    const draft = structuredClone(confirmed);
    draft.hard_constraints.monthly_budget = { amount: 8_000_000, currency: "IDR", period: "month" };
    draft.priority_weights = { career: 0.4, housing: 0.1, commute: 0.1, education: 0.1, cost_of_living: 0.1, environment: 0.2 };
    const result = reconcileProfileRefinement(confirmed, draft, modelProposal(
        { ...confirmed.hard_constraints, monthly_budget: { amount: 3_000_000, currency: "IDR", period: "month" } },
        confirmed.soft_preferences,
    ), true);
    assert.deepEqual(result.hard_constraints.monthly_budget, draft.hard_constraints.monthly_budget);
    assert.deepEqual(result.priority_weights, draft.priority_weights);
    assert.equal(result.inferred_fields.includes("monthly_budget"), false);
    assert.equal(result.inferred_fields.includes("priorities"), false);
});

test("an older confirmed profile without weights can be repaired with explicit priorities", () => {
    const legacy = { ...structuredClone(confirmed), priority_weights: {} };
    const draft = { ...structuredClone(legacy), priority_weights: { career: 1 } };
    assert.throws(() => validateRelocationDraft(legacy), /INVALID_PROFILE_DRAFT/);
    const result = reconcileProfileRefinement(legacy, draft, modelProposal(
        legacy.hard_constraints, legacy.soft_preferences, {},
    ), false);
    assert.deepEqual(result.priority_weights, { career: 1 });
    assert.deepEqual(result.inferred_fields, []);
});

test("native priority edits use string lists, never unsupported nested answers", () => {
    const draft = { ...structuredClone(confirmed), priority_weights: { career: 0.6, housing: 0.2, commute: 0.2 } };
    const input = buildNativeProfileRefinementInput(confirmed, draft, undefined, [], "session-test", "id");
    assert.deepEqual(input.answers.priorities, ["career 60%", "housing 20%", "commute 20%"]);
    assert.deepEqual(input.answering, ["priorities"]);
    for (const [key, answer] of Object.entries(input.answers)) {
        assert.ok(Array.isArray(answer) || typeof answer !== "object" || key === "monthly_budget" || key === "housing_budget");
    }
});

test("refinement retains every untouched legacy draft value and ignores unasked model edits", () => {
    const draft = structuredClone(confirmed);
    draft.soft_preferences.legacy_note = undefined;
    delete draft.soft_preferences.legacy_note;
    draft.soft_preferences.work_arrangement = "hybrid";
    const result = reconcileProfileRefinement(confirmed, draft, modelProposal(
        confirmed.hard_constraints,
        { ...confirmed.soft_preferences, work_arrangement: "remote", occupation: "Data analyst" },
    ), false);
    assert.equal(result.soft_preferences.work_arrangement, "hybrid");
    assert.equal(result.soft_preferences.occupation, confirmed.soft_preferences.occupation);
    assert.deepEqual(result.inferred_fields, []);
});

test("natural language model additions appear as reviewable inferred fields", () => {
    const draft = structuredClone(confirmed);
    const result = reconcileProfileRefinement(confirmed, draft, modelProposal(
        confirmed.hard_constraints,
        { ...confirmed.soft_preferences, occupation: "Data analyst", housing_types: ["apartemen"] },
    ), true);
    assert.equal(result.soft_preferences.occupation, "Data analyst");
    assert.deepEqual(result.soft_preferences.housing_types, ["apartemen"]);
    assert.deepEqual(result.inferred_fields.sort(), ["housing_types", "occupation"]);
});

test("populated hard constraints stay in original bucket and bucket moves alone are not inferred", () => {
    const draft = structuredClone(confirmed);
    const budget = draft.hard_constraints.monthly_budget;
    const soft = { ...draft.soft_preferences, monthly_budget: budget };
    const hard = { ...draft.hard_constraints };
    delete hard.monthly_budget;
    const result = reconcileProfileRefinement(confirmed, draft, modelProposal(hard, soft), true);
    assert.deepEqual(result.hard_constraints.monthly_budget, budget);
    assert.equal("monthly_budget" in result.soft_preferences, false);
    assert.deepEqual(result.inferred_fields, []);
});

test("narrative null and empty values cannot clear populated draft fields", () => {
    const draft = structuredClone(confirmed);
    const result = reconcileProfileRefinement(confirmed, draft, modelProposal(
        { ...confirmed.hard_constraints, monthly_budget: null, destination_cities: [] },
        { ...confirmed.soft_preferences, occupation: "", housing_types: [], destination: null },
    ), true);
    assert.deepEqual(result.hard_constraints.monthly_budget, draft.hard_constraints.monthly_budget);
    assert.deepEqual(result.hard_constraints.destination_cities, draft.hard_constraints.destination_cities);
    assert.equal(result.soft_preferences.occupation, draft.soft_preferences.occupation);
    assert.deepEqual(result.soft_preferences.housing_types, draft.soft_preferences.housing_types);
    assert.deepEqual(result.soft_preferences.destination, draft.soft_preferences.destination);
    assert.deepEqual(result.inferred_fields, []);
});

test("partial legacy weights reconcile without NaN or unsupported remote environment weight", () => {
    const legacyConfirmed = structuredClone(confirmed);
    legacyConfirmed.priority_weights = { career: 1 };
    const draft = structuredClone(legacyConfirmed);
    draft.priority_weights = { career: 1 };
    const modelWeights = { career: 0.4, housing: 0.2, commute: 0.2, education: 0.1, cost_of_living: 0.1 };
    const result = reconcileProfileRefinement(legacyConfirmed, draft, modelProposal(
        draft.hard_constraints, draft.soft_preferences, modelWeights,
    ), true);
    assert.deepEqual(result.priority_weights, modelWeights);
    assert.ok(Object.values(result.priority_weights).every(Number.isFinite));
    assert.equal(Object.values(result.priority_weights).reduce((sum, weight) => sum + weight, 0), 1);
    assert.equal("environment" in result.priority_weights, false);
    assert.deepEqual(result.inferred_fields, ["priorities"]);
});

test("refinement retains unanswered relevant questions, drops known and answered questions", () => {
    const draft = structuredClone(confirmed);
    const questions = [
        "Apa tujuan pindahmu?",
        "Ke mana kamu ingin pindah?",
        "Berapa anggaran bulananmu?",
        "Berapa lama perjalanan yang kamu inginkan?",
        "Apa jenis pekerjaan yang kamu cari?",
    ];
    const answers: LF05ClarificationAnswer[] = [{ question: "Berapa lama perjalanan yang kamu inginkan?", answer: "30 menit", field: "commute_minutes" }];
    const result = reconcileProfileRefinement(confirmed, draft, modelProposal(
        draft.hard_constraints, draft.soft_preferences, draft.priority_weights, questions,
    ), true, answers);
    assert.deepEqual(result.clarification_questions, ["Apa jenis pekerjaan yang kamu cari?"]);
});

test("native input uses refinement contract, confirmed projection, typed answers, and input limits", () => {
    const draft = structuredClone(confirmed);
    draft.hard_constraints.monthly_budget = { amount: 8_000_000, currency: "IDR", period: "month" };
    draft.soft_preferences.occupation = "Data analyst";
    draft.soft_preferences.housing_types = ["apartemen"];
    const answers: LF05ClarificationAnswer[] = [{ question: "Berapa lama perjalanan?", answer: "35 menit", field: "commute_minutes" }];
    const input = buildNativeProfileRefinementInput(confirmed, draft, "Aku ingin cari opsi lebih hemat.", answers, "session-test", "id");
    assert.equal(input.mode, "refinement");
    assert.equal(input.message.startsWith("Aku ingin cari opsi lebih hemat."), true);
    assert.ok(input.message.includes("35 menit"));
    assert.deepEqual(input.answers.monthly_budget, draft.hard_constraints.monthly_budget);
    assert.equal("occupation" in input.answers, false);
    assert.equal("housing_types" in input.current_profile.soft_preferences, false);
    assert.equal("environment" in input.current_profile.priority_weights, false);
    assert.deepEqual(input.answering, ["monthly_budget", "commute_minutes"]);
    assert.ok(JSON.stringify(input.current_profile).length <= 12_000);
    assert.ok(JSON.stringify(input).length <= 20_000);
    assert.ok(input.message.length <= 4000);
});

test("typed-only native request describes edits in Indonesian and projects supported answers", () => {
    const draft = structuredClone(confirmed);
    draft.hard_constraints.housing_budget = { amount: 4_000_000, currency: "IDR", period: "month" };
    const input = buildNativeProfileRefinementInput(confirmed, draft, undefined, [], "session-test", "id");
    assert.match(input.message, /Periksa perubahan preferensi/);
    assert.match(input.message, /Rp4\.000\.000\/bulan/);
    assert.deepEqual(input.answers.housing_budget, draft.hard_constraints.housing_budget);
    assert.deepEqual(input.answering, ["housing_budget"]);
});

test("ambiguous narrative change retains relevant question despite baseline value", () => {
    const question = "Berapa batas sewa yang kamu inginkan?";
    const result = reconcileProfileRefinement(confirmed, confirmed, modelProposal(
        confirmed.hard_constraints, confirmed.soft_preferences, confirmed.priority_weights, [question],
    ), true, [], "Tolong turunkan batas sewanya.");
    assert.deepEqual(result.clarification_questions, [question]);
});

test("native normalized projection does not alter unchanged local priority weights", () => {
    const baseline = structuredClone(confirmed);
    const remoteKeys = ["career", "housing", "commute", "education", "cost_of_living"] as const;
    const sourceTotal = remoteKeys.reduce((sum, key) => sum + baseline.priority_weights[key], 0);
    baseline.priority_weights = Object.fromEntries(remoteKeys.map((key) => [key, baseline.priority_weights[key] / sourceTotal * 0.7]));
    baseline.priority_weights.environment = 0.3;
    const projected = Object.fromEntries(remoteKeys.map((key) => [key, baseline.priority_weights[key] / 0.7]));
    const modelBudget = { amount: 4_000_000, currency: "IDR", period: "month" };
    const result = reconcileProfileRefinement(baseline, baseline, modelProposal(
        { ...baseline.hard_constraints, monthly_budget: modelBudget }, baseline.soft_preferences, projected,
    ), true, [], "Turunkan anggaran bulanan.");
    assert.deepEqual(result.priority_weights, baseline.priority_weights);
    assert.equal(result.inferred_fields.includes("priorities"), false);
    assert.equal(result.inferred_fields.includes("monthly_budget"), true);
});

test("real remote priority change preserves local environment weight exactly", () => {
    const baseline = structuredClone(confirmed);
    const remoteKeys = ["career", "housing", "commute", "education", "cost_of_living"] as const;
    const sourceTotal = remoteKeys.reduce((sum, key) => sum + baseline.priority_weights[key], 0);
    baseline.priority_weights = Object.fromEntries(remoteKeys.map((key) => [key, baseline.priority_weights[key] / sourceTotal * 0.7]));
    baseline.priority_weights.environment = 0.3;
    const changedRemote = { career: 0.5, housing: 0.15, commute: 0.15, education: 0.1, cost_of_living: 0.1 };
    const result = reconcileProfileRefinement(baseline, baseline, modelProposal(
        baseline.hard_constraints, baseline.soft_preferences, changedRemote,
    ), true, [], "Prioritaskan karier.");
    assert.equal(result.priority_weights.environment, 0.3);
    assert.ok(Math.abs(Object.values(result.priority_weights).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9);
    assert.deepEqual(result.inferred_fields, ["priorities"]);
});

test("canonical editor fields, environment weight, and weight normalization validate", () => {
    const draft = structuredClone(confirmed);
    draft.soft_preferences = { ...draft.soft_preferences, occupation: "Developer", study_field: "Design", career_stage: "early",
        departure_time: "morning", extras: ["near transit"], over_budget: "hide", housing_types: ["kos"] };
    draft.priority_weights = { career: 0.2, housing: 0.2, commute: 0.2, education: 0.1, cost_of_living: 0.1, environment: 0.2 };
    assert.deepEqual(validateRelocationDraft(draft), draft);
    const result = reconcileProfileRefinement(confirmed, draft, modelProposal(draft.hard_constraints, draft.soft_preferences, draft.priority_weights), false);
    assert.equal(result.soft_preferences.over_budget, "hide");
    assert.equal(Object.values(result.priority_weights).reduce((sum, value) => sum + value, 0), 1);
});

test("draft validator rejects invalid goals, budgets, destinations, weights, and sensitive text", () => {
    const malformed = [
        { ...confirmed, unexpected: true },
        { ...confirmed, hard_constraints: { ...confirmed.hard_constraints, goal: "other" } },
        { ...confirmed, hard_constraints: { ...confirmed.hard_constraints, monthly_budget: { amount: -1, currency: "IDR", period: "month" } } },
        { ...confirmed, soft_preferences: { ...confirmed.soft_preferences, destination: { name: "Jakarta", precision: "point", latitude: 200, longitude: 1 } } },
        { ...confirmed, priority_weights: { ...confirmed.priority_weights, environment: 0.9 } },
        { ...confirmed, soft_preferences: { ...confirmed.soft_preferences, occupation: "NIK 1234567890123456" } },
        { ...confirmed, hard_constraints: { ...confirmed.hard_constraints, goal: "study" }, soft_preferences: { ...confirmed.soft_preferences, goal: "work" } },
        { ...confirmed, soft_preferences: { ...confirmed.soft_preferences, target_fields: Array.from({ length: 51 }, () => "software_and_it_services") } },
    ];
    for (const draft of malformed) assert.throws(() => validateRelocationDraft(draft), /INVALID_PROFILE_DRAFT/);
});

test("changes group all priority sliders into one review field", () => {
    const edited = structuredClone(confirmed);
    edited.priority_weights = { ...edited.priority_weights, environment: 0.2, career: 0.3 };
    assert.deepEqual(getProfileChanges(confirmed, edited), ["priorities"]);
});
