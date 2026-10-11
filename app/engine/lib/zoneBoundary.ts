import { toZone, type RegionDetailRow } from "../controller/zoneController";
import type { Zone, ZoneGeometry } from "../types";
import { cityKey, districtKey, isBoundary, isRecord, normalizeGeometry } from "./zoneGeometry";
import { BOUNDARY_PROVIDER_TIMEOUT_MS } from "./zoneRequestTimeouts";
import type { MultiPolygon } from "geojson";
import { createAdminClient, isAdminConfigured } from "./admin";

const boundaryUrl = "https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query";
const cacheLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const maxCachedBoundaries = 256;
// Cache validated polygons only, not BIG's HTTP-200 error/empty responses.
// This bounded cache is local to each server process; stored geometry stays first.
const boundaries = new Map<string, {
    geometry: ZoneGeometry;
    expiresAt: number;
    persisted: boolean;
}>();
const pendingBoundaries = new Map<string, Promise<ZoneGeometry>>();
const pendingCityBoundaries = new Map<string, Promise<unknown>>();

function boundaryCacheKey(row: RegionDetailRow): string {
    const zone = toZone(row);
    return JSON.stringify([zone.zone_id, zone.zone_name, zone.city_id, zone.city_name]);
}

function getCachedBoundary(key: string) {
    const cached = boundaries.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached;
    boundaries.delete(key);
}

function cacheBoundary(key: string, geometry: ZoneGeometry, persisted: boolean, expiresAt = Date.now() + cacheLifetimeMs) {
    if (!boundaries.has(key) && boundaries.size >= maxCachedBoundaries) {
        const oldest = boundaries.keys().next().value;
        if (oldest !== undefined) boundaries.delete(oldest);
    }
    boundaries.set(key, { geometry, expiresAt, persisted });
}

async function mapInBatches<T, Result>(items: T[], size: number, map: (item: T) => Promise<Result>): Promise<Result[]> {
    const results: Result[] = [];
    for (let index = 0; index < items.length; index += size) {
        results.push(...await Promise.all(items.slice(index, index + size).map(map)));
    }
    return results;
}

export async function getZoneBoundary(row: RegionDetailRow): Promise<ZoneGeometry> {
    const zone = toZone(row);
    if (row.geometry !== null) {
        if (!isBoundary(row.geometry)) throw new Error("Invalid stored boundary");
        return { type: "FeatureCollection", features: [{
            type: "Feature", id: zone.zone_id, geometry: row.geometry,
            properties: { zone_id: zone.zone_id, zone_name: zone.zone_name, source_region_code: row.region_code },
        }] };
    }

    const key = boundaryCacheKey(row);
    const cached = getCachedBoundary(key);
    if (cached?.persisted) return cached.geometry;

    const pending = pendingBoundaries.get(key);
    if (pending) return pending;

    const request = (async () => {
        const geometry = cached?.geometry ?? await fetchProviderBoundary(zone);
        const persisted = await tryPersistBoundary(row, geometry);
        cacheBoundary(key, geometry, persisted, cached?.expiresAt);
        return geometry;
    })();
    pendingBoundaries.set(key, request);
    try {
        return await request;
    } finally {
        // Failed lookups must be retryable; concurrent selections share one request.
        pendingBoundaries.delete(key);
    }
}

