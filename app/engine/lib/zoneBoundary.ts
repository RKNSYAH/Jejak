import type { RegionDetailRow } from "../controller/zoneController";
import type { Zone, ZoneGeometry } from "../types";
import { toZone } from "../controller/zoneController";
import { cityKey, districtKey, isBoundary, isRecord, normalizeGeometry } from "./zoneGeometry";
import { BOUNDARY_PROVIDER_TIMEOUT_MS } from "./zoneRequestTimeouts";
import type { MultiPolygon } from "geojson";
import { createAdminClient } from "./admin";

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

    const key = JSON.stringify([
        zone.zone_id,
        zone.zone_name,
        zone.city_id,
        zone.city_name,
    ]);

    const entry = boundaries.get(key);
    const cached = entry && entry.expiresAt > Date.now()
        ? entry
        : undefined;

    if (!cached) boundaries.delete(key);
    if (cached?.persisted) return cached.geometry;

    const pending = pendingBoundaries.get(key);
    if (pending) return pending;

    const request = (async () => {
        const geometry = cached?.geometry ?? await fetchProviderBoundary(zone);

        let persisted = false;
        try{
            await insertZoneBoundary(row, geometry);
            persisted = true;
        } catch (error) {
            console.error("Failed to store zone boundary:", error);
        }
        if (!boundaries.has(key) && (boundaries.size >= maxCachedBoundaries)) {
            const oldest = boundaries.keys().next().value;
            if (oldest !== undefined) boundaries.delete(oldest);
        }
        boundaries.set(key, { geometry, expiresAt: cached?.expiresAt ?? Date.now() + cacheLifetimeMs, persisted });
        return geometry;
    });
    const geometry = await request();
    pendingBoundaries.set(key, Promise.resolve(geometry));
    try {
        return geometry;
    } finally {
        // Failed lookups must be retryable; concurrent selections share one request.
        pendingBoundaries.delete(key);
    }
}

async function insertZoneBoundary(row: RegionDetailRow, geometry: ZoneGeometry): Promise<void> {
    const boundary: MultiPolygon = {
        type: "MultiPolygon",
        coordinates: geometry.features.flatMap((feature) => {
            if (feature.geometry.type === "Polygon") return [feature.geometry.coordinates];
            if (feature.geometry.type === "MultiPolygon") return feature.geometry.coordinates;
            throw new Error("Invalid geometry type");
        }),
    };

    if (!isBoundary(boundary)) throw new Error("Invalid boundary geometry");
    
    const {error} = await createAdminClient().rpc("store_region_boundary", {
        p_region_code: row.region_code,
        p_geometry: boundary,
    });
    if (error) throw error;
};

async function fetchProviderBoundary(zone: Zone): Promise<ZoneGeometry> {
    // "Asemrowo" -> 'A%S%E%M%R%O%W%O%' finds "Asem Rowo".
    const name = `${districtKey(zone.zone_name).toUpperCase().split("").join("%")}%`;
    // city name normalization.
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
        throw new Error(timedOut ? "Boundary provider timed out. Please retry." : "Boundary provider unavailable. Please retry.", { cause: error });
    }
    if (!res.ok) throw new Error(`Boundary provider unavailable (HTTP ${res.status}). Please retry.`);
    let data: unknown;
    try {
        data = await res.json();
    } catch (error) {
        throw new Error(signal.aborted ? "Boundary provider timed out. Please retry." : "Boundary provider returned invalid data. Please retry.", { cause: error });
    }
    if (isRecord(data) && isRecord(data.error)) {
        const code = typeof data.error.code === "number" ? ` (${data.error.code})` : "";
        throw new Error(`Boundary provider returned an error${code}. Please retry.`);
    }
    try {
        return normalizeGeometry(data, zone);
    } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : "Invalid boundary response"}. Please retry.`, { cause: error });
    }
}
