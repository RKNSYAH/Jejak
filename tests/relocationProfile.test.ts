import assert from "node:assert/strict";
import { test } from "node:test";
import { DELETE, POST } from "../app/api/user/relocation-profile/route";
import { onboardingTaxonomy } from "../app/engine/extractUserProfile";
import { buildFormRelocationProfile, buildPersistedRelocationProfile, normalizeRelocationProfileInputs } from "../app/engine/lib/relocationProfile";
import { defaultAnswers } from "../app/engine/onboarding/demoData";
import { deleteRelocationProfile, saveConfirmedRelocationProfile } from "../app/engine/controller/relocationProfileController";
import { postJson } from "./helpers";

const proposal = {
  hard_constraints: {
    monthly_budget: { amount: 6000000, currency: "IDR", period: "month" },
    commute_minutes: 45,
  },
  soft_preferences: {
    goal: "work",
    target_fields: ["software_and_it_services"],
  },
  priority_weights: { career: 1 },
  inferred_fields: ["goal", "monthly_budget"],
  clarification_questions: ["Which city do you prefer?"],
  requires_confirmation: true,
  confirmed: false,
  taxonomy_version: onboardingTaxonomy.version,
  contract_version: "lf05-v2" as const,
  writes_performed: false,
  decision_trace: { internal_note: "not persisted" },
  runtime_usage: { tokens: 12 },
};

test("confirmed onboarding profile stores only validated recommendation inputs", () => {
  const profile = buildPersistedRelocationProfile(proposal, ["goal", "monthly_budget"]);

  assert.deepEqual(profile, normalizeRelocationProfileInputs(proposal.hard_constraints, proposal.soft_preferences, proposal.priority_weights));
  assert.equal(profile.hard_constraints.goal, "work");
  assert.equal("goal" in profile.soft_preferences, false);
  assert.equal("decision_trace" in profile, false);
  assert.equal("runtime_usage" in profile, false);
  assert.equal("clarification_questions" in profile, false);
});

test("form and short/long story profiles share a determined goal and the same profile slots", () => {
  for (const goal of ["work", "study", "both"] as const) {
    const form = buildFormRelocationProfile({ ...defaultAnswers, goal, destinationId: null });
    const short = buildPersistedRelocationProfile({ ...proposal, hard_constraints: {}, soft_preferences: { goal }, inferred_fields: [] }, []);
    const long = buildPersistedRelocationProfile({ ...proposal, soft_preferences: { ...proposal.soft_preferences, goal } }, proposal.inferred_fields);
    for (const story of [short, long]) {
      assert.equal(story.hard_constraints.goal, form.hard_constraints.goal);
      assert.deepEqual(Object.keys(story.hard_constraints).sort(), Object.keys(form.hard_constraints).sort());
      assert.deepEqual(Object.keys(story.soft_preferences).sort(), Object.keys(form.soft_preferences).sort());
    }
    assert.equal(short.hard_constraints.monthly_budget, null);
    assert.ok(Math.abs(Object.values(form.priority_weights).reduce((sum, weight) => sum + weight, 0) - 1) < 1e-9);
  }
});

test("form persistence validates every step and saves inputs, never sample metrics or UI state", () => {
  const form = buildFormRelocationProfile({ ...defaultAnswers, goal: "both", sector: "software_and_it_services" });
  assert.deepEqual(form.hard_constraints.monthly_budget, { amount: 6000000, currency: "IDR", period: "month" });
  assert.deepEqual(form.soft_preferences.target_occupations, ["software_engineer"]);
  assert.equal(form.soft_preferences.transport_mode, "transit");
  assert.deepEqual(form.soft_preferences.housing_types, ["kos"]);
  assert.equal(form.priority_weights.career, 0.2);
  assert.equal(form.priority_weights.education, 0.2);
  assert.equal((form.soft_preferences.destination as Record<string, unknown>).precision, "area");
  assert.equal(JSON.stringify(form).includes("overBudget"), false);
  assert.equal(JSON.stringify(form).includes("is_sample"), false);
  for (const patch of [{ goal: "unknown" }, { maximumRent: 7000000 }, { occupation: "" }, { weights: { opportunity: 100 } }, { sector: "unknown" }]) {
    assert.throws(() => buildFormRelocationProfile({ ...defaultAnswers, ...patch }), /INVALID_FORM_PROFILE/);
  }
});

test("a map-picked destination persists as a validated point without synthetic identity fields", () => {
  const form = buildFormRelocationProfile({
    ...defaultAnswers,
    destinationId: null,
    destinationName: "Titik pilihanmu",
    destinationPoint: [106.82, -6.24],
  });

  assert.deepEqual(form.soft_preferences.destination, {
    name: "Titik pilihanmu", precision: "point", longitude: 106.82, latitude: -6.24,
  });
});

test("form saves do not inherit hidden experience or extras from legacy drafts", () => {
  const currentAnswers: Partial<typeof defaultAnswers> = structuredClone(defaultAnswers);
  delete currentAnswers.experience;
  delete currentAnswers.extras;
  for (const answers of [defaultAnswers, currentAnswers]) {
    const profile = buildFormRelocationProfile(answers);
    assert.equal(profile.soft_preferences.career_stage, null);
    assert.deepEqual(profile.soft_preferences.extras, []);
  }
});

