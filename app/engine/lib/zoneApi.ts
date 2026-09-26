import type { ZoneDetailResult, ZoneGeometry, ZoneListResponse } from "../types";
import { isBoundary, isRecord } from "./zoneGeometry";

function isNullableNumber(value: unknown): value is number | null {
    return value === null || (typeof value === "number" && Number.isFinite(value));
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(20000);
    let res: Response;
    try {
        res = await fetch(url, { signal: AbortSignal.any([signal, timeout]) });
    } catch (error) {
        if (signal.aborted) throw error;
        if (timeout.aborted || (error instanceof Error && error.name === "TimeoutError")) throw new Error("Zone request timed out. Please retry.");
        throw new Error("Unable to connect to the zone service. Please retry.");
    }
    const data: unknown = await res.json().catch((error: unknown) => {
        if (signal.aborted) throw error;
        if (timeout.aborted) throw new Error("Zone request timed out. Please retry.");
        return null;
    });
    if (!res.ok) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : `Unable to load zone data (HTTP ${res.status})`);
    }
    if (data === null) throw new Error("Invalid response from the zone service");
    return data;
}

export async function getZones(signal: AbortSignal): Promise<ZoneListResponse> {
    const data = await getJson("/api/zones?sector_id=software_and_it_services", signal);
    if (!isRecord(data) || typeof data.is_sample !== "boolean" || !Array.isArray(data.zones)) throw new Error("Invalid zone list");
    const zones = data.zones.map((zone) => {
        if (!isRecord(zone) || typeof zone.zone_id !== "string" || typeof zone.zone_name !== "string" ||
            typeof zone.city_id !== "string" || typeof zone.city_name !== "string" ||
            typeof zone.is_sample !== "boolean" ||
            !isNullableNumber(zone.average_monthly_wage_idr) || !isNullableNumber(zone.median_monthly_rent_idr) ||
            !isNullableNumber(zone.population) || !isNullableNumber(zone.wage_to_rent_ratio)) throw new Error("Invalid zone summary");
        return {
            zone_id: zone.zone_id, zone_name: zone.zone_name, city_id: zone.city_id, city_name: zone.city_name,
            is_sample: zone.is_sample, average_monthly_wage_idr: zone.average_monthly_wage_idr,
            median_monthly_rent_idr: zone.median_monthly_rent_idr, population: zone.population,
            wage_to_rent_ratio: zone.wage_to_rent_ratio,
        };
    });
    return { is_sample: data.is_sample, zones };
}

function parseGeometry(data: unknown, zoneId: string): ZoneGeometry {
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

function parseDetails(data: unknown): ZoneDetailResult {
    if (!isRecord(data) || typeof data.is_sample !== "boolean" || !Array.isArray(data.facts) || !Array.isArray(data.places) ||
        !data.facts.every((fact) => isRecord(fact) && typeof fact.metric === "string" &&
            typeof fact.value === "number" && Number.isFinite(fact.value) && typeof fact.source === "string" &&
            (fact.unit === null || typeof fact.unit === "string") &&
            (fact.source_url == null || typeof fact.source_url === "string") &&
            (fact.period_start == null || typeof fact.period_start === "string") &&
            (fact.period_end === null || typeof fact.period_end === "string") &&
            (fact.confidence == null || (typeof fact.confidence === "number" && fact.confidence >= 0 && fact.confidence <= 1)) &&
            ["observed", "estimated", "derived", "unavailable"].includes(String(fact.evidence_type)) &&
            (fact.limitations === null || typeof fact.limitations === "string") && typeof fact.is_sample === "boolean") ||
        !data.places.every((place) => isRecord(place) && typeof place.id === "number" &&
            typeof place.name === "string" && typeof place.category === "string" &&
            typeof place.latitude === "number" && Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 &&
            typeof place.longitude === "number" && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180 &&
            typeof place.source === "string" && typeof place.is_sample === "boolean")) {
        throw new Error("Invalid region data");
    }
    return data as ZoneDetailResult;
}

export async function getZoneGeometry(zoneId: string, signal: AbortSignal): Promise<ZoneGeometry> {
    return parseGeometry(await getJson(`/api/geometry?zone_id=${encodeURIComponent(zoneId)}`, signal), zoneId);
}

export async function getZoneIntelligence(zoneId: string, signal: AbortSignal): Promise<ZoneDetailResult> {
    return parseDetails(await getJson(`/api/zones/${encodeURIComponent(zoneId)}/intelligence?sector_id=software_and_it_services`, signal));
}

export async function getZoneMapData(zoneId: string, signal: AbortSignal): Promise<{
    geometry: ZoneGeometry | null;
    details: ZoneDetailResult;
    geometryError: string | null;
}> {
    const data = await getJson(`/api/zones/${encodeURIComponent(zoneId)}/intelligence?sector_id=software_and_it_services&include_geometry=1`, signal);
    if (!isRecord(data) || !("geometry" in data) || (data.geometry_error !== null && typeof data.geometry_error !== "string")) {
        throw new Error("Invalid region map response");
    }
    const details = parseDetails(data.details);
    if (data.geometry === null) return { details, geometry: null, geometryError: data.geometry_error as string | null };
    try {
        return { details, geometry: parseGeometry(data.geometry, zoneId), geometryError: data.geometry_error as string | null };
    } catch (error) {
        return { details, geometry: null, geometryError: error instanceof Error ? error.message : "Invalid zone boundary" };
    }
}
