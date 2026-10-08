// Deployed wire versions also identify saved profiles; renaming them needs a coordinated rollout.
export const LANGFLOW_CONTRACTS = {
    zoneEvidenceDiscovery: "lf01-v2",
    evidenceClassification: "lf02-v2",
    evidenceConflictReview: "lf03-v2",
    zoneFitExplanation: "lf04-v2",
    relocationProfileInterpretation: "lf05-v2",
} as const;

export const DISCOVERY_CLAIM_FIELD = "call_lf01";

// Runs already stored before the rename may still carry numbered stages.
export function descriptiveEnrichmentStage(stage: string | null): string | null {
    if (stage === "lf01") return "zone_evidence_discovery";
    if (stage === "lf02") return "evidence_classification";
    return stage;
}
