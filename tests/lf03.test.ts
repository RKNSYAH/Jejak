import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "../app/api/lf03/route";
import { reviewEvidenceConflict } from "../app/engine/controller/conflictReviewController";
import { parseLF03Output, validateLF03Input } from "../app/engine/lib/lf03Validation";

const group = {
    entity_id: "org-001",
    attribute: "office_address",
    claims: [
        {
            evidence_id: "evidence-001",
            entity_id: "org-001",
            attribute: "office_address",
            value: "Jl. Example 1, Pancoran",
            source: { url: "https://example.com/contact", retrieved_at: "2026-09-17T00:00:00Z", source_class: "first_party" },
        },
        {
            evidence_id: "evidence-002",
            entity_id: "org-001",
            attribute: "office_address",
            value: "Jl. Example 2, Pancoran",
            source: { url: "https://example.org/company", retrieved_at: "2026-09-16T00:00:00Z" },
        },
    ],
};

const recommendation = {
    preferred_evidence_id: "evidence-001",
    supporting_evidence_ids: ["evidence-001"],
    conflicting_evidence_ids: ["evidence-002"],
    reason_code: "source_priority",
    reason: "The first-party contact page has stronger source priority.",
    requires_policy_decision: true,
    entity_id: "org-001",
    attribute: "office_address",
    contract_version: "lf03-v2",
    writes_performed: false,
    decision_method: "deterministic_policy",
    policy_trace: { source_priority: "decided" },
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

test("LF-03 input validation requires one entity, one attribute, provenance, and a real conflict", () => {
    assert.deepEqual(validateLF03Input(group), group);
    assert.throws(() => validateLF03Input({ ...group, run_id: "mine" }), /INVALID_LF03_INPUT/);
    assert.throws(() => validateLF03Input({ ...group, claims: [group.claims[0]] }), /INVALID_LF03_INPUT/);
    assert.throws(() => validateLF03Input({ ...group, claims: [group.claims[0], { ...group.claims[1], entity_id: "org-002" }] }), /INVALID_LF03_INPUT/);
    assert.throws(() => validateLF03Input({ ...group, claims: [group.claims[0], { ...group.claims[1], evidence_id: "evidence-001" }] }), /INVALID_LF03_INPUT/);
    assert.throws(() => validateLF03Input({ ...group, claims: [group.claims[0], { ...group.claims[1], source: { url: "ftp://x", retrieved_at: "2026-09-16" } }] }), /INVALID_LF03_INPUT/);
    assert.throws(() => validateLF03Input({ ...group, claims: [group.claims[0], { ...group.claims[1], value: group.claims[0].value }] }), /LF03_NO_CONFLICT/);
});

test("LF-03 output validation keeps references inside the sent group", () => {
    const parsed = parseLF03Output(recommendation, group);
    assert.equal(parsed.preferred_evidence_id, "evidence-001");
    assert.equal("runtime_usage" in parsed, false);

    const unresolved = { ...recommendation, preferred_evidence_id: null, supporting_evidence_ids: [], conflicting_evidence_ids: ["evidence-001", "evidence-002"], reason_code: "unresolved" };
    assert.equal(parseLF03Output(unresolved, group).reason_code, "unresolved");

    for (const invalid of [
        { ...recommendation, supporting_evidence_ids: ["evidence-001", "evidence-999"] },
        { ...recommendation, conflicting_evidence_ids: ["evidence-001"] },
        { ...recommendation, preferred_evidence_id: "evidence-002" },
        { ...recommendation, reason_code: "unresolved" },
        { ...recommendation, entity_id: "org-002" },
        { ...recommendation, writes_performed: true },
        { ...recommendation, requires_policy_decision: false },
    ]) {
        assert.throws(() => parseLF03Output(invalid, group), /INVALID_LF03_OUTPUT/);
    }
});

test("LF-03 controller sends the group with a server run ID and returns the validated recommendation", async (context) => {
    const restoreEnvironment = setWorkflowEnvironment();
    let sentPayload: Record<string, unknown> | undefined;
    context.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => {
        sentPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({ object: "response", status: "completed", has_errors: false, output: { text: JSON.stringify(recommendation) } });
    });

    try {
        const result = await reviewEvidenceConflict(validateLF03Input(group));
        assert.equal(result.reason_code, "source_priority");
        assert.equal(sentPayload?.flow_id, "d4b70d5c-0fd4-4b44-9bc0-79935a87718f");

        const input = JSON.parse(String(sentPayload?.input_value)) as Record<string, unknown>;
        assert.equal(typeof input.run_id, "string");
        assert.equal(sentPayload?.session_id, input.run_id);
        assert.deepEqual(input.claims, group.claims);
    } finally {
        restoreEnvironment();
    }
});

test("LF-03 route validates before authentication and never calls Langflow for anonymous callers", async (context) => {
    const restoreEnvironment = setWorkflowEnvironment();
    let fetchCalls = 0;
    context.mock.method(globalThis, "fetch", async () => {
        fetchCalls += 1;
        return Response.json({});
    });
    const post = (body: string, type = "application/json") =>
        POST(new Request("http://localhost/api/lf03", { method: "POST", headers: { "content-type": type }, body }));

    try {
        assert.equal((await post(JSON.stringify(group), "text/plain")).status, 415);
        assert.equal((await post("{")).status, 400);
        assert.equal((await post(JSON.stringify({ ...group, run_id: "mine" }))).status, 400);
        assert.equal((await post(JSON.stringify({ ...group, claims: [group.claims[0], { ...group.claims[1], value: group.claims[0].value }] }))).status, 422);

        const anonymous = await post(JSON.stringify(group));
        assert.equal(anonymous.status, 401);
        assert.equal((await anonymous.json()).code, "SIGN_IN_REQUIRED");
        assert.equal(fetchCalls, 0);
    } finally {
        restoreEnvironment();
    }
});
