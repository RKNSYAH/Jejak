import { isRecord } from "../lib/zoneGeometry";
import type { LF01Candidate, Precision } from "./lf01Contract";
import type { SectorClassification } from "./lf02Contract";
import type { LocalityTier } from "./locality";
import { sha256Hex, type EvidenceType } from "./scopes";

const CONFIDENCE_VERSION = "evidence-confidence-v1";
// Spec §15: below 0.40 a value is "insufficient" and is not published.
export const ACCEPTANCE_THRESHOLD = 0.4;

const LISTING_TYPES = new Set<EvidenceType>(["kos_listing", "apartment_listing", "house_listing"]);
const HOUSING_PROVIDERS = ["mamikos.com", "rumah123.com", "travelio.com"];
const MIN_MONTHLY_RENT = 100_000;
const MAX_MONTHLY_RENT = 100_000_000;
const MAX_HEADCOUNT = 5_000_000;

function wholeNumber(value: unknown, minimum: number, maximum: number): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

// Returns a rejection reason, or null when the claim value fits its evidence type.
export function checkClaimValue(candidate: LF01Candidate, type: EvidenceType): string | null {
    const value = candidate.normalizedValue;
    if (type === "active_opening" && candidate.temporalStatus === "expired") return "expired_vacancy";
    if (LISTING_TYPES.has(type)) {
        if (!isRecord(value) || typeof value.listing_name !== "string" || !value.listing_name.trim() ||
            !wholeNumber(value.monthly_rent_idr, MIN_MONTHLY_RENT, MAX_MONTHLY_RENT)) return "invalid_listing_value";
    }
    if (type === "local_employment") {
        if (!isRecord(value) || !wholeNumber(value.minimum, 1, MAX_HEADCOUNT) || !wholeNumber(value.maximum, 1, MAX_HEADCOUNT) ||
            value.minimum > value.maximum) return "invalid_headcount_value";
    }
    return null;
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (isRecord(value)) {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value ?? null);
}

// Same claim value on the same page is one record, whichever run found it.
export function dedupHash(type: EvidenceType, canonicalUrl: string, value: unknown): string {
    return sha256Hex(`${type}|${canonicalUrl}|${canonicalJson(value)}`);
}

// Key for cross-source agreement: the same claim value seen on different pages.
export function agreementKey(type: EvidenceType, value: unknown): string {
    return `${type}|${canonicalJson(value)}`;
}

function hostOf(value: string | null): string | null {
    if (!value) return null;
    try {
        return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
        return null;
    }
}

function onDomain(host: string, domain: string): boolean {
    return host === domain || host.endsWith(`.${domain}`);
}

function sourceReliability(candidate: LF01Candidate): number {
    // LinkedIn and Indeed postings arrive as search-provider titles and snippets only.
    if (candidate.sourceType === "search_snippet") return 0.3;
    const host = hostOf(candidate.canonicalUrl);
    const registered = hostOf(candidate.registeredDomain);
    if (host && registered && onDomain(host, registered)) return 0.9;
    if (host && HOUSING_PROVIDERS.some((provider) => onDomain(host, provider))) return 0.7;
    return 0.5;
}

const precisionScore: Record<Precision, number> = {
    building: 1, street: 0.85, neighborhood: 0.7, district: 0.55, city: 0.3, region: 0.15, unknown: 0,
};

// evidence-confidence-v1, an MVP form of spec §15: 30% source reliability,
// 25% geographic precision, 20% freshness, 15% extractor confidence (standing in
// for per-record coverage), 10% cross-source agreement.
export function publishedConfidence(candidate: LF01Candidate, precision: Precision, agreed: boolean, now: Date): number {
    const observedAt = Date.parse(candidate.publishedAt ?? candidate.retrievedAt);
    const ageDays = (now.getTime() - observedAt) / 86_400_000;
    const freshness = ageDays <= 7 ? 1 : ageDays <= 30 ? 0.5 : 0;
    const score = 0.3 * sourceReliability(candidate) + 0.25 * precisionScore[precision] + 0.2 * freshness +
        0.15 * (candidate.extractorConfidence ?? 0.5) + 0.1 * (agreed ? 1 : 0.5);
    return Math.round(score * 10_000) / 10_000;
}

// Matches the recordset read by public.upsert_zone_evidence().
export type EvidenceRow = {
    dedup_hash: string;
    entity_name: string | null;
    canonical_url: string;
    value: unknown;
    latitude: number;
    longitude: number;
    geographic_precision: Precision;
    locality_tier: LocalityTier;
    source: Record<string, unknown>;
    publisher: string | null;
    content_hash: string | null;
    confidence: number;
    retrieved_at: string;
    validation_status: "accepted";
    is_sample: false;
};

export function buildEvidenceRow(input: {
    candidate: LF01Candidate;
    type: EvidenceType;
    latitude: number;
    longitude: number;
    precision: Precision;
    tier: LocalityTier;
    confidence: number;
    runId: string;
    sector: SectorClassification | null;
    // "company_office" when a posting was placed by its company's office address.
    locationBasis?: "stated_address" | "company_office";
    officeSourceUrl?: string | null;
}): EvidenceRow {
    const { candidate, type } = input;
    const value = candidate.normalizedValue;
    const listingName = LISTING_TYPES.has(type) && isRecord(value) && typeof value.listing_name === "string" ? value.listing_name : null;
    return {
        dedup_hash: dedupHash(type, candidate.canonicalUrl, value),
        entity_name: (listingName ?? candidate.subjectName)?.slice(0, 240) ?? null,
        canonical_url: candidate.canonicalUrl,
        value,
        latitude: input.latitude,
        longitude: input.longitude,
        geographic_precision: input.precision,
        locality_tier: input.tier,
        // Provenance only: no page excerpts are stored.
        source: {
            url: candidate.sourceUrl,
            source_type: candidate.sourceType,
            publisher: candidate.publisher,
            published_at: candidate.publishedAt,
            retrieved_at: candidate.retrievedAt,
            evidence_id: candidate.evidenceId,
            lf01_run_id: input.runId,
            extraction_method: candidate.extractionMethod,
            model_id: candidate.modelId,
            prompt_version: candidate.promptVersion,
            confidence_version: CONFIDENCE_VERSION,
            sector_classification: input.sector,
            location_basis: input.locationBasis ?? "stated_address",
            ...(input.officeSourceUrl ? { office_source_url: input.officeSourceUrl } : {}),
        },
        publisher: candidate.publisher,
        content_hash: candidate.contentHash,
        confidence: input.confidence,
        retrieved_at: candidate.retrievedAt,
        validation_status: "accepted",
        is_sample: false,
    };
}
