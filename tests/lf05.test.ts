import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/lf05/route";
import { interpretOnboardingStory } from "../app/engine/controller/preferenceController";
import { onboardingTaxonomy } from "../app/engine/extractUserProfile";
import { validateLF05Proposal } from "../app/engine/lib/lf05Validation";
import { buildLF05Message, getLF05ClarificationField, getLF05ClarificationQuestions, parseLF05CommuteAnswer, validateClarificationAnswers, validateFollowUpDetails } from "../app/engine/lib/lf05FollowUp";
import { extractLF05TransportMode, parseLF05TransportAnswer } from "../app/engine/lib/lf05Transport";
import { completed, postJson, withWorkflowEnvironment } from "./helpers";

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
  assert.throws(() => validateLF05Proposal({ ...validProfile, soft_preferences: { goal: "relocate" } }, onboardingTaxonomy), /INVALID_LF05_PROFILE/);
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

test("follow-up answers reach LF-05 along with the original story and explicit choices stay authoritative", async (context) => {
  const restoreEnvironment = withWorkflowEnvironment();
  let sentMessage = "";
  context.mock.method(globalThis, "fetch", async (_request: unknown, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body));
    sentMessage = JSON.parse(payload.input_value).message;
    return Response.json(completed({ output: { text: JSON.stringify(validProfile) } }));
  });
  try {
    const profile = await interpretOnboardingStory("Mau pindah.", "id", [
      { question: "Berapa anggaran bulananmu?", answer: "Rp6 juta" },
      { question: "Di mana lokasi kantormu?", answer: "Kuningan" },
    ], "study", { transport_mode: "transit", destination: { name: "Kuningan", precision: "area" } });
    assert.ok(sentMessage.startsWith("Mau pindah."));
    assert.match(sentMessage, /Berapa anggaran bulananmu\?/);
    assert.match(sentMessage, /Rp6 juta/);
    assert.match(sentMessage, /Kuningan/);
    assert.match(sentMessage, /Tujuan pindah\nJawaban: Kuliah/);
    assert.equal(profile.hard_constraints.goal, "study");
    assert.equal(profile.soft_preferences.goal, undefined);
    assert.equal(profile.soft_preferences.transport_mode, "transit");
    assert.deepEqual(profile.soft_preferences.destination, { name: "Kuningan", precision: "area" });
    assert.ok(!profile.inferred_fields.includes("goal"));
    assert.equal(profile.confirmed, false);
  } finally { restoreEnvironment(); }
});

test("bare 45 commute answer survives LF-05 omission for the reported Jakarta Selatan story", async (context) => {
  const restoreEnvironment = withWorkflowEnvironment();
  const story = "saya berencana pindah ke jakarta selatan untuk kerja sebagai software engineer punya budget 5jt per bulan 2jt untuk kos";
  const question = "Berapa lama waktu perjalanan sekali jalan yang masih bisa Anda terima (dalam menit)?";
  let sentMessage = "";
  context.mock.method(globalThis, "fetch", async (_request: unknown, init?: RequestInit) => {
    sentMessage = JSON.parse(JSON.parse(String(init?.body)).input_value).message;
    return Response.json(completed({ output: { text: JSON.stringify({ ...validProfile,
      hard_constraints: { monthly_budget: { amount: 5000000, currency: "IDR", period: "month" } },
      soft_preferences: { ...validProfile.soft_preferences, destination_cities: ["Jakarta Selatan"] },
      inferred_fields: ["priorities", "commute_minutes"], clarification_questions: [question],
    }) } }));
  });
  try {
    const profile = await interpretOnboardingStory(story, "id", [{ question, answer: "45" }]);
    assert.equal(profile.hard_constraints.commute_minutes, 45);
    assert.equal((profile.hard_constraints.monthly_budget as { amount: number }).amount, 5000000);
    assert.equal((profile.soft_preferences.housing_budget as { amount: number }).amount, 2000000);
    assert.match(sentMessage, /Jawaban: 45 menit/);
    assert.ok(!profile.inferred_fields.includes("commute_minutes"));
    assert.ok(!profile.clarification_questions.includes(question));
  } finally { restoreEnvironment(); }
});

