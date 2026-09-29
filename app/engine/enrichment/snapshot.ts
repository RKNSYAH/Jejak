import { isRecord } from "../lib/zoneGeometry";
import type { LocalityTier } from "./locality";
import { approxCount } from "./labels";
import { isPublicSnapshot } from "./snapshotContract";
import { scopeEvidenceTypes, type EnrichmentScope, type EvidenceType } from "./scopes";

export { isPublicSnapshot };

// Accepted rows as public.get_zone_evidence() returns them (subset used here).
export type StoredEvidence = {
    evidence_type: string;
    entity_name: string | null;
    value: unknown;
    canonical_url: string;
    latitude: number | null;
    longitude: number | null;
    locality_tier: LocalityTier | null;
    confidence: number | string | null;
    retrieved_at: string | null;
    refresh_after: string | null;
    expires_at: string;
};

export type Coverage = "complete" | "partial" | "unavailable";

export type SnapshotDraft = {
    snapshot: Record<string, unknown>;
    evidenceCount: number;
    contributorCount: number;
    coverage: Coverage;
    confidence: number | null;
    generatedAt: string;
    refreshAfter: string;
    expiresAt: string;
};

type Range = { minimum: number; maximum: number; status: "observed" | "estimated"; method_version?: string } | { status: "unavailable" };

const unavailable: Range = { status: "unavailable" };
const MIN_EMPLOYMENT_CONTRIBUTORS = 3;

function entity(row: StoredEvidence): string | null {
    return row.entity_name?.trim().toLowerCase() || null;
}

function distinct(values: (string | null)[]): number {
    return new Set(values.filter((value): value is string => value !== null)).size;
}

function host(url: string): string | null {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return null;
    }
}

function range(values: { minimum: number; maximum: number }[], status: "observed" | "estimated"): Range {
    if (!values.length) return unavailable;
    return {
        minimum: Math.min(...values.map((value) => value.minimum)),
        maximum: Math.max(...values.map((value) => value.maximum)),
        status,
    };
}

