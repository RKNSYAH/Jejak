import type { RegionFact } from "../types";
import { isRecord } from "../lib/zoneGeometry";
import { evidenceScope, type EvidenceType } from "./scopes";

// Server cache input only. Public output contains aggregates, never these rows.
export type CachedFactRow = {
    region_id: number;
    evidence_type: string;
    scope_hash: string;
    dedup_hash: string;
    value: unknown;
    locality_tier: string | null;
    validation_status: string;
    is_sample: boolean;
    retrieved_at: string | null;
    refresh_after: string | null;
    expires_at: string;
};

// Offices use the existing boundary-binned cluster RPC, not a run's region_id.
export const cachedFactTypes: EvidenceType[] = ["active_opening", "kos_listing", "apartment_listing", "house_listing"];

function provenance(rows: CachedFactRow[], source: string, now: number): Omit<RegionFact, "metric" | "value" | "unit"> {
    return {
        source, source_url: null, period_start: null, period_end: null,
        retrieved_at: rows.map((row) => row.retrieved_at).filter((date): date is string => !!date).sort().at(-1) ?? null,
        freshness: rows.some((row) => row.refresh_after !== null && Date.parse(row.refresh_after) <= now) ? "stale" : "fresh",
        geographic_level: "zone", sample_size: rows.length, evidence_type: "derived", is_sample: false,
        limitations: "Observed sources in this district only; not a complete or representative area total. Observation periods are unavailable; retrieval dates describe cache age only.",
    };
}

function factKey(fact: RegionFact): string {
    if (fact.metric.split(":")[0] === "median_monthly_rent_idr") {
        return `median_monthly_rent_idr:${fact.dimension_value ?? fact.metric.split(":")[1] ?? "kos"}`;
    }
    return fact.metric;
}

// Only comparable, supported fields override static facts. All other facts survive.
export function mergeCachedFacts(facts: RegionFact[], rows: CachedFactRow[], sectorId: string, now = Date.now()): RegionFact[] {
    const groups = new Map<string, CachedFactRow[]>();
    const seen = new Set<string>();
    for (const row of rows) {
        const type = row.evidence_type as EvidenceType;
        if (!cachedFactTypes.includes(type) || row.scope_hash !== evidenceScope(type, sectorId).scopeHash ||
            row.validation_status !== "accepted" || row.is_sample || row.locality_tier !== "zone" ||
            !(Date.parse(row.expires_at) > now)) continue;
        const key = `${type}:${row.dedup_hash}`;
        if (seen.has(key)) continue;
        seen.add(key);
        groups.set(type, [...groups.get(type) ?? [], row]);
    }

    const overrides: RegionFact[] = [];
    const openings = groups.get("active_opening") ?? [];
    if (openings.length) overrides.push({
        ...provenance(openings, "Job boards monitored by Jejak", now),
        metric: "opening_count", value: openings.length, unit: "openings", approximate: true, sector_ids: [sectorId],
    });

    for (const type of ["kos", "apartment", "house"] as const) {
        const listings = (groups.get(`${type}_listing`) ?? []).filter((row) => isRecord(row.value) &&
            typeof row.value.monthly_rent_idr === "number" && Number.isInteger(row.value.monthly_rent_idr) &&
            row.value.monthly_rent_idr >= 100_000 && row.value.monthly_rent_idr <= 100_000_000);
        if (!listings.length) continue;
        const prices = listings.map((row) => (row.value as { monthly_rent_idr: number }).monthly_rent_idr).sort((a, b) => a - b);
        const middle = Math.floor(prices.length / 2);
        overrides.push({
            ...provenance(listings, "Housing listings monitored by Jejak", now),
            metric: type === "kos" ? "median_monthly_rent_idr" : `median_monthly_rent_idr:${type}`,
            value: prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2,
            unit: "IDR", dimension_key: "housing_type", dimension_value: type,
        });
    }
    if (!overrides.length) return facts;
    const replaced = new Set(overrides.map(factKey));
    return [...facts.filter((fact) => !replaced.has(factKey(fact))), ...overrides];
}
