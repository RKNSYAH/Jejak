import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/lf04/route";
import { explainZoneFit } from "../app/engine/controller/explanationController";
import { parseLF04Output, validateLF04Request } from "../app/engine/lib/lf04Validation";
import type { PersistedRelocationProfile } from "../app/engine/lib/relocationProfile";

const request = {
    language: "en",
    fit_components: { job_access: 0.82, housing_cost: { score: 0.55 }, commute: 0.74 },
    accepted_snapshot: {
        zone_id: "pancoran",
        snapshot_at: "2026-09-17T00:00:00Z",
        validation_status: "accepted",
        active_openings: 4,
        evidence_ids: ["evidence-001", "evidence-002"],
    },
    source_coverage: { coverage: "partial", incomplete_evidence_categories: ["local_headcount"] },
    comparison_zone: null,
};

const explanation = {
    headline: "Strong IT access with a housing trade-off",
    summary: "Pancoran has useful access to technology work. pancoran: active openings = 4.",
    strengths: ["Pancoran has access to the target job market."],
    trade_offs: ["Housing cost may reduce the monthly budget margin."],
    evidence_gaps: ["Local headcount evidence is incomplete."],
    suggested_next_actions: ["Compare Pancoran with one nearby zone."],
    referenced_evidence_ids: ["evidence-001"],
    numeric_claims: [{ text: "pancoran: active openings = 4.", snapshot_path: "accepted_snapshot.active_openings", value: 4 }],
    contract_version: "lf04-v2",
    validation_status: "validated_proposal",
    grounding_check: "numeric_tokens_paths_and_evidence_ids; semantic_API_review_required",
    generation_method: "gemini",
    fallback_reason: null,
    runtime_usage: null,
};

const profile: PersistedRelocationProfile = {
    schema_version: "relocation-profile-v1",
    hard_constraints: { housing_budget: { amount: 4000000, currency: "IDR", period: "month" }, commute_minutes: 45 },
    soft_preferences: { goal: "work", target_fields: ["software_and_it_services"] },
    priority_weights: { career: 0.5, housing: 0.3, commute: 0.2 },
    taxonomy_version: "2026-09",
    contract_version: "lf05-v2",
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

test("LF-04 request validation rejects caller profiles, unaccepted snapshots, and bad scores", () => {
    assert.deepEqual(validateLF04Request(request), request);
    for (const invalid of [
        { ...request, confirmed_profile: { confirmed: true } },
        { ...request, run_id: "mine" },
        { ...request, fit_components: { job_access: 1.4 } },
        { ...request, fit_components: {} },
        { ...request, accepted_snapshot: { ...request.accepted_snapshot, validation_status: "candidate" } },
        { ...request, accepted_snapshot: { ...request.accepted_snapshot, evidence_ids: [] } },
        { ...request, accepted_snapshot: { ...request.accepted_snapshot, evidence_ids: ["evidence-001", "evidence-001"] } },
        { ...request, comparison_zone: { zone_id: "tebet" } },
        { ...request, language: "fr" },
    ]) {
        assert.throws(() => validateLF04Request(invalid), /INVALID_LF04_REQUEST/);
    }
});

test("LF-04 output validation re-checks evidence IDs and numeric grounding", () => {
    const parsed = parseLF04Output(explanation, validateLF04Request(request));
    assert.equal(parsed.generation_method, "gemini");
    assert.equal("fallback_reason" in parsed, false);
    assert.equal("runtime_usage" in parsed, false);

    for (const invalid of [
        { ...explanation, referenced_evidence_ids: ["evidence-999"] },
        { ...explanation, numeric_claims: [{ ...explanation.numeric_claims[0], value: 5 }] },
        { ...explanation, numeric_claims: [{ ...explanation.numeric_claims[0], snapshot_path: "source_coverage.coverage" }] },
        { ...explanation, strengths: ["About 12 companies hire here."] },
        { ...explanation, numeric_claims: [] },
        { ...explanation, evidence_gaps: [] },
        { ...explanation, contract_version: "lf04-v1" },
    ]) {
        assert.throws(() => parseLF04Output(invalid, validateLF04Request(request)), /INVALID_LF04_OUTPUT/);
    }
});

test("LF-04 controller sends the stored profile as confirmed and returns the validated explanation", async (context) => {
    const restoreEnvironment = setWorkflowEnvironment();
    let sentPayload: Record<string, unknown> | undefined;
    context.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
        sentPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({ object: "response", status: "completed", has_errors: false, output: { text: JSON.stringify(explanation) } });
    });

    try {
        const result = await explainZoneFit(profile, validateLF04Request(request));
        assert.equal(result.headline, explanation.headline);
        assert.equal(sentPayload?.flow_id, "2314c8f6-931d-46fd-b54d-e634ede6f3d5");

        const input = JSON.parse(String(sentPayload?.input_value)) as Record<string, unknown>;
        assert.deepEqual(input.confirmed_profile, {
            confirmed: true,
            hard_constraints: profile.hard_constraints,
            soft_preferences: profile.soft_preferences,
            priority_weights: profile.priority_weights,
        });
        assert.deepEqual(input.accepted_snapshot, request.accepted_snapshot);
        assert.equal(input.language, "en");
        assert.equal(sentPayload?.session_id, input.run_id);
    } finally {
        restoreEnvironment();
    }
});

test("LF-04 route validates before authentication and never calls Langflow for anonymous callers", async (context) => {
    const restoreEnvironment = setWorkflowEnvironment();
    let fetchCalls = 0;
    context.mock.method(globalThis, "fetch", async () => {
        fetchCalls += 1;
        return Response.json({});
    });
    const post = (body: string, type = "application/json") =>
        POST(new Request("http://localhost/api/lf04", { method: "POST", headers: { "content-type": type }, body }));

    try {
        assert.equal((await post(JSON.stringify(request), "text/plain")).status, 415);
        assert.equal((await post("{")).status, 400);
        assert.equal((await post(JSON.stringify({ ...request, confirmed_profile: { confirmed: true } }))).status, 400);
        assert.equal((await post(JSON.stringify(request))).status, 401);
        assert.equal(fetchCalls, 0);
    } finally {
        restoreEnvironment();
    }
});