test("commute bindings normalize minutes and reject invalid or unbounded numeric answers", async () => {
  for (const answer of ["45", "45 menit", "45 min", " 45 minutes "]) assert.equal(parseLF05CommuteAnswer(answer), 45);
  for (const answer of ["-1", "241", "45.5", "45 jam", "45 atau 60", "", "Infinity"]) {
    assert.equal(parseLF05CommuteAnswer(answer), null);
    assert.throws(() => validateClarificationAnswers([{ question: "Batas perjalanan?", field: "commute_minutes", answer }]), /INVALID_CLARIFICATION_ANSWERS/);
  }
  assert.deepEqual(validateClarificationAnswers([{ question: "Batas perjalanan?", field: "commute_minutes", answer: "45" }]),
    [{ question: "Batas perjalanan?", field: "commute_minutes", answer: "45 menit" }]);
  for (const commute_minutes of [-1, 241, 45.5, "45", NaN, Infinity]) {
    assert.throws(() => validateFollowUpDetails({ commute_minutes }), /INVALID_CLARIFICATION_ANSWERS/);
  }
  assert.equal(getLF05ClarificationField("Berapa lama waktu perjalanan sekali jalan yang masih bisa Anda terima (dalam menit)?"), "commute_minutes");
  assert.equal(getLF05ClarificationField("Which commute mode do you prefer?"), "transport_mode");
  assert.equal(getLF05ClarificationField("How long can your commute take?"), "commute_minutes");
  assert.equal(getLF05ClarificationField("Berapa lama waktu perjalanan dengan transportasi umum?"), "commute_minutes");
  for (const body of [
    { message: "Mau pindah", language: "id", details: { commute_minutes: 241 } },
    { message: "Mau pindah", language: "id", clarification_answers: [{ question: "Waktu tempuh?", answer: "-45", field: "commute_minutes" }] },
  ]) assert.equal((await POST(postJson("/api/lf05", JSON.stringify(body)))).status, 400);
});

test("missing transport and specific destination get follow-ups even when LF-05 returns none", () => {
  const profile = validateLF05Proposal({ ...validProfile, hard_constraints: { ...validProfile.hard_constraints, destination_cities: ["Jakarta Selatan"] } }, onboardingTaxonomy);
  assert.deepEqual(getLF05ClarificationQuestions(profile, "Mau pindah."),
    ["Moda transportasi apa yang kamu pilih?", "Sudah tahu lokasi tujuan spesifik di Jakarta Selatan?"]);
  assert.deepEqual(getLF05ClarificationQuestions({ ...profile, clarification_questions: ["Di mana lokasi kantormu?", "Moda transportasi apa yang kamu pilih?"] }, "Mau pindah."),
    ["Di mana lokasi kantormu?", "Moda transportasi apa yang kamu pilih?"]);
});

test("unstated transport never accepts a model guess, even with high confidence", async (context) => {
  const restoreEnvironment = withWorkflowEnvironment();
  const story = "saya berencana pindah ke jakarta selatan untuk kerja sebagai software engineer budget belum tahu";
  context.mock.method(globalThis, "fetch", async () => Response.json(completed({ output: { text: JSON.stringify({
    ...validProfile,
    hard_constraints: { transport_mode: "car" },
    soft_preferences: { goal: "work", destination_cities: ["Jakarta Selatan"], transport_mode: "car" },
    inferred_fields: ["transport_mode"],
    decision_trace: { route: "accepted", confidence: 0.99 },
  }) } })));
  try {
    const profile = await interpretOnboardingStory(story, "id");
    assert.equal(profile.hard_constraints.transport_mode, undefined);
    assert.equal(profile.soft_preferences.transport_mode, undefined);
    assert.ok(!profile.inferred_fields.includes("transport_mode"));
    assert.equal(profile.clarification_questions.filter((question) => getLF05ClarificationField(question) === "transport_mode").length, 1);
  } finally { restoreEnvironment(); }
});

