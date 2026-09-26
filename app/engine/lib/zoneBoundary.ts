import type { RegionDetailRow } from "../controller/zoneController";
import type { ZoneGeometry } from "../types";
import { toZone } from "../controller/zoneController";
import { isBoundary, normalizeGeometry } from "./zoneGeometry";

const boundaryUrl = "https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query";

export async function getZoneBoundary(row: RegionDetailRow): Promise<ZoneGeometry> {
    const zone = toZone(row);
    if (row.geometry !== null) {
        if (!isBoundary(row.geometry)) throw new Error("Invalid stored boundary");
        return { type: "FeatureCollection", features: [{
            type: "Feature", id: zone.zone_id, geometry: row.geometry,
            properties: { zone_id: zone.zone_id, zone_name: zone.zone_name, source_region_code: row.region_code },
        }] };
    }

    const name = zone.zone_name.toUpperCase().replaceAll("'", "''");
    const city = zone.city_name.toUpperCase().replaceAll("'", "''");
    const query = new URLSearchParams({
        where: `UPPER(WADMKC)='${name}' AND UPPER(WADMKK) IN ('${city}', 'KOTA ADM. ${city}', 'KOTA ADMINISTRASI ${city}')`,
        outFields: "KDCBPS,WADMKC,WADMKK,WADMPR",
        returnGeometry: "true",
        outSR: "4326",
        geometryPrecision: "5",
        maxAllowableOffset: "0.0001",
        f: "geojson",
    });

    try {
        const res = await fetch(`${boundaryUrl}?${query}`, {
            signal: AbortSignal.timeout(15000),
            next: { revalidate: 60 * 60 * 24 * 30 },
        });
        if (!res.ok) throw new Error("Boundary request failed");
        return normalizeGeometry(await res.json(), zone);
    } catch {
        throw new Error("Boundary provider unavailable or returned invalid data. Please retry.");
    }
}
