import test from "node:test";
import assert from "node:assert/strict";
import { LANGFLOW_FLOWS } from "../app/engine/lib/langflow";
import { descriptiveEnrichmentStage, DISCOVERY_CLAIM_FIELD, LANGFLOW_CONTRACTS } from "../app/engine/lib/langflowContracts";
import { POST as review } from "../app/api/evidence-conflict-review/route";
import { POST as explain } from "../app/api/zone-fit-explanation/route";
import { POST as interpret } from "../app/api/relocation-profile-interpretation/route";
import { POST as legacyReview } from "../app/api/lf03/route";
import { POST as legacyExplain } from "../app/api/lf04/route";
import { POST as legacyInterpret } from "../app/api/lf05/route";

test("purpose names preserve deployed contracts, POST handlers, and stored run stages", () => {
    const purposes = ["zoneEvidenceDiscovery", "evidenceClassification", "evidenceConflictReview", "zoneFitExplanation", "relocationProfileInterpretation"];
    assert.deepEqual(Object.keys(LANGFLOW_FLOWS), purposes);
    assert.deepEqual(Object.keys(LANGFLOW_CONTRACTS), purposes);
    assert.deepEqual(Object.values(LANGFLOW_CONTRACTS), ["lf01-v2", "lf02-v2", "lf03-v2", "lf04-v2", "lf05-v2"]);
    assert.equal(DISCOVERY_CLAIM_FIELD, "call_lf01");
    assert.equal(legacyReview, review);
    assert.equal(legacyExplain, explain);
    assert.equal(legacyInterpret, interpret);
    assert.equal(descriptiveEnrichmentStage("lf01"), "zone_evidence_discovery");
    assert.equal(descriptiveEnrichmentStage("lf02"), "evidence_classification");
    assert.equal(descriptiveEnrichmentStage("zone_evidence_discovery"), "zone_evidence_discovery");
    assert.equal(descriptiveEnrichmentStage("geocoding"), "geocoding");
    assert.equal(descriptiveEnrichmentStage(null), null);
});
