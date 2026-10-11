import { test } from "node:test";
import assert from "node:assert/strict";
import { readJsonBody } from "../app/engine/lib/http";

test("JSON request bodies have a bounded default size", async () => {
    const headers = { "Content-Type": "application/json" };
    assert.deepEqual(await readJsonBody(new Request("http://localhost", {
        method: "POST", headers, body: JSON.stringify({ ok: true }),
    })), { ok: true });

    const oversized = await readJsonBody(new Request("http://localhost", {
        method: "POST", headers, body: JSON.stringify({ padding: "x".repeat(65_536) }),
    }));
    assert.ok(oversized instanceof Response);
    assert.equal(oversized.status, 413);
});