export async function getCityZoneBoundaries(rows: RegionDetailRow[]): Promise<{ geometry: ZoneGeometry; missingZones: string[] }> {
    const stored = rows.filter((row) => row.geometry !== null);
    const missing = rows.filter((row) => row.geometry === null);
    const storedFeatures: ZoneGeometry["features"] = [];
    const storedUnresolved: string[] = [];

    for (const row of stored) {
        try { storedFeatures.push(...(await getZoneBoundary(row)).features); }
        catch (error) {
            console.error("Failed to load stored zone boundary", {
                regionCode: row.region_code, district: row.region_name,
                cityId: row.parent_code, city: row.parent_name, error,
            });
            storedUnresolved.push(row.region_code);
        }
    }

    // Metro previews span several cities; BIG returns one city's kecamatan per request.
    const missingByCity = new Map<string, RegionDetailRow[]>();
    for (const row of missing) missingByCity.set(row.parent_code, [...missingByCity.get(row.parent_code) ?? [], row]);

    const cityResults = await mapInBatches([...missingByCity.values()], 4, async (cityRows) => {
        const city = toZone(cityRows[0]);
        const uncachedRows = cityRows.filter((row) => !getCachedBoundary(boundaryCacheKey(row)));
        const fetchStartedAt = Date.now();
        let response: unknown;
        try {
            if (uncachedRows.length) response = await fetchSharedProviderCityBoundary(city);
        } catch (error) {
            console.error("Failed to fetch onboarding city boundary", {
                cityId: city.city_id, city: city.city_name, districts: uncachedRows.length,
                elapsedMs: Date.now() - fetchStartedAt, error,
            });
        }

        const fetchMs = Date.now() - fetchStartedAt;
        const resolveStartedAt = Date.now();
        const results = await mapInBatches(cityRows, 4, async (row) => {
            const key = boundaryCacheKey(row);
            const cached = getCachedBoundary(key);
            let geometry: ZoneGeometry;
            try {
                if (cached) geometry = cached.geometry;
                else if (response !== undefined) geometry = normalizeGeometry(response, toZone(row));
                else return { features: [], missingZones: [row.region_code], persistenceMs: 0 };
            } catch (error) {
                console.error("Failed to resolve district boundary", {
                    regionCode: row.region_code, district: row.region_name,
                    cityId: row.parent_code, city: row.parent_name, error,
                });
                return { features: [], missingZones: [row.region_code], persistenceMs: 0 };
            }

            const persistStartedAt = Date.now();
            const persisted = cached?.persisted ?? await tryPersistBoundary(row, geometry);
            cacheBoundary(key, geometry, persisted, cached?.expiresAt);
            return {
                features: geometry.features, missingZones: [],
                persistenceMs: cached?.persisted ? 0 : Date.now() - persistStartedAt,
            };
        });

        const result = {
            features: results.flatMap((result) => result.features),
            missingZones: results.flatMap((result) => result.missingZones),
        };
        const resolveMs = Date.now() - resolveStartedAt;
        if (uncachedRows.length || resolveMs >= 250 || result.missingZones.length) {
            console.info("Resolved onboarding city boundaries", {
                cityId: city.city_id, city: city.city_name, districts: cityRows.length,
                fetchMs, resolveMs,
                persistenceMs: results.reduce((total, result) => total + result.persistenceMs, 0),
                returned: result.features.length, missing: result.missingZones.length,
            });
        }
        return result;
    });

    return {
        geometry: { type: "FeatureCollection", features: [...storedFeatures, ...cityResults.flatMap((result) => result.features)] },
        missingZones: [...storedUnresolved, ...cityResults.flatMap((result) => result.missingZones)],
    };
}

async function tryPersistBoundary(row: RegionDetailRow, geometry: ZoneGeometry): Promise<boolean> {
    if (!isAdminConfigured()) return false;
    try {
        await insertZoneBoundary(row, geometry);
        return true;
    } catch (error) {
        console.error("Failed to store zone boundary", {
            regionCode: row.region_code, district: row.region_name,
            cityId: row.parent_code, city: row.parent_name, error,
        });
        return false;
    }
}

async function insertZoneBoundary(row: RegionDetailRow, geometry: ZoneGeometry): Promise<void> {
    const boundary: MultiPolygon = {
        type: "MultiPolygon",
        coordinates: geometry.features.flatMap((feature) => {
            // BIG may return Z values; stored boundaries are two-dimensional.
            const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates]
                : feature.geometry.type === "MultiPolygon" ? feature.geometry.coordinates : null;
            if (polygons) return polygons.map((polygon) => polygon.map((ring) => ring.map(([longitude, latitude]) => [longitude, latitude])));
            throw new Error("Invalid geometry type");
        }),
    };
    const { error } = await createAdminClient().rpc("store_region_boundary", { p_region_code: row.region_code, p_geometry: boundary });
    if (error) throw error;
}

