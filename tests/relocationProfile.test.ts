import assert from "node:assert/strict";
import { test } from "node:test";
import { POST } from "../app/api/user/relocation-profile/route";
import { onboardingTaxonomy } from "../app/engine/extractUserProfile";
import { buildPersistedRelocationProfile } from "../app/engine/lib/relocationProfile";

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

  assert.deepEqual(profile, {
    schema_version: "relocation-profile-v1",
    hard_constraints: proposal.hard_constraints,
    soft_preferences: proposal.soft_preferences,
    priority_weights: proposal.priority_weights,
    taxonomy_version: onboardingTaxonomy.version,
    contract_version: "lf05-v2",
  });
  assert.equal("decision_trace" in profile, false);
  assert.equal("runtime_usage" in profile, false);
  assert.equal("clarification_questions" in profile, false);
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
  const response = await POST(new Request("http://localhost/api/user/relocation-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proposal, confirmed_fields: ["goal"] }),
  }));

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Konfirmasi semua kesimpulan/);
});
