import { onboardingTaxonomy } from "../extractUserProfile";
import { LANGFLOW_CONTRACTS } from "../lib/langflowContracts";
import { isRecord } from "../lib/zoneGeometry";
import type { ZoneEvidenceCandidate } from "./zoneEvidenceDiscoveryContract";

export type SectorClassification = { label: string; method: string; confidence: number };

// Without an organization registry, classification can label sectors and
// occupations but cannot resolve identity.
export function buildEvidenceClassificationInput(runId: string, candidates: ZoneEvidenceCandidate[]) {
    return {
        run_id: runId,
        evidence_candidates: candidates.map((candidate) => candidate.raw),
        organizations: [],
        taxonomy: onboardingTaxonomy,
    };
}

export function parseEvidenceClassificationOutput(value: unknown, runId: string): Map<string, SectorClassification> {
    if (!isRecord(value) || value.contract_version !== LANGFLOW_CONTRACTS.evidenceClassification || (value.run_id !== undefined && value.run_id !== runId) ||
        value.writes_performed !== false) {
        throw new Error("INVALID_EVIDENCE_CLASSIFICATION_OUTPUT");
    }

    const sectors = new Map<string, SectorClassification>();
    for (const list of [value.resolved_candidates, value.unresolved_candidates]) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
            if (!isRecord(item) || typeof item.evidence_id !== "string" || !isRecord(item.classification)) continue;
            const sector = item.classification.sector;
            if (!isRecord(sector) || typeof sector.label !== "string" || typeof sector.method !== "string" ||
                typeof sector.confidence !== "number" || sector.confidence < 0 || sector.confidence > 1) continue;
            sectors.set(item.evidence_id, { label: sector.label, method: sector.method, confidence: sector.confidence });
        }
    }
    return sectors;
}
