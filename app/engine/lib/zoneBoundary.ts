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

export async function getZoneBoundary(row: RegionDetailRow): Promise<ZoneGeometry> {
    const zone = toZone(row);
    if (row.geometry !== null) {
        if (!isBoundary(row.geometry)) throw new Error("Invalid stored boundary");
        return { type: "FeatureCollection", features: [{
            type: "Feature", id: zone.zone_id, geometry: row.geometry,
            properties: { zone_id: zone.zone_id, zone_name: zone.zone_name, source_region_code: row.region_code },
        }] };
    }

    const key = JSON.stringify([zone.zone_id, zone.zone_name, zone.city_id, zone.city_name]);
    const entry = boundaries.get(key);
    const cached = entry && entry.expiresAt > Date.now() ? entry : undefined;
    if (!cached) boundaries.delete(key);
    if (cached?.persisted) return cached.geometry;

    const pending = pendingBoundaries.get(key);
    if (pending) return pending;

    const request = (async () => {
        const geometry = cached?.geometry ?? await fetchProviderBoundary(zone);
        const persisted = await tryPersistBoundary(row, geometry);
        if (!boundaries.has(key) && (boundaries.size >= maxCachedBoundaries)) {
            const oldest = boundaries.keys().next().value;
            if (oldest !== undefined) boundaries.delete(oldest);
        }
        boundaries.set(key, { geometry, expiresAt: cached?.expiresAt ?? Date.now() + cacheLifetimeMs, persisted });
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
    const features: ZoneGeometry["features"] = [];
    const unresolved: string[] = [];

    for (const row of stored) {
        try { features.push(...(await getZoneBoundary(row)).features); }
        catch { unresolved.push(row.region_code); }
    }

    // Metro previews span several cities; BIG returns one city's kecamatan per request.
    const missingByCity = new Map<string, RegionDetailRow[]>();
    for (const row of missing) missingByCity.set(row.parent_code, [...missingByCity.get(row.parent_code) ?? [], row]);
    for (const cityRows of missingByCity.values()) {
        try {
            const response = await fetchProviderCityBoundary(toZone(cityRows[0]));
            for (const row of cityRows) {
                try {
                    const geometry = normalizeGeometry(response, toZone(row));
                    features.push(...geometry.features);
                    const persisted = await tryPersistBoundary(row, geometry);
                    const key = JSON.stringify([row.region_code, row.region_name, row.parent_code, row.parent_name]);
                    boundaries.set(key, { geometry, expiresAt: Date.now() + cacheLifetimeMs, persisted });
                } catch {
                    unresolved.push(row.region_code);
                }
            }
        } catch {
            unresolved.push(...cityRows.map((row) => row.region_code));
        }
    }

    return { geometry: { type: "FeatureCollection", features }, missingZones: unresolved };
}

async function tryPersistBoundary(row: RegionDetailRow, geometry: ZoneGeometry): Promise<boolean> {
    if (!isAdminConfigured()) return false;
    try {
        await insertZoneBoundary(row, geometry);
        return true;
    } catch (error) {
        console.error("Failed to store zone boundary:", error);
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
        geometryPrecision: "5",
        maxAllowableOffset: "0.0001",
        f: "geojson",
    });

    const signal = AbortSignal.timeout(BOUNDARY_PROVIDER_TIMEOUT_MS);
    let res: Response;
    try {
        res = await fetch(`${boundaryUrl}?${query}`, { signal, cache: "no-store" });
    } catch (error) {
        const timedOut = signal.aborted || (error instanceof Error && error.name === "TimeoutError");
        console.log("Failed to fetch zone boundary:", error);
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
        geometryPrecision: "5",
        maxAllowableOffset: "0.0001",
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
