import { isIdentifier } from "./lf03Validation";
import { isRecord, isRegionCode } from "./zoneGeometry";

type LF04Snapshot = {
    zone_id: string;
    snapshot_at: string;
    validation_status: "accepted";
    evidence_ids: string[];
} & Record<string, unknown>;

// The user's part of an LF-04 request. The confirmed profile is never part of it:
// the server loads the user's saved, confirmed profile itself.
export type LF04Request = {
    fit_components: Record<string, number | { score: number }>;
    accepted_snapshot: LF04Snapshot;
    source_coverage: Record<string, unknown>;
    comparison_zone?: LF04Snapshot | null;
    language?: "id";
};

type LF04NumericClaim = { text: string; snapshot_path: string; value: number };

export type LF04Explanation = {
    headline: string;
    summary: string;
    strengths: string[];
    trade_offs: string[];
    evidence_gaps: string[];
    suggested_next_actions: string[];
    referenced_evidence_ids: string[];
    numeric_claims: LF04NumericClaim[];
    contract_version: "lf04-v2";
    validation_status: "validated_proposal";
    generation_method: "gemini" | "deterministic_template";
};

const REQUEST_FIELDS = new Set(["fit_components", "accepted_snapshot", "source_coverage", "comparison_zone", "language"]);
const COVERAGES = new Set(["complete", "partial", "insufficient", "unavailable"]);
const PROSE_LISTS = ["strengths", "trade_offs", "evidence_gaps", "suggested_next_actions"] as const;

export function isStringList(value: unknown, maxItems = 100): value is string[] {
    return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === "string" && item.length <= 4000);
}

function isScore(value: unknown) {
    const score = isRecord(value) ? value.score : value;
    return typeof score === "number" && Number.isFinite(score) && score >= 0 && score <= 1 &&
        (!isRecord(value) || Object.keys(value).length === 1);
}

function isAcceptedSnapshot(value: unknown): value is LF04Snapshot {
    return isRecord(value) && value.validation_status === "accepted" &&
        typeof value.zone_id === "string" && isRegionCode(value.zone_id) &&
        typeof value.snapshot_at === "string" && !Number.isNaN(Date.parse(value.snapshot_at)) &&
        isStringList(value.evidence_ids) && value.evidence_ids.length > 0 &&
        value.evidence_ids.every(isIdentifier) &&
        new Set(value.evidence_ids).size === value.evidence_ids.length;
}

// Mirrors the flow's input contract so a malformed request fails before a Langflow run.
export function validateLF04Request(value: unknown): LF04Request {
    if (!isRecord(value) || JSON.stringify(value).length > 50_000 || Object.keys(value).some((key) => !REQUEST_FIELDS.has(key))) {
        throw new Error("INVALID_LF04_REQUEST");
    }
    const fitEntries = isRecord(value.fit_components) ? Object.entries(value.fit_components) : null;
    const coverage = value.source_coverage;
    if (!fitEntries || fitEntries.length === 0 || fitEntries.length > 20 ||
        fitEntries.some(([key, score]) => !/^[a-z][a-z_]{0,63}$/.test(key) || !isScore(score)) ||
        !isAcceptedSnapshot(value.accepted_snapshot) ||
        (value.comparison_zone !== undefined && value.comparison_zone !== null && !isAcceptedSnapshot(value.comparison_zone)) ||
        !isRecord(coverage) || (coverage.coverage !== undefined && !COVERAGES.has(String(coverage.coverage))) ||
        (coverage.incomplete_evidence_categories !== undefined && !isStringList(coverage.incomplete_evidence_categories, 20)) ||
        (value.language !== undefined && value.language !== "id")) {
        throw new Error("INVALID_LF04_REQUEST");
    }
    return value as LF04Request;
}

