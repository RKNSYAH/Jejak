import { getZoneRow, toZone } from "@/app/engine/controller/zoneController";
import { isBoundary, normalizeGeometry } from "@/app/engine/lib/zoneGeometry";

const boundaryUrl = "https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query";

export async function GET(req: Request) {
    const zoneId = new URL(req.url).searchParams.get("zone_id");
    if (!zoneId) return Response.json({ error: "Missing zone_id" }, { status: 400 });
    let row;
    try {
        row = await getZoneRow(zoneId);
    } catch {
        return Response.json({ error: "Unable to load region boundary" }, { status: 503 });
    }
    if (!row) return Response.json({ error: "Unsupported zone_id" }, { status: 404 });
    const zone = toZone(row);
    if (row.geometry !== null) {
        if (!isBoundary(row.geometry)) return Response.json({ error: "Invalid stored boundary" }, { status: 502 });
        return Response.json({ type: "FeatureCollection", features: [{
            type: "Feature", id: zone.zone_id, geometry: row.geometry,
            properties: { zone_id: zone.zone_id, zone_name: zone.zone_name, source_region_code: row.region_code },
        }] });
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
        return Response.json(normalizeGeometry(await res.json(), zone));
    } catch {
        return Response.json({ error: "Boundary provider unavailable or returned invalid data. Please retry." }, { status: 502 });
    }
}
