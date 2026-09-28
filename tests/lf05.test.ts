import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/lf05/route";
import { interpretOnboardingStory } from "../app/engine/controller/preferenceController";
import { onboardingTaxonomy } from "../app/engine/extractUserProfile";
import { validateLF05Proposal } from "../app/engine/lib/lf05Validation";

const validProfile = {
  hard_constraints: {
    monthly_budget: { amount: 6000000, currency: "IDR", period: "month" },
    commute_minutes: 45,
  },
  soft_preferences: {
    goal: "work",
    target_fields: ["software_and_it_services"],
    target_occupations: ["software_engineer"],
    housing_budget: { amount: 2000000, currency: "IDR", period: "month" },
  },
  priority_weights: { career: 1 },
  inferred_fields: ["goal", "target_fields", "target_occupations", "housing_budget", "priorities"],
  clarification_questions: [],
  requires_confirmation: true,
  confirmed: false,
  taxonomy_version: "2026-09",
  contract_version: "lf05-v2",
  writes_performed: false,
  decision_trace: { route: "accepted" },
  runtime_usage: null,
};

function setWorkflowEnvironment() {
  const previousUrl = process.env.NEXT_LANGFLOW_URL;
  const previousKey = process.env.NEXT_LANGFLOW_API_KEY;
  process.env.NEXT_LANGFLOW_URL = "http://localhost:7860/api/v2/workflows";
  process.env.NEXT_LANGFLOW_API_KEY = "test-api-key";

  return () => {
    if (previousUrl === undefined) delete process.env.NEXT_LANGFLOW_URL;
    else process.env.NEXT_LANGFLOW_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_LANGFLOW_API_KEY;
    else process.env.NEXT_LANGFLOW_API_KEY = previousKey;
  };
}

test("LF-05 profile validation checks confirmation, taxonomy, budgets, and weights", () => {
  assert.deepEqual(validateLF05Proposal(validProfile, onboardingTaxonomy), validProfile);
  assert.throws(
    () => validateLF05Proposal({ ...validProfile, confirmed: true }, onboardingTaxonomy),
    /INVALID_LF05_PROFILE/,
  );
  assert.throws(
    () => validateLF05Proposal({ ...validProfile, priority_weights: { career: 0.4 } }, onboardingTaxonomy),
    /INVALID_LF05_PROFILE/,
  );
  assert.throws(
    () => validateLF05Proposal({
      ...validProfile,
      soft_preferences: { target_fields: ["unknown_sector"] },
    }, onboardingTaxonomy),
    /INVALID_LF05_PROFILE/,
  );
});

test("LF-05 controller sends screened server-built input and returns validated profile", async (context) => {
  const restoreEnvironment = setWorkflowEnvironment();
  const upstreamProfile = {
    ...validProfile,
    clarification_questions: [
      "Berapa anggaran bulanan maksimal yang nyaman untuk Anda (dalam rupiah)?",
      "Berapa lama waktu perjalanan sekali jalan yang masih bisa Anda terima (dalam menit)?",
    ],
  };
  let sentUrl = "";
  let sentHeaders: HeadersInit | undefined;
  let sentPayload: Record<string, unknown> | undefined;

  context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    sentUrl = String(input);
    sentHeaders = init?.headers;
    sentPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Response.json({
      object: "response",
      status: "completed",
      has_errors: false,
      output: { text: JSON.stringify(upstreamProfile) },
    });
  });

  try {
    const profile = await interpretOnboardingStory(
      "Saya mau kerja jadi software engineer di Jakarta. Budget bulanan maksimal 6 juta, kos sekitar 2jt, perjalanan paling lama 45 menit. Karier paling penting.",
      "id",
    );

    assert.deepEqual(profile, upstreamProfile);
    assert.equal(profile.clarification_questions.length, 2);
    assert.equal(sentUrl, "http://localhost:7860/api/v2/workflows");
    assert.equal(new Headers(sentHeaders).get("x-api-key"), "test-api-key");
    assert.equal(sentPayload?.flow_id, "8feff2fc-81df-438d-8dae-c10563f1ab67");
    assert.equal(sentPayload?.mode, "sync");

    const input = JSON.parse(String(sentPayload?.input_value)) as Record<string, unknown>;
    assert.equal(input.mode, "onboarding");
    assert.equal(input.language, "id");
    assert.equal(input.privacy_screened, true);
    assert.equal(input.message?.toString().startsWith("Saya mau kerja"), true);
    assert.deepEqual(input.taxonomy, onboardingTaxonomy);
    assert.equal(typeof input.session_reference, "string");
    assert.equal(sentPayload?.session_id, input.session_reference);
  } finally {
    restoreEnvironment();
  }
});

test("LF-05 route rejects sensitive text and caller-injected trusted fields", async (context) => {
  const restoreEnvironment = setWorkflowEnvironment();
  let fetchCalls = 0;
  context.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    return Response.json({});
  });

  try {
    const sensitive = await POST(new Request("http://localhost/api/lf05", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Alamat rumah saya ...", language: "id" }),
    }));
    const injected = await POST(new Request("http://localhost/api/lf05", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Mau kerja", language: "id", privacy_screened: true }),
    }));

    // A valid story without a session never reaches Langflow.
    const anonymous = await POST(new Request("http://localhost/api/lf05", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Mau kerja di bidang IT di Jakarta", language: "id" }),
    }));

    assert.equal(sensitive.status, 400);
    assert.equal(injected.status, 400);
    assert.equal(anonymous.status, 401);
    assert.equal(fetchCalls, 0);
  } finally {
    restoreEnvironment();
  }
});