function snapshotValue(path: string, snapshots: Record<string, LF04Snapshot>): unknown {
    const [root, ...fields] = path.split(".");
    if (!Object.hasOwn(snapshots, root) || fields.length === 0 || fields.length > 7) return undefined;
    let value: unknown = snapshots[root];
    for (const field of fields) {
        if (!isRecord(value) || !Object.hasOwn(value, field)) return undefined;
        value = value[field];
    }
    return value;
}

// Re-checks the flow's grounding before anything reaches a user: every referenced
// evidence ID comes from the sent snapshots, every numeric claim resolves to the same
// snapshot value, and no number appears in the prose outside a numeric claim.
export function parseLF04Output(value: unknown, request: LF04Request): LF04Explanation {
    if (!isRecord(value) || value.contract_version !== "lf04-v2" || value.validation_status !== "validated_proposal" ||
        (value.generation_method !== "gemini" && value.generation_method !== "deterministic_template") ||
        typeof value.headline !== "string" || value.headline.length > 6000 ||
        typeof value.summary !== "string" || value.summary.length > 6000 ||
        !isStringList(value.referenced_evidence_ids) || PROSE_LISTS.some((key) => !isStringList(value[key])) ||
        !Array.isArray(value.numeric_claims) || value.numeric_claims.length > 50) {
        throw new Error("INVALID_LF04_OUTPUT");
    }

    const snapshots: Record<string, LF04Snapshot> = { accepted_snapshot: request.accepted_snapshot };
    if (request.comparison_zone) snapshots.comparison_zone = request.comparison_zone;
    const allowedIds = new Set(Object.values(snapshots).flatMap((snapshot) => snapshot.evidence_ids));
    if (value.referenced_evidence_ids.some((id) => !allowedIds.has(id))) throw new Error("INVALID_LF04_OUTPUT");

    const lists = PROSE_LISTS.map((key) => value[key] as string[]);
    const prose = [value.headline, value.summary, ...lists.flat()].join(" ");
    const citedSpans: [number, number][] = [];
    const claims: LF04NumericClaim[] = [];
    for (const claim of value.numeric_claims) {
        if (!isRecord(claim) || Object.keys(claim).length !== 3 || typeof claim.text !== "string" || claim.text.length === 0 ||
            typeof claim.snapshot_path !== "string" || typeof claim.value !== "number" || !Number.isFinite(claim.value) ||
            snapshotValue(claim.snapshot_path, snapshots) !== claim.value) {
            throw new Error("INVALID_LF04_OUTPUT");
        }
        const start = prose.indexOf(claim.text);
        const tokens = claim.text.match(/(?<!\w)[-+]?\d+(?:[.,]\d+)*/g) ?? [];
        if (start === -1 || prose.indexOf(claim.text, start + 1) !== -1 || tokens.length === 0 ||
            tokens.some((token) => Number(token.replaceAll(",", "")) !== claim.value)) {
            throw new Error("INVALID_LF04_OUTPUT");
        }
        citedSpans.push([start, start + claim.text.length]);
        claims.push({ text: claim.text, snapshot_path: claim.snapshot_path, value: claim.value });
    }
    for (const match of prose.matchAll(/\d+(?:[.,]\d+)*/g)) {
        const end = match.index + match[0].length;
        if (!citedSpans.some(([spanStart, spanEnd]) => spanStart <= match.index && end <= spanEnd)) throw new Error("INVALID_LF04_OUTPUT");
    }

    const coverage = request.source_coverage.coverage;
    const [strengths, tradeOffs, evidenceGaps, nextActions] = lists;
    if ((coverage === "partial" || coverage === "insufficient") && evidenceGaps.length === 0) throw new Error("INVALID_LF04_OUTPUT");

    return {
        headline: value.headline,
        summary: value.summary,
        strengths,
        trade_offs: tradeOffs,
        evidence_gaps: evidenceGaps,
        suggested_next_actions: nextActions,
        referenced_evidence_ids: value.referenced_evidence_ids,
        numeric_claims: claims,
        contract_version: "lf04-v2",
        validation_status: "validated_proposal",
        generation_method: value.generation_method,
    };
}
