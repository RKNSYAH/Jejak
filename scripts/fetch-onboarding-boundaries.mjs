import { mkdir, writeFile } from "node:fs/promises";

// Rebuild the small prototype asset from trusted BIG RBI district boundaries.
const source = "https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query";
const query = new URLSearchParams({
    where: "UPPER(WADMKK) LIKE '%JAKARTA SELATAN%'",
    outFields: "WADMKC,WADMKK", returnGeometry: "true", outSR: "4326",
    geometryPrecision: "5", maxAllowableOffset: "0.0002", f: "geojson",
});
const response = await fetch(`${source}?${query}`, { signal: AbortSignal.timeout(60_000) });
if (!response.ok) throw new Error(`Boundary download failed: ${response.status}`);
const data = await response.json();
if (data.type !== "FeatureCollection" || data.features?.length !== 10) {
    throw new Error("Expected the ten Jakarta Selatan district boundaries");
}
const features = data.features.map((feature) => {
    const name = feature.properties.WADMKC.trim();
    if (feature.properties.WADMKK !== "Kota Administrasi Jakarta Selatan" ||
        !["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) {
        throw new Error(`Unexpected boundary: ${name}`);
    }
    const id = name.toLowerCase().replaceAll(" ", "-");
    return { type: "Feature", id, geometry: feature.geometry, properties: {
        zone_id: id, zone_name: name, source: "BIG RBI", source_url: source,
    } };
});
if (new Set(features.map((feature) => feature.id)).size !== 10) throw new Error("Duplicate boundaries");
await mkdir("public/onboarding", { recursive: true });
await writeFile("public/onboarding/jakarta-selatan.geojson", JSON.stringify({
    type: "FeatureCollection", source: "BIG RBI — administrative boundaries, not sample metrics",
    source_url: `${source}?${query}`, retrieved_at: new Date().toISOString(), features,
}) + "\n");
console.log(`Saved ${features.length} BIG district boundaries`);
