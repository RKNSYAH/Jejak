import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type Zone = {
    zone_id: string;
    zone_name: string;
    city_id: string;
    city_name: string;
};

export type ZoneGeometry = FeatureCollection<Polygon | MultiPolygon, {
    zone_id: string;
    zone_name: string;
    source_region_code?: string;
}>;

export type ZoneSummary = Zone & {
    is_sample: boolean;
    average_monthly_wage_idr: number | null;
    median_monthly_rent_idr: number | null;
    population: number | null;
    wage_to_rent_ratio: number | null;
};

export type ZoneListResponse = {
    is_sample: boolean;
    zones: ZoneSummary[];
};

export type RegionFact = {
    metric: string;
    value: number;
    unit: string | null;
    source: string;
    source_url?: string | null;
    period_start?: string | null;
    period_end: string | null;
    confidence?: number | null;
    evidence_type: "observed" | "estimated" | "derived" | "unavailable";
    limitations: string | null;
    is_sample: boolean;
    // Sheet dimensions that distinguish KBLI and housing-type observations.
    dimension_key?: "kbli_2020_code" | "housing_type" | null;
    dimension_value?: string | null;
    // Counted from monitored web sources: show as "sekitar N", never as an exact total.
    approximate?: boolean;
    // Cache provenance is retrieval time, never a fabricated observation period.
    retrieved_at?: string | null;
    freshness?: "fresh" | "stale";
    geographic_level?: "zone";
    sample_size?: number;
    // Confirmed sector scope or the database's KBLI mapping; not an occupation match.
    sector_ids?: string[];
};

export type RegionPlace = {
    id: number;
    name: string;
    category: string;
    latitude: number;
    longitude: number;
    source: string;
    source_url?: string | null;
    observed_at: string | null;
    is_sample: boolean;
    address?: string | null;
    website?: string | null;
    phone?: string | null;
    operator?: string | null;
    osm_type?: "node" | "way" | "relation" | null;
    osm_id?: number | null;
    osm_tags?: Record<string, string>;
};

export type ZoneDetailResult = {
    is_sample: boolean;
    facts: RegionFact[];
    places: RegionPlace[];
};

export type MapCategory = "summary" | "employment" | "education" | "housing" | "mobility";

type MapCellFact = {
    value: number;
    unit: string | null;
    evidence_type: RegionFact["evidence_type"];
    period_end: string | null;
    source: string;
    // Buildings or listings behind the value; the database hides values backed by fewer than 3.
    sample_size: number | null;
    limitations: string | null;
    is_sample: boolean;
};

// One H3 cell of a district, with the facts requested for a map category.
export type MapCell = {
    cell_code: string;
    parent_code: string;
    // Point-only heatmaps omit the polygon; filled cells still require it.
    geometry: Polygon | MultiPolygon | null;
    centroid: [number, number];
    facts: Record<string, MapCellFact>;
    is_sample: boolean;
};

export type MapCellsResponse = {
    is_sample: boolean;
    zone_id: string;
    category: MapCategory;
    cells: MapCell[];
};

export type MissingEvidence =
    | "company_presence" | "active_openings" | "salary" | "headcount"
    | "news" | "kos" | "apartment" | "house" | "housing";

export interface ZoneEvidenceDiscoveryInput {
    run_id: string;
    zone_id: string;
    requested_at: string;

    zone_name: string;
    city_name: string;

    missing_evidence: MissingEvidence[];
    target_sectors?: string[];

    maximum_sources: number;

    search_query?: string;
    bounding_box?: [number, number, number, number];
    target_occupations?: string[];
    existing_entity_ids?: string[];
    // Companies whose office address discovery should look up (postings that name no location).
    company_names?: string[];
}

export type EvidenceScope = "career" | "housing";
export type Coverage = "complete" | "partial" | "unavailable";

// A range in a public evidence snapshot; unavailable when the evidence can't support one.
export type EvidenceRange =
    | { minimum: number; maximum: number; status: "observed" | "estimated"; method_version?: string }
    | { status: "unavailable" };

// Aggregate-only snapshot (counts and ranges, never company names), as enforced by
// private.is_public_snapshot() in Postgres. Counts are for evidence inside the zone.
export type EvidenceSnapshotData = {
    observed_office_count?: number;
    observed_organizations?: number;
    offices_with_local_headcount_evidence?: number;
    organizations_without_headcount?: number;
    opening_count?: number;
    housing_count?: number;
    sources_monitored?: number;
    estimated_employment?: EvidenceRange;
    monthly_rent_idr?: EvidenceRange;
    salary_idr?: EvidenceRange;
    as_of?: string;
    oldest_material_evidence?: string;
    coverage?: Coverage;
    confidence?: number;
    limitations?: string[];
};

export type EnrichmentRunSummary = {
    run_id: string;
    evidence_type: string;
    status: string;
    stage: string | null;
    requested_at: string;
    started_at: string | null;
    completed_at: string | null;
    retry_at: string | null;
    accepted: number | null;
    rejected: Record<string, number> | null;
    incomplete_categories: string[];
    snapshot_published: boolean;
    error_code: string | null;
};

// One district's accepted evidence, as counts only (never names or single points).
// Counts are approximate: they cover monitored sources, not every job or listing.
export type EvidenceCluster = {
    zone_id: string;
    zone_name: string;
    centroid: [number, number];
    counts: Record<string, { count: number; organizations: number }>;
    // Display text per evidence type, e.g. "sekitar 3 kantor", "sekitar 1 lowongan".
    labels: string[];
    latest_retrieved_at: string | null;
};

// GET /api/evidence/clusters?city_id=&scope=
export type EvidenceClustersResponse = {
    city_id: string;
    scope: EvidenceScope;
    clusters: EvidenceCluster[];
};

// GET /api/zones/[zoneId]/evidence?scope=
export type ZoneEvidenceResponse = {
    zone_id: string;
    scope: EvidenceScope;
    freshness: "fresh" | "stale" | "missing";
    snapshot: {
        data: EvidenceSnapshotData;
        coverage: Coverage;
        confidence: number | null;
        evidence_count: number;
        generated_at: string;
        refresh_after: string | null;
        expires_at: string | null;
        is_stale: boolean;
        is_expired: boolean;
    } | null;
    refresh: {
        status: "running" | "queued" | "cooldown" | "idle";
        stage: string | null;
        retry_at: string | null;
        runs: EnrichmentRunSummary[];
    };
};

export type HciClick = {
    elapsed_ms: number;
    region: string;
    target: string;
    x: number | null;
    y: number | null;
    viewport_width: number;
    viewport_height: number;
    paint_ms: number;
    // Click-specific work through its result frame; null if cancelled or timed out.
    response_ms: number | null;
};

export type HciClickBatch = {
    session_id: string;
    participant: string | null;
    clicks: HciClick[];
};
