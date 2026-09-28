import { isRecord } from "../lib/zoneGeometry";

export const precisions = ["building", "street", "neighborhood", "district", "city", "region", "unknown"] as const;
export type Precision = (typeof precisions)[number];

export type LF01Candidate = {
    evidenceId: string;
    sourceUrl: string;
    canonicalUrl: string;
    sourceType: string | null;
    publisher: string | null;
    retrievedAt: string;
    publishedAt: string | null;
    contentHash: string | null;
    subjectName: string | null;
    registeredDomain: string | null;
    claimType: string;
    claimScope: string | null;
    temporalStatus: string | null;
    normalizedValue: unknown;
    rawAddress: string | null;
    buildingName: string | null;
    precision: Precision;
    extractionMethod: string | null;
    modelId: string | null;
    promptVersion: string | null;
    extractorConfidence: number | null;
    // The untouched candidate, forwarded to LF-02 as LF-01 produced it.
    raw: Record<string, unknown>;
};

export type LF01Result = {
    status: string;
    candidates: LF01Candidate[];
    skipped: { index: number; reason: string }[];
    incompleteCategories: string[];
    errors: string[];
    pagesRetrieved: number;
    sourcesMonitored: number;
};

const MAX_CANDIDATES = 200;

function text(value: unknown, maxLength = 2048): string | null {
    return typeof value === "string" && value.trim() && value.length <= maxLength ? value.trim() : null;
}

function httpsUrl(value: unknown): string | null {
    const candidate = text(value);
    if (!candidate) return null;
    try {
        const url = new URL(candidate);
        return url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

function isoDate(value: unknown): string | null {
    const candidate = text(value, 64);
    return candidate && Number.isFinite(Date.parse(candidate)) ? new Date(candidate).toISOString() : null;
}

// LF-01 documents the hash as "sha256-hex"; accept bare or prefixed hex.
function contentHash(value: unknown): string | null {
    const match = typeof value === "string" ? /^(?:sha256[:-])?([0-9a-f]{64})$/i.exec(value.trim()) : null;
    return match ? match[1].toLowerCase() : null;
}

function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 50) : [];
}

function count(value: unknown): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

function parseCandidate(value: unknown, runId: string): LF01Candidate | string {
    if (!isRecord(value)) return "not_an_object";
    const source = isRecord(value.source) ? value.source : null;
    const claim = isRecord(value.claim) ? value.claim : null;
    const location = isRecord(value.location) ? value.location : {};
    const subject = isRecord(value.subject) ? value.subject : {};
    const processing = isRecord(value.processing) ? value.processing : {};
    if (!source || !claim) return "missing_source_or_claim";
    if (value.run_id !== undefined && value.run_id !== runId) return "run_id_mismatch";

    const evidenceId = text(value.evidence_id, 200);
    const canonicalUrl = httpsUrl(source.canonical_url) ?? httpsUrl(source.url);
    const retrievedAt = isoDate(source.retrieved_at);
    const claimType = text(claim.claim_type, 60);
    const normalizedValue = claim.normalized_value;
    if (!evidenceId) return "missing_evidence_id";
    if (!canonicalUrl) return "missing_https_url";
    if (!retrievedAt) return "missing_retrieved_at";
    if (!claimType) return "missing_claim_type";
    if (normalizedValue === null || normalizedValue === undefined || (typeof normalizedValue === "string" && !normalizedValue.trim()) ||
        !(typeof normalizedValue === "string" || isRecord(normalizedValue))) return "missing_value";

    const precision = (precisions as readonly unknown[]).includes(location.precision) ? location.precision as Precision : "unknown";
    const confidence = processing.extractor_confidence;
    return {
        evidenceId,
        sourceUrl: httpsUrl(source.url) ?? canonicalUrl,
        canonicalUrl,
        sourceType: text(source.source_type, 80),
        publisher: text(source.publisher, 160),
        retrievedAt,
        publishedAt: isoDate(source.published_at),
        contentHash: contentHash(source.content_hash),
        subjectName: text(subject.raw_name, 240),
        registeredDomain: text(subject.registered_domain, 255),
        claimType,
        claimScope: text(claim.scope, 40),
        temporalStatus: text(claim.temporal_status, 40),
        normalizedValue,
        rawAddress: text(location.raw_address, 500),
        buildingName: text(location.building_name, 200),
        precision,
        extractionMethod: text(processing.extraction_method, 80),
        modelId: text(processing.model_id, 120),
        promptVersion: text(processing.prompt_version, 80),
        extractorConfidence: typeof confidence === "number" && confidence >= 0 && confidence <= 1 ? confidence : null,
        raw: value,
    };
}

// Validates the lf01-v2 output. A malformed envelope throws (the run fails);
// a malformed candidate is skipped with a reason so the rest still count.
export function parseLF01Output(value: unknown, runId: string): LF01Result {
    if (!isRecord(value) || value.contract_version !== "lf01-v2" || value.run_id !== runId ||
        value.writes_performed !== false || !Array.isArray(value.evidence_candidates) ||
        value.evidence_candidates.length > MAX_CANDIDATES || typeof value.status !== "string") {
        throw new Error("INVALID_LF01_OUTPUT");
    }

    const candidates: LF01Candidate[] = [];
    const skipped: LF01Result["skipped"] = [];
    const seen = new Set<string>();
    value.evidence_candidates.forEach((item, index) => {
        const parsed = parseCandidate(item, runId);
        if (typeof parsed === "string") skipped.push({ index, reason: parsed });
        else if (seen.has(parsed.evidenceId)) skipped.push({ index, reason: "duplicate_evidence_id" });
        else {
            seen.add(parsed.evidenceId);
            candidates.push(parsed);
        }
    });

    const coverage = isRecord(value.source_coverage) ? value.source_coverage : {};
    return {
        status: value.status,
        candidates,
        skipped,
        incompleteCategories: strings(value.incomplete_evidence_categories),
        errors: strings(value.errors).map((error) => error.split(":")[0]),
        pagesRetrieved: count(coverage.pages_retrieved),
        sourcesMonitored: count(coverage.sources_monitored),
    };
}