test("story profiles cannot be saved without a determined goal or with conflicting goals", async () => {
  const missing = { ...proposal, soft_preferences: {}, inferred_fields: [] };
  assert.throws(() => buildPersistedRelocationProfile(missing, []), /PROFILE_GOAL_REQUIRED/);
  assert.throws(() => buildPersistedRelocationProfile({ ...proposal, hard_constraints: { goal: "study" } }, proposal.inferred_fields), /INVALID_PROFILE_GOAL/);
  const response = await POST(postJson("/api/user/relocation-profile", JSON.stringify({ proposal: missing, confirmed_fields: [], base_revision: null })));
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Tentukan tujuan/);
});

test("profile endpoint rejects mixed paths and unauthorized valid forms", async () => {
  const mixed = await POST(postJson("/api/user/relocation-profile", JSON.stringify({ form_answers: defaultAnswers, proposal, confirmed_fields: [], base_revision: null })));
  const invalid = await POST(postJson("/api/user/relocation-profile", JSON.stringify({ form_answers: { ...defaultAnswers, monthlyBudget: 0 }, base_revision: null })));
  const anonymous = await POST(postJson("/api/user/relocation-profile", JSON.stringify({ form_answers: defaultAnswers, base_revision: null })));
  assert.equal(mixed.status, 400);
  assert.equal(invalid.status, 400);
  assert.equal(anonymous.status, 401);
});

test("profile saves require an explicit expected revision", async () => {
  const missing = await POST(postJson("/api/user/relocation-profile", JSON.stringify({ form_answers: defaultAnswers })));
  const invalid = await POST(postJson("/api/user/relocation-profile", JSON.stringify({ form_answers: defaultAnswers, base_revision: 0 })));
  assert.equal(missing.status, 400);
  assert.equal(invalid.status, 400);
});

test("profile saving reads the owned confirmed database row before reporting success", async (context) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  const userId = "11111111-1111-4111-8111-111111111111";
  const input = buildFormRelocationProfile(defaultAnswers);
  const stored = { id: 42, profile_name: "primary", revision: 3, profile: input,
    confirmed_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" };
  let verificationRow: unknown = stored;
  const calls: { url: URL; method?: string }[] = [];
  context.mock.method(globalThis, "fetch", async (request: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(request));
    calls.push({ url, method: init?.method });
    if (url.pathname.endsWith("/rpc/save_confirmed_relocation_profile")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.p_user_id, userId);
      assert.deepEqual(body.p_profile, input);
      assert.equal(body.p_expected_revision, null);
      return Response.json([{ id: stored.id, revision: stored.revision }]);
    }
    assert.equal(url.searchParams.get("user_id"), `eq.${userId}`);
    assert.equal(url.searchParams.get("id"), "eq.42");
    assert.equal(url.searchParams.get("confirmed"), "eq.true");
    return Response.json(verificationRow);
  });
  try {
    const result = await saveConfirmedRelocationProfile(userId, input, null);
    assert.deepEqual(result, { ...stored, id: "42" });
    assert.equal(calls.length, 2);
    verificationRow = null;
    await assert.rejects(saveConfirmedRelocationProfile(userId, input, null), /Saved profile could not be verified/);
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("profile deletion requires sign-in and removes only the owner's primary profile rows", async (context) => {
  assert.equal((await DELETE(new Request("http://localhost/api/user/relocation-profile", { method: "DELETE" }))).status, 401);
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
  const userId = "11111111-1111-4111-8111-111111111111";
  let status = 204;
  const calls: { url: URL; method?: string }[] = [];
  context.mock.method(globalThis, "fetch", async (request: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(request)), method: init?.method });
    return status === 204 ? new Response(null, { status }) : Response.json({ message: "boom" }, { status });
  });
  try {
    await deleteRelocationProfile(userId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "DELETE");
    assert.match(calls[0].url.pathname, /\/rest\/v1\/relocation_profiles$/);
    assert.equal(calls[0].url.searchParams.get("user_id"), `eq.${userId}`);
    assert.equal(calls[0].url.searchParams.get("profile_name"), "eq.primary");
    status = 500;
    await assert.rejects(deleteRelocationProfile(userId));
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
  }
});

test("profile persistence requires confirmation for every inferred field exactly once", () => {
  assert.throws(
    () => buildPersistedRelocationProfile(proposal, ["goal"]),
    /PROFILE_CONFIRMATION_REQUIRED/,
  );
  assert.throws(
    () => buildPersistedRelocationProfile(proposal, ["goal", "goal", "monthly_budget"]),
    /INVALID_PROFILE_CONFIRMATION/,
  );
  assert.throws(
    () => buildPersistedRelocationProfile(proposal, ["goal", "monthly_budget", "unknown"]),
    /INVALID_PROFILE_CONFIRMATION/,
  );
});

test("profile endpoint refuses to save before inferred fields are confirmed", async () => {
  const response = await POST(postJson("/api/user/relocation-profile", JSON.stringify({ proposal, confirmed_fields: ["goal"], base_revision: null })));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Konfirmasi semua kesimpulan/);
});

test("revision-based refinement save refuses unresolved clarification questions", async () => {
  const response = await POST(postJson("/api/user/relocation-profile", JSON.stringify({
    proposal: { ...proposal, clarification_questions: ["Which city do you prefer?"] },
    confirmed_fields: proposal.inferred_fields,
    base_revision: 4,
  })));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /pertanyaan lanjutan/);
});