test("transport evidence excludes negation, ownership, unrelated context and undecided alternatives", () => {
  for (const story of ["Saya kerja di perusahaan mobil.", "Saya punya mobil.", "Saya tidak naik mobil.",
    "Saya belum memilih motor.", "Mungkin naik mobil.", "Saya naik mobil atau motor.", "Saya belum memilih antara mobil, motor.",
    "Saya belum tahu moda transportasi.", "I do not commute by car.", "I work in car software."]) {
    assert.equal(extractLF05TransportMode(story), null, story);
  }
  for (const [answer, mode] of [["Transport umum", "transit"], ["Motor", "motorcycle"], ["Mobil", "car"], ["Jalan kaki", "active"]]) {
    assert.equal(parseLF05TransportAnswer(answer), mode);
  }
  assert.equal(extractLF05TransportMode("budget belum tahu, saya ke kantor naik motor"), "motorcycle");
  assert.equal(extractLF05TransportMode("Saya mempertimbangkan transportasi umum sebagai pilihan utama untuk perjalanan ke kantor."), "transit");
  assert.throws(() => validateClarificationAnswers([{ question: "Moda transportasi?", field: "transport_mode", answer: "mobil atau motor" }]), /INVALID_CLARIFICATION_ANSWERS/);
});

test("explicit story transport and radio answers override LF-05 guesses and omissions", async (context) => {
  const restoreEnvironment = withWorkflowEnvironment();
  context.mock.method(globalThis, "fetch", async () => Response.json(completed({ output: { text: JSON.stringify({
    ...validProfile, soft_preferences: { ...validProfile.soft_preferences, transport_mode: "car" },
    inferred_fields: [...validProfile.inferred_fields, "transport_mode"],
    clarification_questions: ["Moda transportasi apa yang kamu pilih?"],
  }) } })));
  try {
    for (const [story, mode] of [
      ["Saya ke kantor naik transportasi umum.", "transit"], ["Saya berangkat naik motor.", "motorcycle"],
      ["Saya ke kantor menggunakan mobil.", "car"], ["I commute by public transport.", "transit"],
    ]) {
      const profile = await interpretOnboardingStory(story, "id");
      assert.equal(profile.soft_preferences.transport_mode, mode);
      assert.ok(!profile.inferred_fields.includes("transport_mode"));
      assert.ok(!profile.clarification_questions.some((question) => getLF05ClarificationField(question) === "transport_mode"));
    }
    const profile = await interpretOnboardingStory("Saya ke kantor naik mobil.", "id",
      [{ question: "Moda transportasi apa yang kamu pilih?", answer: "Motor" }]);
    assert.equal(profile.soft_preferences.transport_mode, "motorcycle");
  } finally { restoreEnvironment(); }
});

test("unknown specific destination retains a city without inventing coordinates or reopening its question", async (context) => {
  const restoreEnvironment = withWorkflowEnvironment();
  const destination = { name: "Jakarta Selatan", precision: "city" as const };
  let sentMessage = "";
  context.mock.method(globalThis, "fetch", async (_request: unknown, init?: RequestInit) => {
    sentMessage = JSON.parse(JSON.parse(String(init?.body)).input_value).message;
    return Response.json(completed({ output: { text: JSON.stringify({ ...validProfile,
      soft_preferences: { ...validProfile.soft_preferences, destination: { name: "SCBD", precision: "area" }, transport_mode: "car" },
      inferred_fields: ["destination", "transport_mode", "priorities"],
      clarification_questions: ["Di mana lokasi kantormu?", "Moda transportasi apa yang kamu pilih?", "Apa pola kerjamu?"],
    }) } }));
  });
  try {
    const profile = await interpretOnboardingStory("Saya pindah ke Jakarta Selatan untuk kerja.", "id",
      [{ question: "Sudah tahu lokasi tujuan spesifik di Jakarta Selatan?", answer: "Belum tahu" }], "work", { destination, transport_mode: "transit" });
    assert.deepEqual(profile.soft_preferences.destination, destination);
    assert.equal(profile.soft_preferences.transport_mode, "transit");
    assert.deepEqual(profile.clarification_questions, ["Apa pola kerjamu?"]);
    assert.deepEqual(profile.inferred_fields, ["priorities"]);
    assert.match(sentMessage, /Belum tahu/);
    assert.ok(sentMessage.includes(JSON.stringify(destination)));
    assert.throws(() => validateFollowUpDetails({ destination: { ...destination, latitude: -6, longitude: 106 } }), /INVALID_CLARIFICATION_ANSWERS/);
    assert.throws(() => validateLF05Proposal({ ...profile, soft_preferences: { destination: { ...destination, latitude: -6 } } }, onboardingTaxonomy), /INVALID_LF05_PROFILE/);
  } finally { restoreEnvironment(); }
});

