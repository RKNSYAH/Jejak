import { mkdir, writeFile } from "node:fs/promises";

const endpoint = "https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query";
const query = new URLSearchParams({
    where: "UPPER(WADMKC) IS NOT NULL AND UPPER(WADMKK) LIKE '%JAKARTA SELATAN'",
    outFields: "KDCBPS,WADMKC,WADMKK,WADMPR", returnGeometry: "true", outSR: "4326", f: "geojson",
});
const response = await fetch(`${endpoint}?${query}`, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`BIG boundary download failed: ${response.status}`);
const data = await response.json();
if (data.type !== "FeatureCollection" || !data.features?.length) throw new Error("BIG returned no district boundaries");
const directory = new URL("../../.temp/landing-capture/", import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL("boundaries.geojson", directory), JSON.stringify(data));
console.log(`Saved ${data.features.length} official district boundaries for local capture`);
