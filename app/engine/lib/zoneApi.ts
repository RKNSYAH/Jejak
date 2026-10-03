import type { MapCategory, MapCellsResponse, ZoneDetailResult, ZoneGeometry, ZoneListResponse } from "../types";
import { isBoundary, isCentroid, isRecord } from "./zoneGeometry";
import { handleAuthFailure } from "./authRedirect";
import { ZONE_BOUNDARY_REQUEST_TIMEOUT_MS, ZONE_REQUEST_TIMEOUT_MS } from "./zoneRequestTimeouts";

export const evidenceTypes = ["observed", "estimated", "derived", "unavailable"];

function isNullableNumber(value: unknown): value is number | null {
    return value === null || (typeof value === "number" && Number.isFinite(value));
}

export function isNullableString(value: unknown): value is string | null {
    return value === null || typeof value === "string";
}

export async function getJson(url: string, signal: AbortSignal, timeoutMs = ZONE_REQUEST_TIMEOUT_MS): Promise<unknown> {
    const timeout = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
        res = await fetch(url, { signal: AbortSignal.any([signal, timeout]) });
    } catch (error) {
        if (signal.aborted) throw error;
        if (timeout.aborted || (error instanceof Error && error.name === "TimeoutError")) throw new Error("Permintaan data habis waktu. Coba lagi.");
        throw new Error("Tidak dapat terhubung ke layanan data. Coba lagi.");
    }
    handleAuthFailure(res);
    const data: unknown = await res.json().catch((error: unknown) => {
        if (signal.aborted) throw error;
        if (timeout.aborted) throw new Error("Permintaan data habis waktu. Coba lagi.");
        return null;
    });
    if (!res.ok) {
        throw new Error(isRecord(data) && typeof data.error === "string" ? data.error : `Data kecamatan gagal dimuat (HTTP ${res.status}).`);
    }
    if (data === null) throw new Error("Respons layanan data tidak valid.");
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

function isCellFact(fact: unknown): boolean {
    return isRecord(fact) && typeof fact.value === "number" && Number.isFinite(fact.value) &&
        isNullableString(fact.unit) && evidenceTypes.includes(String(fact.evidence_type)) &&
        isNullableString(fact.period_end) && typeof fact.source === "string" &&
        (fact.sample_size === null || (typeof fact.sample_size === "number" && Number.isInteger(fact.sample_size) && fact.sample_size >= 0)) &&
        isNullableString(fact.limitations) && typeof fact.is_sample === "boolean";
}

export async function getMapCells(zoneId: string, category: MapCategory, signal: AbortSignal, includeGeometry = true): Promise<MapCellsResponse> {
    const data = await getJson(`/api/heatmap?${new URLSearchParams({ zone_id: zoneId, category, geometry: includeGeometry ? "1" : "0" })}`, signal);
    if (!isRecord(data) || typeof data.is_sample !== "boolean" || data.zone_id !== zoneId || data.category !== category ||
        !Array.isArray(data.cells) ||
        !data.cells.every((cell) => isRecord(cell) && typeof cell.cell_code === "string" && cell.parent_code === zoneId &&
            (includeGeometry ? isBoundary(cell.geometry) : cell.geometry === null) &&
            isCentroid(cell.centroid) && isRecord(cell.facts) && Object.values(cell.facts).every(isCellFact) &&
            typeof cell.is_sample === "boolean")) throw new Error("Invalid heatmap data");
    return data as MapCellsResponse;
}

function parseGeometry(data: unknown, zoneId: string): ZoneGeometry {
    if (!isRecord(data) || data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Invalid geometry response");
    if (data.features.length === 0) throw new Error("Batas kecamatan tidak ditemukan. Coba lagi.");
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
            isNullableString(fact.unit) &&
            (fact.source_url == null || typeof fact.source_url === "string") &&
            (fact.period_start == null || typeof fact.period_start === "string") &&
            isNullableString(fact.period_end) &&
            (fact.confidence == null || (typeof fact.confidence === "number" && fact.confidence >= 0 && fact.confidence <= 1)) &&
            evidenceTypes.includes(String(fact.evidence_type)) &&
            isNullableString(fact.limitations) && typeof fact.is_sample === "boolean" &&
            (fact.dimension_key === undefined || fact.dimension_key === null ||
                fact.dimension_key === "kbli_2020_code" || fact.dimension_key === "housing_type") &&
            (fact.dimension_value === undefined || fact.dimension_value === null || typeof fact.dimension_value === "string") &&
            ((fact.dimension_key == null && fact.dimension_value == null) ||
                (typeof fact.dimension_key === "string" && typeof fact.dimension_value === "string")) &&
            (fact.approximate === undefined || typeof fact.approximate === "boolean")) ||
        !data.places.every((place) => isRecord(place) && typeof place.id === "number" &&
            typeof place.name === "string" && typeof place.category === "string" &&
            typeof place.latitude === "number" && Number.isFinite(place.latitude) && Math.abs(place.latitude) <= 90 &&
            typeof place.longitude === "number" && Number.isFinite(place.longitude) && Math.abs(place.longitude) <= 180 &&
            typeof place.source === "string" && typeof place.is_sample === "boolean" &&
            (place.source_url == null || typeof place.source_url === "string") &&
            (place.address == null || typeof place.address === "string") &&
            (place.website == null || typeof place.website === "string") &&
            (place.phone == null || typeof place.phone === "string") &&
            (place.operator == null || typeof place.operator === "string") &&
            ((place.osm_type == null && place.osm_id == null) ||
                (["node", "way", "relation"].includes(String(place.osm_type)) &&
                 typeof place.osm_id === "number" && Number.isSafeInteger(place.osm_id) && place.osm_id > 0)) &&
            (place.osm_tags === undefined || isRecord(place.osm_tags)))) {
        throw new Error("Invalid region data");
    }
    return data as ZoneDetailResult;
}

export async function getZoneMapData(zoneId: string, signal: AbortSignal): Promise<{
    geometry: ZoneGeometry | null;
    details: ZoneDetailResult;
    geometryError: string | null;
}> {
    const data = await getJson(`/api/zones/${encodeURIComponent(zoneId)}/intelligence?sector_id=software_and_it_services&include_geometry=1`, signal, ZONE_BOUNDARY_REQUEST_TIMEOUT_MS);
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