function number(value: unknown): number | null {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

// Only an explicit monthly IDR range counts as salary evidence.
function monthlySalary(value: unknown): { minimum: number; maximum: number } | null {
    if (!isRecord(value)) return null;
    const minimum = number(value.minimum ?? value.min);
    const maximum = number(value.maximum ?? value.max) ?? minimum;
    const currency = String(value.currency ?? "").toUpperCase();
    const period = String(value.period ?? "").toLowerCase();
    if (minimum === null || maximum === null || maximum < minimum || currency !== "IDR" || !["month", "monthly", "bulan"].includes(period)) {
        return null;
    }
    return { minimum, maximum };
}

function dateOnly(value: string): string {
    return new Date(value).toISOString().slice(0, 10);
}

function careerFields(evidence: Partial<Record<EvidenceType, StoredEvidence[]>>, limitations: string[]) {
    const inZone = (type: EvidenceType) => (evidence[type] ?? []).filter((row) => row.locality_tier === "zone");
    const offices = inZone("office_presence");
    const openings = inZone("active_opening");
    const headcounts = inZone("local_employment");
    const salaries = inZone("salary_observation").map((row) => monthlySalary(row.value)).filter((value) => value !== null);

    // Distinct offices: the same organization at two addresses is two offices.
    const officeKeys = offices.map((row) => row.latitude === null || row.longitude === null ? null
        : `${entity(row) ?? row.canonical_url}|${row.latitude.toFixed(4)},${row.longitude.toFixed(4)}`);
    const headcountContributors = distinct(headcounts.map(entity));
    const headcountRanges = headcounts.map((row) => isRecord(row.value) ? { minimum: Number(row.value.minimum), maximum: Number(row.value.maximum) } : null)
        .filter((value): value is { minimum: number; maximum: number } => value !== null && Number.isFinite(value.minimum) && Number.isFinite(value.maximum));

    // Spec §10.2 and the database privacy check: no employment range from fewer than three contributors.
    let employment: Range = unavailable;
    if (headcountContributors >= MIN_EMPLOYMENT_CONTRIBUTORS && headcountRanges.length) {
        employment = {
            minimum: headcountRanges.reduce((sum, value) => sum + value.minimum, 0),
            maximum: headcountRanges.reduce((sum, value) => sum + value.maximum, 0),
            status: "estimated",
            method_version: "local-headcount-v1",
        };
    } else {
        limitations.push("Local headcount evidence is too sparse for an employment estimate.");
    }
    const salary = range(salaries, "observed");
    if (salary.status === "unavailable") limitations.push("No monthly IDR salary range was observed in this zone.");

    return {
        observed_office_count: distinct(officeKeys),
        observed_organizations: distinct([...offices, ...openings].map(entity)),
        offices_with_local_headcount_evidence: headcountContributors,
        opening_count: openings.length,
        salary_idr: salary,
        estimated_employment: employment,
    };
}

function housingFields(evidence: Partial<Record<EvidenceType, StoredEvidence[]>>, limitations: string[]) {
    const listings = scopeEvidenceTypes.housing.flatMap((type) => evidence[type] ?? []).filter((row) => row.locality_tier === "zone");
    const rents = listings.map((row) => isRecord(row.value) ? number(row.value.monthly_rent_idr) : null)
        .filter((value): value is number => value !== null)
        .map((value) => ({ minimum: value, maximum: value }));
    const rent = range(rents, "observed");
    if (rent.status === "unavailable") limitations.push("No monthly rent was observed in this zone.");
    return { housing_count: listings.length, monthly_rent_idr: rent };
}

// Builds the aggregate-only public snapshot for one scope, or null when there
// is no accepted evidence at all (the previous snapshot is then kept).
export function buildSnapshot(input: {
    scope: EnrichmentScope;
    cityName: string;
    evidence: Partial<Record<EvidenceType, StoredEvidence[]>>;
    minimums: Partial<Record<EvidenceType, number>>;
    now: Date;
}): SnapshotDraft | null {
    const types = scopeEvidenceTypes[input.scope];
    const rows = types.flatMap((type) => input.evidence[type] ?? []);
    if (!rows.length) return null;

    const zoneRows = rows.filter((row) => row.locality_tier === "zone");
    const nearby = rows.length - zoneRows.length;
    const limitations = ["Counts describe observed web sources, not every company, vacancy, or listing in the area."];
    if (nearby > 0) {
        limitations.push(`${approxCount(nearby, "more observation", "more observations")} found elsewhere in or beyond ${input.cityName} ${nearby === 1 ? "is" : "are"} not counted for this zone.`);
    }

    const fields = input.scope === "career" ? careerFields(input.evidence, limitations) : housingFields(input.evidence, limitations);
    const complete = types.every((type) => (input.evidence[type]?.length ?? 0) >= (input.minimums[type] ?? Infinity));
    const coverage: Coverage = complete ? "complete" : "partial";
    const confidences = rows.map((row) => Number(row.confidence)).filter((value) => Number.isFinite(value));
    const confidence = confidences.length ? Math.round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length * 10_000) / 10_000 : null;
    const retrieved = rows.map((row) => row.retrieved_at).filter((value): value is string => !!value).sort();
    const zoneRetrieved = zoneRows.map((row) => row.retrieved_at).filter((value): value is string => !!value).sort();

    const snapshot: Record<string, unknown> = {
        ...fields,
        sources_monitored: distinct(rows.map((row) => host(row.canonical_url))),
        coverage,
        ...(confidence === null ? {} : { confidence }),
        ...(retrieved.length ? { as_of: dateOnly(retrieved[retrieved.length - 1]) } : {}),
        ...(zoneRetrieved.length ? { oldest_material_evidence: dateOnly(zoneRetrieved[0]) } : {}),
        limitations,
    };
    if (!isPublicSnapshot(snapshot)) throw new Error("Snapshot violates the public contract");

    // The snapshot refreshes and expires with its earliest evidence, never before it is generated.
    const generatedAt = input.now.toISOString();
    const earliest = (values: (string | null)[]) => values.filter((value): value is string => !!value)
        .reduce((min, value) => Date.parse(value) < Date.parse(min) ? value : min, "9999-12-31T00:00:00.000Z");
    const later = (value: string) => Date.parse(value) > input.now.getTime() ? new Date(value).toISOString() : generatedAt;
    const expiresAt = later(earliest(rows.map((row) => row.expires_at)));
    const refreshAfter = later(earliest(rows.map((row) => row.refresh_after)));

    return {
        snapshot,
        evidenceCount: Math.min(rows.length, 32_767),
        contributorCount: Math.min(distinct(zoneRows.map(entity)), 32_767),
        coverage,
        confidence,
        generatedAt,
        refreshAfter: Date.parse(refreshAfter) <= Date.parse(expiresAt) ? refreshAfter : expiresAt,
        expiresAt,
    };
}
