import type { EvidenceCluster, RegionFact } from "../types";
import { approxEvidenceLabel } from "./labels";

// Rows from public.get_evidence_clusters(): one per (district, evidence type).
export type ClusterRow = {
    region_code: string;
    region_name: string;
    centroid: { type: "Point"; coordinates: [number, number] } | null;
    evidence_type: string;
    evidence_count: number;
    organization_count: number;
    latest_retrieved_at: string | null;
};

// One cluster per district, with a count and an approximate label per evidence type.
export function toEvidenceClusters(rows: ClusterRow[], typeOrder: string[]): EvidenceCluster[] {
    const clusters = new Map<string, EvidenceCluster>();
    for (const row of rows) {
        const coordinates = row.centroid?.coordinates;
        if (!coordinates || coordinates.length !== 2 || !coordinates.every((value) => Number.isFinite(Number(value)))) continue;
        const cluster = clusters.get(row.region_code) ?? {
            zone_id: row.region_code,
            zone_name: row.region_name,
            centroid: [Number(coordinates[0]), Number(coordinates[1])],
            counts: {},
            labels: [],
            latest_retrieved_at: null,
        };
        cluster.counts[row.evidence_type] = { count: Number(row.evidence_count), organizations: Number(row.organization_count) };
        if (row.latest_retrieved_at && (!cluster.latest_retrieved_at || row.latest_retrieved_at > cluster.latest_retrieved_at)) {
            cluster.latest_retrieved_at = row.latest_retrieved_at;
        }
        clusters.set(row.region_code, cluster);
    }
    for (const cluster of clusters.values()) {
        cluster.labels = typeOrder.filter((type) => cluster.counts[type])
            .map((type) => approxEvidenceLabel(type, cluster.counts[type].count));
    }
    return [...clusters.values()];
}

// Evidence located in a district is the evidence for its regular facts, not a
// separate metric: companies with an observed office there become its
// company_count. Without located offices the stored fact stays as it is.
export function mergeLocatedEvidence(facts: RegionFact[], cluster: EvidenceCluster | undefined): RegionFact[] {
    const offices = cluster?.counts.office_presence;
    if (!cluster || !offices || offices.organizations <= 0) return facts;
    const companies: RegionFact = {
        metric: "company_count",
        value: offices.organizations,
        unit: "companies",
        source: "Company websites and job boards monitored by Jejak",
        source_url: null,
        period_start: null,
        period_end: cluster.latest_retrieved_at?.slice(0, 10) ?? null,
        confidence: null,
        evidence_type: "observed",
        limitations: "Approximate: software and IT companies with an office found in this district on monitored sources, not every company here.",
        is_sample: false,
        approximate: true,
    };
    return [...facts.filter((fact) => fact.metric !== "company_count"), companies];
}
