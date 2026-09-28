import { test } from "node:test";
import assert from "node:assert/strict";
import { validateLF01Input } from "../app/engine/lib/lf01Validation";

const input = {
    run_id: "uuid", zone_id: "pancoran", zone_name: "Pancoran", city_name: "Jakarta Selatan",
    requested_at: "2026-09-24T00:00:00Z",
};

test("LF-01 applies defaults only to omitted fields and keeps the supplied run ID", () => {
    const parsed = validateLF01Input(input);
    assert.equal(parsed.run_id, "uuid");
    assert.equal(parsed.maximum_sources, 10);
    assert.deepEqual(parsed.missing_evidence, ["company_presence", "active_openings"]);
    assert.deepEqual(validateLF01Input({ ...input, missing_evidence: [] }).missing_evidence, []);
    assert.throws(() => validateLF01Input({ ...input, maximum_sources: null }));
    assert.throws(() => validateLF01Input({ ...input, missing_evidence: null }));
});

test("LF-01 validates limits, calendar dates, bounding boxes and evidence names", () => {
    for (const maximum_sources of [0, 31, 1.5, "5"]) {
        assert.throws(() => validateLF01Input({ ...input, maximum_sources }), /maximum_sources/);
    }
    for (const requested_at of ["yesterday", "2026-02-30T00:00:00Z", "2026-09-24"]) {
        assert.throws(() => validateLF01Input({ ...input, requested_at }), /requested_at/);
    }
    assert.throws(() => validateLF01Input({ ...input, bounding_box: [107, -6, 106, -5] }), /bounding_box/);
    assert.throws(() => validateLF01Input({ ...input, missing_evidence: ["active_opening"] }), /missing_evidence/);
    assert.equal(validateLF01Input({ ...input, maximum_sources: 5, bounding_box: [106.82, -6.27, 106.86, -6.22] }).maximum_sources, 5);
    assert.equal(validateLF01Input({ ...input, maximum_sources: 30 }).maximum_sources, 30);
});

test("LF-01 rejects prohibited keys before constructing the outbound payload", () => {
    for (const key of ["fixture", "fixture_name", "mode", "cached_content_hashes"]) {
        assert.throws(() => validateLF01Input({ ...input, [key]: "sample" }), /Rejected field/);
    }
    assert.equal("profile_id" in validateLF01Input({ ...input, profile_id: "private" }), false);
    assert.throws(() => validateLF01Input([]), /JSON object/);
    assert.throws(() => validateLF01Input({ ...input, zone_name: " " }), /zone_name/);
});