test("follow-ups reject malformed, duplicate, excessive and sensitive answers", async () => {
  for (const value of [null, [{ question: "Budget?", answer: "" }], [{ question: "Budget?", answer: "1", confirmed: true }],
    [{ question: "Budget?", answer: "1" }, { question: "Budget?", answer: "2" }]]) {
    assert.throws(() => validateClarificationAnswers(value), /INVALID_CLARIFICATION_ANSWERS/);
  }
  assert.throws(() => buildLF05Message("Mau pindah", [{ question: "Catatan?", answer: "NIK 1234567890123456" }]), /SENSITIVE_ONBOARDING_INPUT/);
  assert.throws(() => validateFollowUpDetails({ destination: { name: "Peta", precision: "point", latitude: 999, longitude: 106 } }), /INVALID_CLARIFICATION_ANSWERS/);
  assert.throws(() => validateFollowUpDetails({ transport_mode: ["transit"] }), /INVALID_CLARIFICATION_ANSWERS/);
  assert.deepEqual(validateFollowUpDetails({ destination: { name: "Peta", precision: "point", latitude: -6.1234567890123456, longitude: 106.83 } }),
    { destination: { name: "Peta", precision: "point", latitude: -6.1234567890123456, longitude: 106.83 } });
  assert.throws(() => validateLF05Proposal({ ...validProfile, soft_preferences: { transport_mode: ["transit"] } }, onboardingTaxonomy), /INVALID_LF05_PROFILE/);
  assert.throws(() => validateLF05Proposal({ ...validProfile, soft_preferences: { destination: { name: "Kuningan", precision: "area", latitude: -6 } } }, onboardingTaxonomy), /INVALID_LF05_PROFILE/);
  for (const body of [
    { message: "Mau pindah", language: "id", goal: "unknown" },
    { message: "Mau pindah", language: "id", clarification_answers: [{ question: "Catatan?", answer: "NIK 1234567890123456" }] },
  ]) {
    const response = await POST(postJson("/api/lf05", JSON.stringify(body)));
    assert.equal(response.status, 400);
  }
});

test("map-picked office coordinates are sent through LF-05 and retained without becoming an inference", async (context) => {
  const restoreEnvironment = withWorkflowEnvironment();
  const destination = { name: "Dipilih di peta", precision: "point" as const, latitude: -6.2297, longitude: 106.8304 };
  context.mock.method(globalThis, "fetch", async (_request: unknown, init?: RequestInit) => {
    const input = JSON.parse(JSON.parse(String(init?.body)).input_value);
    assert.ok(input.message.includes(JSON.stringify(destination)));
    return Response.json(completed({ output: { text: JSON.stringify({ ...validProfile,
      hard_constraints: { ...validProfile.hard_constraints, transport_mode: "car" },
      inferred_fields: [...validProfile.inferred_fields, "destination", "transport_mode"],
    }) } }));
  });
  try {
    const profile = await interpretOnboardingStory("Saya pindah untuk bekerja.", "id", [], "work", { destination, transport_mode: "transit" });
    assert.deepEqual(profile.soft_preferences.destination, destination);
    assert.equal(profile.soft_preferences.transport_mode, "transit");
    assert.equal(profile.hard_constraints.transport_mode, undefined);
    assert.ok(!profile.inferred_fields.includes("destination"));
    assert.ok(!profile.inferred_fields.includes("transport_mode"));
    assert.ok(profile.inferred_fields.includes("priorities"));
  } finally { restoreEnvironment(); }
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

    assert.deepEqual({ ...profile, clarification_questions: upstreamProfile.clarification_questions }, upstreamProfile);
    assert.equal(profile.clarification_questions.length, 4);
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
