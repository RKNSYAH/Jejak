import { onboardingTaxonomy } from "../extractUserProfile";
import { isRecord } from "../lib/zoneGeometry";
import type { LF01Candidate } from "./lf01Contract";

export type SectorClassification = { label: string; method: string; confidence: number };

// There is no organization registry yet, so LF-02 can only classify sectors and
// occupations; identity stays unresolved (docs/LF-02 "Input ownership").
export function buildLF02Input(runId: string, candidates: LF01Candidate[]) {
    return {
        run_id: runId,
        evidence_candidates: candidates.map((candidate) => candidate.raw),
        organizations: [],
        taxonomy: onboardingTaxonomy,
    };
}

export function parseLF02Output(value: unknown, runId: string): Map<string, SectorClassification> {
    if (!isRecord(value) || value.contract_version !== "lf02-v2" || (value.run_id !== undefined && value.run_id !== runId) ||
        value.writes_performed !== false) {
        throw new Error("INVALID_LF02_OUTPUT");
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
