import { isPublicSnapshot } from "../enrichment/snapshotContract";
import type { EvidenceClustersResponse, EvidenceScope, ZoneEvidenceResponse } from "../types";
import { getJson } from "./zoneApi";
import { isRecord } from "./zoneGeometry";

const freshness = ["fresh", "stale", "missing"];
const refreshStatuses = ["running", "queued", "cooldown", "idle"];
const coverages = ["complete", "partial", "unavailable"];

function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

function isRun(value: unknown): boolean {
    return isRecord(value) && typeof value.run_id === "string" && typeof value.evidence_type === "string" &&
        typeof value.status === "string" && isNullableString(value.stage) && typeof value.requested_at === "string" &&
        isNullableString(value.completed_at) && isNullableString(value.retry_at) &&
        (value.accepted === null || typeof value.accepted === "number") && Array.isArray(value.incomplete_categories) &&
        typeof value.snapshot_published === "boolean" && isNullableString(value.error_code);
}

// Public enrichment evidence for one zone: the aggregate snapshot (counts and ranges
// inside the zone, never company names) and the state of its refresh runs. Poll while
// refresh.status is "queued" or "running"; a new snapshot appears when a run publishes one.
export async function getZoneEvidence(zoneId: string, scope: EvidenceScope, signal: AbortSignal): Promise<ZoneEvidenceResponse> {
    const data = await getJson(`/api/zones/${encodeURIComponent(zoneId)}/evidence?${new URLSearchParams({ scope })}`, signal);
    if (!isRecord(data) || data.zone_id !== zoneId || data.scope !== scope || !freshness.includes(String(data.freshness)) ||
        !isRecord(data.refresh) || !refreshStatuses.includes(String(data.refresh.status)) ||
        !isNullableString(data.refresh.stage) || !isNullableString(data.refresh.retry_at) ||
        !Array.isArray(data.refresh.runs) || !data.refresh.runs.every(isRun)) {
        throw new Error("Invalid evidence response");
    }
    const snapshot = data.snapshot;
    if (snapshot !== null && (!isRecord(snapshot) || !isRecord(snapshot.data) || !isPublicSnapshot(snapshot.data) ||
        !coverages.includes(String(snapshot.coverage)) || (snapshot.confidence !== null && typeof snapshot.confidence !== "number") ||
        typeof snapshot.evidence_count !== "number" || typeof snapshot.generated_at !== "string" ||
        typeof snapshot.is_stale !== "boolean" || typeof snapshot.is_expired !== "boolean")) {
        throw new Error("Invalid evidence snapshot");
    }
    return data as ZoneEvidenceResponse;
}

function isCluster(value: unknown): boolean {
    return isRecord(value) && typeof value.zone_id === "string" && typeof value.zone_name === "string" &&
        Array.isArray(value.centroid) && value.centroid.length === 2 &&
        Math.abs(Number(value.centroid[0])) <= 180 && Math.abs(Number(value.centroid[1])) <= 90 &&
        isRecord(value.counts) && Object.values(value.counts).every((entry) => isRecord(entry) &&
            typeof entry.count === "number" && typeof entry.organizations === "number") &&
        Array.isArray(value.labels) && value.labels.every((label) => typeof label === "string") &&
        isNullableString(value.latest_retrieved_at);
}

// Accepted evidence under a city, as approximate counts per district (for map
// clusters). Show the labels ("approx. 3 openings") rather than bare numbers.
export async function getEvidenceClusters(cityId: string, scope: EvidenceScope, signal: AbortSignal): Promise<EvidenceClustersResponse> {
    const data = await getJson(`/api/evidence/clusters?${new URLSearchParams({ city_id: cityId, scope })}`, signal);
    if (!isRecord(data) || data.city_id !== cityId || data.scope !== scope || typeof data.note !== "string" ||
        !Array.isArray(data.clusters) || !data.clusters.every(isCluster)) {
        throw new Error("Invalid evidence clusters response");
    }
    return data as EvidenceClustersResponse;
}
