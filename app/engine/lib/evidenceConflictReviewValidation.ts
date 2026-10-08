import { isRecord } from "./zoneGeometry";
import { LANGFLOW_CONTRACTS } from "./langflowContracts";

type EvidenceConflictReviewClaim = {
    evidence_id: string;
    entity_id: string;
    attribute: string;
    value: unknown;
    source: { url: string; retrieved_at: string } & Record<string, unknown>;
} & Record<string, unknown>;

// One deterministic conflict group: the same entity and attribute with differing values.
export type EvidenceConflictGroup = {
    entity_id: string;
    attribute: string;
    claims: EvidenceConflictReviewClaim[];
};

const REASON_CODES = ["source_priority", "newer_evidence", "expired_vacancy", "geographic_precision", "headcount_scope_mismatch", "unresolved"] as const;
const DECISION_METHODS = ["deterministic_policy", "gemini_review"] as const;

export type EvidenceConflictRecommendation = {
    preferred_evidence_id: string | null;
    supporting_evidence_ids: string[];
    conflicting_evidence_ids: string[];
    reason_code: typeof REASON_CODES[number];
    reason: string;
    requires_policy_decision: true;
    entity_id: string;
    attribute: string;
    contract_version: typeof LANGFLOW_CONTRACTS.evidenceConflictReview;
    writes_performed: false;
    decision_method: typeof DECISION_METHODS[number];
    policy_trace: Record<string, unknown> | null;
};

const GROUP_FIELDS = new Set(["entity_id", "attribute", "claims"]);
const reasonCodes = new Set<string>(REASON_CODES);
const decisionMethods = new Set<string>(DECISION_METHODS);

export function isIdentifier(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0 && value.length <= 200;
}

function isIdentifierList(value: unknown): value is string[] {
    return Array.isArray(value) && value.length <= 30 && value.every(isIdentifier);
}

function isHttpUrl(value: unknown) {
    if (typeof value !== "string" || value.length > 2000) return false;
    try {
        return ["http:", "https:"].includes(new URL(value).protocol);
    } catch {
        return false;
    }
}

// Mirrors the flow's own input contract so a malformed group fails here instead of
// spending a Langflow run. The flow still canonicalizes values and may report NO_CONFLICT.
export function validateEvidenceConflictReviewInput(value: unknown): EvidenceConflictGroup {
    if (!isRecord(value) || JSON.stringify(value).length > 55_000 || Object.keys(value).some((key) => !GROUP_FIELDS.has(key))) {
        throw new Error("INVALID_EVIDENCE_CONFLICT_REVIEW_INPUT");
    }
    if (!isIdentifier(value.entity_id) || typeof value.attribute !== "string" || !/^[a-z][a-z0-9_]{0,63}$/.test(value.attribute) ||
        !Array.isArray(value.claims) || value.claims.length < 2 || value.claims.length > 30) {
        throw new Error("INVALID_EVIDENCE_CONFLICT_REVIEW_INPUT");
    }

    const evidenceIds = new Set<string>();
    const values = new Set<string>();
    for (const claim of value.claims) {
        if (!isRecord(claim) || !("value" in claim) || !isIdentifier(claim.evidence_id) ||
            claim.entity_id !== value.entity_id || claim.attribute !== value.attribute ||
            !isRecord(claim.source) || !isHttpUrl(claim.source.url) ||
            typeof claim.source.retrieved_at !== "string" || Number.isNaN(Date.parse(claim.source.retrieved_at))) {
            throw new Error("INVALID_EVIDENCE_CONFLICT_REVIEW_INPUT");
        }
        evidenceIds.add(claim.evidence_id);
        values.add(JSON.stringify(claim.value));
    }
    if (evidenceIds.size !== value.claims.length) throw new Error("INVALID_EVIDENCE_CONFLICT_REVIEW_INPUT");
    if (values.size < 2) throw new Error("EVIDENCE_CONFLICT_REVIEW_NO_CONFLICT");

    return value as EvidenceConflictGroup;
}

// Conflict review only recommends; the validation policy still makes the final decision. Every
// referenced ID must come from the group that was sent.
export function parseEvidenceConflictReviewOutput(value: unknown, group: EvidenceConflictGroup): EvidenceConflictRecommendation {
    if (!isRecord(value) || value.contract_version !== LANGFLOW_CONTRACTS.evidenceConflictReview || value.writes_performed !== false ||
        value.entity_id !== group.entity_id || value.attribute !== group.attribute ||
        typeof value.reason_code !== "string" || !reasonCodes.has(value.reason_code) ||
        typeof value.reason !== "string" || value.reason.length === 0 || value.reason.length > 4000 ||
        value.requires_policy_decision !== true || typeof value.decision_method !== "string" || !decisionMethods.has(value.decision_method) ||
        !isIdentifierList(value.supporting_evidence_ids) || !isIdentifierList(value.conflicting_evidence_ids) ||
        (value.preferred_evidence_id !== null && typeof value.preferred_evidence_id !== "string") ||
        (value.policy_trace !== undefined && value.policy_trace !== null && !isRecord(value.policy_trace))) {
        throw new Error("INVALID_EVIDENCE_CONFLICT_REVIEW_OUTPUT");
    }

    const allowed = new Set(group.claims.map((claim) => claim.evidence_id));
    const supporting = new Set(value.supporting_evidence_ids);
    const preferred = value.preferred_evidence_id;
    if ([...supporting, ...value.conflicting_evidence_ids].some((id) => !allowed.has(id)) ||
        value.conflicting_evidence_ids.some((id) => supporting.has(id)) ||
        (preferred !== null && !supporting.has(preferred)) ||
        (preferred === null) !== (value.reason_code === "unresolved")) {
        throw new Error("INVALID_EVIDENCE_CONFLICT_REVIEW_OUTPUT");
    }

    return {
        preferred_evidence_id: preferred,
        supporting_evidence_ids: value.supporting_evidence_ids,
        conflicting_evidence_ids: value.conflicting_evidence_ids,
        reason_code: value.reason_code as EvidenceConflictRecommendation["reason_code"],
        reason: value.reason,
        requires_policy_decision: true,
        entity_id: group.entity_id,
        attribute: group.attribute,
        contract_version: LANGFLOW_CONTRACTS.evidenceConflictReview,
        writes_performed: false,
        decision_method: value.decision_method as EvidenceConflictRecommendation["decision_method"],
        policy_trace: (value.policy_trace as Record<string, unknown> | undefined) ?? null,
    };
}