async function fetchProviderBoundary(zone: Zone): Promise<ZoneGeometry> {
    // "Asemrowo" -> 'A%S%E%M%R%O%W%O%' finds "Asem Rowo".
    const name = `${districtKey(zone.zone_name).toUpperCase().split("").join("%")}%`;
    const city = cityKey(zone.city_name).replace(/^kota /, "").toUpperCase().replaceAll("'", "''");
    const query = new URLSearchParams({
        where: `UPPER(WADMKC) LIKE '${name}' AND UPPER(WADMKK) LIKE '%${city}'`,
        outFields: "KDCBPS,WADMKC,WADMKK,WADMPR",
        returnGeometry: "true",
        outSR: "4326",
        f: "geojson",
    });

    const signal = AbortSignal.timeout(BOUNDARY_PROVIDER_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(`${boundaryUrl}?${query}`, { signal, cache: "no-store" });
    } catch (error) {
        const timedOut = signal.aborted || (error instanceof Error && error.name === "TimeoutError");
        console.error("Failed to fetch zone boundary", {
            district: zone.zone_name, cityId: zone.city_id, city: zone.city_name, error,
        });
        throw new Error(timedOut ? "Layanan batas wilayah tidak merespons. Coba lagi." : "Layanan batas wilayah tidak tersedia. Coba lagi.", { cause: error });
    }
    if (!res.ok) throw new Error(`Layanan batas wilayah tidak tersedia (HTTP ${res.status}). Coba lagi.`);
    let data: unknown;
    try {
        data = await res.json();
    } catch (error) {
        throw new Error(signal.aborted ? "Layanan batas wilayah tidak merespons. Coba lagi." : "Data batas wilayah tidak valid. Coba lagi.", { cause: error });
    }
    if (isRecord(data) && isRecord(data.error)) {
        const code = typeof data.error.code === "number" ? ` (${data.error.code})` : "";
        throw new Error(`Layanan batas wilayah mengembalikan galat${code}. Coba lagi.`);
    }
    try {
        return normalizeGeometry(data, zone);
    } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : "Invalid boundary response"}. Coba lagi.`, { cause: error });
    }
}

async function fetchProviderCityBoundary(zone: Zone): Promise<unknown> {
    const city = cityKey(zone.city_name).replace(/^kota /, "").toUpperCase().replaceAll("'", "''");
    const query = new URLSearchParams({
        where: `UPPER(WADMKC) IS NOT NULL AND UPPER(WADMKK) LIKE '%${city}'`,
        outFields: "KDCBPS,WADMKC,WADMKK,WADMPR",
        returnGeometry: "true",
        outSR: "4326",
        resultRecordCount: "1000",
        f: "geojson",
    });
    const signal = AbortSignal.timeout(BOUNDARY_PROVIDER_TIMEOUT_MS);
    let response: Response;
    try {
        response = await fetch(`${boundaryUrl}?${query}`, { signal, cache: "no-store" });
    } catch (error) {
        const timedOut = signal.aborted || (error instanceof Error && error.name === "TimeoutError");
        throw new Error(timedOut ? "Layanan batas wilayah tidak merespons. Coba lagi." : "Layanan batas wilayah tidak tersedia. Coba lagi.", { cause: error });
    }
    if (!response.ok) throw new Error(`Layanan batas wilayah tidak tersedia (HTTP ${response.status}).`);
    const data: unknown = await response.json();
    if (!isRecord(data) || data.type !== "FeatureCollection" || !Array.isArray(data.features) || data.features.length === 0) {
        throw new Error("Batas wilayah kota belum tersedia.");
    }
    return data;
}

async function fetchSharedProviderCityBoundary(zone: Zone): Promise<unknown> {
    const key = zone.city_id;
    const pending = pendingCityBoundaries.get(key);
    if (pending) return pending;

    const request = fetchProviderCityBoundary(zone);
    pendingCityBoundaries.set(key, request);
    try {
        return await request;
    } finally {
        if (pendingCityBoundaries.get(key) === request) pendingCityBoundaries.delete(key);
    }
}
