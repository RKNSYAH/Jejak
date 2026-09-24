import type { ZoneGeometry, ZoneIntelligenceResponse, ZoneIntelligenceResult, ZoneListResponse } from "../types";
import { isBoundary, isRecord } from "./zoneGeometry";

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
    const res = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]) });
    const data: unknown = await res.json();
    if (!res.ok) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : "Unable to load zone data");
    }
    return data;
}

function isCount(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isScore(value: unknown, max = 100): value is number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function isDate(value: unknown): value is string {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isIntelligence(value: unknown): value is ZoneIntelligenceResponse {
    if (!isRecord(value) || !isRecord(value.snapshot) || !isRecord(value.refresh)) return false;
    const { snapshot, refresh } = value;
    const { indices, evidence, local_headcount: headcount } = snapshot;
    return typeof snapshot.zone_id === "string" && typeof snapshot.sector_id === "string" &&
        isDate(snapshot.snapshot_at) && isCount(snapshot.observed_organizations) &&
        isCount(snapshot.verified_offices) && isCount(snapshot.active_openings) &&
        isRecord(indices) && isScore(indices.sector_presence) && isScore(indices.hiring_activity) && isScore(indices.employer_diversity) &&
        isRecord(evidence) && isScore(evidence.confidence, 1) && isCount(evidence.sources_monitored) &&
        isCount(evidence.organizations_without_headcount) && isDate(evidence.oldest_material_evidence) &&
        ["high", "medium", "low", "insufficient"].includes(String(evidence.confidence_label)) &&
        ["fresh", "stale"].includes(String(value.freshness)) && ["complete", "partial"].includes(String(value.coverage)) &&
        ["unavailable", "queued", "running", "partial", "completed", "failed"].includes(String(refresh.status)) &&
        (refresh.run_id === null || typeof refresh.run_id === "string") &&
        (headcount === undefined || (isRecord(headcount) && isCount(headcount.minimum) && isCount(headcount.maximum) &&
            headcount.maximum >= headcount.minimum && headcount.status === "estimated" && typeof headcount.method_version === "string"));
}

export async function getZones(signal: AbortSignal): Promise<ZoneListResponse> {
    const data = await getJson("/api/zones?city_id=jakarta-selatan&sector_id=software_and_it_services", signal);
    if (!isRecord(data) || typeof data.is_sample !== "boolean" || !Array.isArray(data.zones)) throw new Error("Invalid zone list");
    const zones = data.zones.map((zone) => {
        if (!isRecord(zone) || typeof zone.zone_id !== "string" || typeof zone.zone_name !== "string" ||
            typeof zone.city_id !== "string" || typeof zone.city_name !== "string" ||
            (zone.intelligence !== null && !isIntelligence(zone.intelligence))) throw new Error("Invalid zone summary");
        if (zone.intelligence && zone.intelligence.snapshot.zone_id !== zone.zone_id) throw new Error("Mismatched zone summary");
        return { zone_id: zone.zone_id, zone_name: zone.zone_name, city_id: zone.city_id, city_name: zone.city_name, intelligence: zone.intelligence };
    });
    return { is_sample: data.is_sample, zones };
}

export async function getZoneGeometry(zoneId: string, signal: AbortSignal): Promise<ZoneGeometry> {
    const data = await getJson(`/api/geometry?zone_id=${encodeURIComponent(zoneId)}`, signal);
    if (!isRecord(data) || data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Invalid geometry response");
    const features = data.features.map((feature) => {
        if (!isRecord(feature) || feature.type !== "Feature" || !isBoundary(feature.geometry) || !isRecord(feature.properties) ||
            feature.properties.zone_id !== zoneId || typeof feature.properties.zone_name !== "string") throw new Error("Invalid zone boundary");
        return {
            type: "Feature" as const,
            id: typeof feature.id === "string" || typeof feature.id === "number" ? feature.id : undefined,
            geometry: feature.geometry,
            properties: {
                zone_id: zoneId,
                zone_name: feature.properties.zone_name,
                source_region_code: typeof feature.properties.source_region_code === "string" ? feature.properties.source_region_code : undefined,
            },
        };
    });
    return { type: "FeatureCollection", features };
}

export async function getZoneIntelligence(zoneId: string, signal: AbortSignal): Promise<ZoneIntelligenceResult> {
    const data = await getJson(`/api/zones/${encodeURIComponent(zoneId)}/intelligence?sector_id=software_and_it_services`, signal);
    if (!isRecord(data) || typeof data.is_sample !== "boolean" ||
        (data.intelligence !== null && !isIntelligence(data.intelligence))) throw new Error("Invalid zone intelligence");
    if (data.intelligence && (data.intelligence.snapshot.zone_id !== zoneId || data.intelligence.snapshot.sector_id !== "software_and_it_services")) {
        throw new Error("Intelligence does not match the selected zone and sector");
    }
    return { is_sample: data.is_sample, intelligence: data.intelligence };
}
