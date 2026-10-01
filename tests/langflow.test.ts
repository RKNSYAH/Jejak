import { test } from "node:test";
import assert from "node:assert/strict";
import { getLangflowConfig, isLangflowConfigured, LangflowError, parseFlowEnvelope, runFlow } from "../app/engine/lib/langflow";
import { completed, withEnvironment } from "./helpers";

test("Langflow config accepts a base URL or the workflows endpoint and nothing else", () => {
    const endpoint = (url: string) => getLangflowConfig({ NEXT_LANGFLOW_URL: url, NEXT_LANGFLOW_API_KEY: "key" }).endpoint.toString();
    assert.equal(endpoint("https://flows.example.test"), "https://flows.example.test/api/v2/workflows");
    assert.equal(endpoint("https://flows.example.test/"), "https://flows.example.test/api/v2/workflows");
    assert.equal(endpoint("http://localhost:7860/api/v2/workflows/?x=1"), "http://localhost:7860/api/v2/workflows");
    for (const url of ["ftp://flows.example.test", "https://flows.example.test/api/v1/run", "not a url"]) {
        assert.throws(() => endpoint(url), (error: unknown) => error instanceof LangflowError && error.code === "config");
    }
    assert.equal(isLangflowConfigured({ NEXT_LANGFLOW_URL: "https://flows.example.test" }), false);
    assert.equal(isLangflowConfigured({ NEXT_LANGFLOW_API_KEY: "key" }), false);
});

test("flow envelopes must be completed and yield JSON with the expected contract", () => {
    assert.deepEqual(parseFlowEnvelope(completed({ output: { text: '{"contract_version":"lf05-v2"}' } }), "lf05-v2"), { contract_version: "lf05-v2" });
    // Multi-output flows: skip outputs that are not the requested contract.
    assert.deepEqual(parseFlowEnvelope(completed({
        outputs: ["not json", { text: '{"contract_version":"other"}' }, { output: { text: '{"contract_version":"lf01-v2","run_id":"r"}' } }],
    }), "lf01-v2"), { contract_version: "lf01-v2", run_id: "r" });
    const code = (envelope: unknown) => {
        try {
            parseFlowEnvelope(envelope, "lf01-v2");
            return null;
        } catch (error) {
            return error instanceof LangflowError ? error.code : "other";
        }
    };
    assert.equal(code({ ...completed({ output: { text: "{}" } }), has_errors: true }), "incomplete");
    assert.equal(code({ object: "response", status: "failed", has_errors: false }), "incomplete");
    assert.equal(code(completed({ output: { text: '{"contract_version":"lf02-v2"}' } })), "invalid_output");
    assert.equal(code(completed({})), "invalid_output");
});

test("runFlow posts the workflow request and maps transport failures to safe codes", async (context) => {
    const restore = withEnvironment("http://localhost:7860", "test-key");
    try {
        let sent: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
        const fetchMock = context.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
            sent = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
            return Response.json(completed({ output: { text: '{"contract_version":"lf01-v2","ok":true}' } }));
        });
        const result = await runFlow("flow-id", { zone_id: "pancoran" }, { timeoutMs: 1000, contract: "lf01-v2", sessionId: "session-1" });
        assert.deepEqual(result, { contract_version: "lf01-v2", ok: true });
        assert.ok(sent);
        const request = sent as { url: string; headers: Headers; body: Record<string, unknown> };
        assert.equal(request.url, "http://localhost:7860/api/v2/workflows");
        assert.equal(request.headers.get("x-api-key"), "test-key");
        assert.deepEqual(request.body, { flow_id: "flow-id", input_value: '{"zone_id":"pancoran"}', mode: "sync", session_id: "session-1" });

        const failure = async (response: () => Promise<Response>, options = {}) => {
            fetchMock.mock.mockImplementation(response);
            try {
                await runFlow("flow-id", {}, { timeoutMs: 1000, ...options });
                return null;
            } catch (error) {
                return error instanceof LangflowError ? error.code : "other";
            }
        };
        assert.equal(await failure(async () => new Response("down", { status: 500 })), "upstream");
        assert.equal(await failure(async () => { throw new TypeError("fetch failed"); }), "unreachable");
        assert.equal(await failure(async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); }), "timeout");
        assert.equal(await failure(async () => new Response("<html>")), "invalid_response");
        assert.equal(await failure(async () => Response.json(completed({ output: { text: "x".repeat(50) } })), { maxBytes: 40 }), "invalid_response");
    } finally {
        restore();
    }

    const restoreMissing = withEnvironment(undefined, undefined);
    try {
        await assert.rejects(runFlow("flow-id", {}, { timeoutMs: 1000 }), (error: unknown) => error instanceof LangflowError && error.code === "config");
    } finally {
        restoreMissing();
    }
});
