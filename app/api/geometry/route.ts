import { supportedZones } from "@/app/engine/controller/zoneController";
import { normalizeGeometry } from "@/app/engine/lib/zoneGeometry";

const boundaryUrl = "https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query";

export async function GET(req: Request) {
    const zoneId = new URL(req.url).searchParams.get("zone_id");
    const zone = supportedZones.find((item) => item.zone_id === zoneId);
    if (!zone) return Response.json({ error: "Unsupported zone_id" }, { status: 400 });

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
