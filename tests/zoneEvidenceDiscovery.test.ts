import { test } from "node:test";
import assert from "node:assert/strict";
import { validateZoneEvidenceDiscoveryInput } from "../app/engine/lib/zoneEvidenceDiscoveryValidation";

const input = {
    run_id: "uuid", zone_id: "pancoran", zone_name: "Pancoran", city_name: "Jakarta Selatan",
    requested_at: "2026-09-24T00:00:00Z",
};

test("zone evidence discovery applies defaults only to omitted fields and keeps the supplied run ID", () => {
    const parsed = validateZoneEvidenceDiscoveryInput(input);
    assert.equal(parsed.run_id, "uuid");
    assert.equal(parsed.maximum_sources, 10);
    assert.deepEqual(parsed.missing_evidence, ["company_presence", "active_openings"]);
    assert.deepEqual(validateZoneEvidenceDiscoveryInput({ ...input, missing_evidence: [] }).missing_evidence, []);
    assert.throws(() => validateZoneEvidenceDiscoveryInput({ ...input, maximum_sources: null }));
    assert.throws(() => validateZoneEvidenceDiscoveryInput({ ...input, missing_evidence: null }));
});

test("zone evidence discovery validates limits, calendar dates, bounding boxes and evidence names", () => {
    for (const maximum_sources of [0, 31, 1.5, "5"]) {
        assert.throws(() => validateZoneEvidenceDiscoveryInput({ ...input, maximum_sources }), /maximum_sources/);
    }
    for (const requested_at of ["yesterday", "2026-02-30T00:00:00Z", "2026-09-24"]) {
        assert.throws(() => validateZoneEvidenceDiscoveryInput({ ...input, requested_at }), /requested_at/);
    }
    assert.throws(() => validateZoneEvidenceDiscoveryInput({ ...input, bounding_box: [107, -6, 106, -5] }), /bounding_box/);
    assert.throws(() => validateZoneEvidenceDiscoveryInput({ ...input, missing_evidence: ["active_opening"] }), /missing_evidence/);
    assert.equal(validateZoneEvidenceDiscoveryInput({ ...input, maximum_sources: 5, bounding_box: [106.82, -6.27, 106.86, -6.22] }).maximum_sources, 5);
    assert.equal(validateZoneEvidenceDiscoveryInput({ ...input, maximum_sources: 30 }).maximum_sources, 30);
});

test("zone evidence discovery rejects prohibited keys before constructing the outbound payload", () => {
    for (const key of ["fixture", "fixture_name", "mode", "cached_content_hashes"]) {
        assert.throws(() => validateZoneEvidenceDiscoveryInput({ ...input, [key]: "sample" }), /Rejected field/);
    }
    assert.equal("profile_id" in validateZoneEvidenceDiscoveryInput({ ...input, profile_id: "private" }), false);
    assert.throws(() => validateZoneEvidenceDiscoveryInput([]), /JSON object/);
    assert.throws(() => validateZoneEvidenceDiscoveryInput({ ...input, zone_name: " " }), /zone_name/);
});
