import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_HCI_BATCH, parseClickBatch } from "../app/engine/controller/hciController";
import { POST } from "../app/api/hci/route";

const click = {
    elapsed_ms: 1200, region: "categories", target: "Pekerjaan", x: 0.42, y: 0.08,
    viewport_width: 1280, viewport_height: 720, paint_ms: 16.4, response_ms: 16.4,
};
const batch = { session_id: "6f1c2d3e-4b5a-4c6d-8e7f-001122334455", participant: "P01", clicks: [click] };

test("click batches keep only known fields", () => {
    assert.deepEqual(parseClickBatch({ ...batch, extra: true, clicks: [{ ...click, value: "typed text" }] }), batch);
});

test("keyboard clicks, busy timeouts, and anonymous sessions are valid", () => {
    const keyboard = { ...click, x: null, y: null, response_ms: null };
    assert.deepEqual(parseClickBatch({ ...batch, participant: null, clicks: [keyboard] }).clicks, [keyboard]);
});

test("click batches reject values the database constraints would refuse", () => {
    for (const bad of [
        null,
        { ...batch, session_id: "not-a-uuid" },
        { ...batch, participant: "P 01" },
        { ...batch, clicks: [] },
        { ...batch, clicks: Array(MAX_HCI_BATCH + 1).fill(click) },
        { ...batch, clicks: [{ ...click, region: "Zone Panel" }] },
        { ...batch, clicks: [{ ...click, target: "" }] },
        { ...batch, clicks: [{ ...click, x: null }] },
        { ...batch, clicks: [{ ...click, x: 1.2 }] },
        { ...batch, clicks: [{ ...click, elapsed_ms: 1.5 }] },
        { ...batch, clicks: [{ ...click, paint_ms: -1 }] },
        { ...batch, clicks: [{ ...click, response_ms: 60001 }] },
    ]) assert.throws(() => parseClickBatch(bad), /Invalid click/);
});

test("the telemetry route answers malformed bodies with 400 before touching the database", async () => {
    const res = await POST(new Request("http://localhost/api/hci", { method: "POST", body: "not json" }));
    assert.equal(res.status, 400);
});
