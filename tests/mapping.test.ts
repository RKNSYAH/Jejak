import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGeometry, getGeometryBounds } from "../app/engine/lib/zoneGeometry";
import { toZone, toZoneDetails, validateCellQuery, validateZoneQuery } from "../app/engine/controller/zoneController";
import { getZoneBoundary } from "../app/engine/lib/zoneBoundary";
import { createCellFillData, createCellGlowData, createCompanyPointData, createZoneLayerData, summarizeCells } from "../app/components/map/zoneLayerData";
import { cellLayers, cellMetrics, formatFactValue, mapCategories } from "../app/components/map/mapMetrics";
import { CELL_GLOW_LAYER, getCellFillLayer, getMetricRange, getZoneFillLayer, ZONE_OUTLINE_LAYER } from "../app/components/map/zoneLayers";
import { getMapCells, getZoneGeometry, getZoneIntelligence, getZoneMapData, getZones } from "../app/engine/lib/zoneApi";
import { BOUNDARY_PROVIDER_TIMEOUT_MS, ZONE_BOUNDARY_REQUEST_TIMEOUT_MS, ZONE_REQUEST_TIMEOUT_MS } from "../app/engine/lib/zoneRequestTimeouts";
import mapStyle from "../public/jejak_light_openfreemap.json";
import type { MapCell, ZoneDetailResult, ZoneGeometry } from "../app/engine/types";

const zone = { zone_id: "pancoran", zone_name: "Pancoran", city_id: "jakarta-selatan", city_name: "Jakarta Selatan" };
const polygon = { type: "Polygon", coordinates: [[[106, -6], [107, -6], [107, -5], [106, -6]]] };
const boundary = {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: polygon, properties: { WADMKC: "Pancoran", WADMKK: "JAKARTA SELATAN", KDCBPS: "test-code" } }],
};

test("trusted boundaries retain the app ID and reject a different city", () => {
    const geometry = normalizeGeometry(boundary, zone);
    assert.equal(geometry.features[0].properties.source_region_code, "test-code");
    assert.deepEqual(getGeometryBounds(geometry), [[106, -6], [107, -5]]);
    const otherCity = structuredClone(boundary);
    otherCity.features[0].properties.WADMKK = "Other city";
    assert.throws(() => normalizeGeometry(otherCity, zone), /does not match/);
    const senen = { zone_id: "senen", zone_name: "Senen", city_id: "jakarta-pusat", city_name: "Jakarta Pusat" };
    const centralBoundary = structuredClone(boundary);
    centralBoundary.features[0].properties.WADMKC = "Senen";
    centralBoundary.features[0].properties.WADMKK = "KOTA ADMINISTRASI JAKARTA PUSAT";
    assert.equal(normalizeGeometry(centralBoundary, senen).features[0].properties.zone_id, "senen");
    assert.throws(() => normalizeGeometry(centralBoundary, zone), /does not match/);
});

test("full administrative city names match BIG and keep kota and kabupaten apart", () => {
    const fullName = { ...zone, city_name: "Kota Administrasi Jakarta Selatan" };
    const bigBoundary = structuredClone(boundary);
    bigBoundary.features[0].properties.WADMKK = "Kota Administrasi Jakarta Selatan";
    assert.equal(normalizeGeometry(bigBoundary, fullName).features.length, 1);
    assert.equal(normalizeGeometry(boundary, fullName).features.length, 1);
    const seribu = { ...zone, zone_name: "Kepulauan Seribu Utara", city_name: "Kabupaten Administrasi Kepulauan Seribu" };
    const seribuBoundary = structuredClone(boundary);
    seribuBoundary.features[0].properties.WADMKC = "Kepulauan Seribu Utara";
    seribuBoundary.features[0].properties.WADMKK = "Administrasi Kepulauan Seribu";
    assert.equal(normalizeGeometry(seribuBoundary, seribu).features.length, 1);
    const bekasi = { ...zone, zone_name: "Pancoran", city_name: "Kabupaten Bekasi" };
    const bothBekasi = structuredClone(boundary);
    bothBekasi.features[0].properties.WADMKK = "Kota Bekasi";
    bothBekasi.features.push({ ...structuredClone(boundary.features[0]), properties: { WADMKC: "Pancoran", WADMKK: "Bekasi", KDCBPS: "regency" } });
    assert.deepEqual(normalizeGeometry(bothBekasi, bekasi).features.map((feature) => feature.properties.source_region_code), ["regency"]);
});

test("district names match BIG despite spacing and punctuation", () => {
    for (const [ours, big] of [["Asemrowo", "Asem Rowo"], ["Pulo Gadung", "Pulogadung"], ["Kepulauan Seribu Selatan", "Kepulauan Seribu Selatan."]]) {
        const spaced = structuredClone(boundary);
        spaced.features[0].properties.WADMKC = big;
        assert.equal(normalizeGeometry(spaced, { ...zone, zone_name: ours }).features.length, 1);
    }
});

test("catalogue city shorthand matches BIG's kota names without merging regencies", () => {
    for (const city of ["Bandung", "Surabaya", "Yogyakarta"]) {
        const named = structuredClone(boundary);
        named.features[0].properties.WADMKK = `Kota ${city}`;
        assert.equal(normalizeGeometry(named, { ...zone, city_name: city }).features.length, 1);
        assert.equal(normalizeGeometry(named, { ...zone, city_name: `Kota ${city}` }).features.length, 1);
        assert.throws(() => normalizeGeometry(named, { ...zone, city_name: `Kabupaten ${city}` }), /does not match/);
        assert.throws(() => normalizeGeometry(named, { ...zone, city_name: `Kab. ${city}` }), /does not match/);
    }
    const both = structuredClone(boundary);
    both.features[0].properties.WADMKK = "Kota Bekasi";
    both.features.push({ ...structuredClone(boundary.features[0]), properties: { WADMKC: "Pancoran", WADMKK: "Bekasi", KDCBPS: "regency" } });
    assert.throws(() => normalizeGeometry(both, { ...zone, city_name: "Bekasi" }), /multiple administrative areas/);
    assert.equal(normalizeGeometry(both, { ...zone, city_name: "Kota Bekasi" }).features.length, 1);
    assert.deepEqual(normalizeGeometry(both, { ...zone, city_name: "Kabupaten Bekasi" }).features.map((feature) => feature.properties.source_region_code), ["regency"]);
    assert.throws(() => normalizeGeometry({ type: "FeatureCollection", features: [] }, zone), /No boundary found/);
});

test("database rows preserve their stable code and explicit sample label", () => {
    const row = { region_code: "pancoran", region_name: "Pancoran (demo parent)", parent_code: "jakarta-selatan", parent_name: "Jakarta Selatan (demo parent)", is_sample: true };
    assert.deepEqual(toZone(row), zone);
    assert.equal(validateZoneQuery(new URLSearchParams()).cityId, null);
    assert.equal(validateZoneQuery(new URLSearchParams("city_id=jakarta-pusat")).cityId, "jakarta-pusat");
    assert.throws(() => validateZoneQuery(new URLSearchParams("city_id=invalid!")), /Unsupported city_id/);
    assert.throws(() => validateZoneQuery(new URLSearchParams("sector_id=unknown")), /Unsupported sector_id/);
    assert.deepEqual(toZone({ ...row, region_code: "senen", region_name: "Senen", parent_code: "jakarta-pusat", parent_name: "Jakarta Pusat (demo parent)" }), {
        zone_id: "senen", zone_name: "Senen", city_id: "jakarta-pusat", city_name: "Jakarta Pusat",
    });
    const details = toZoneDetails({ ...row, geometry: null, places: [], facts: [{ metric: "company_count", value: 0, unit: "companies", source: "SAMPLE", period_end: null, evidence_type: "estimated", limitations: null, is_sample: true }] });
    assert.equal(details.is_sample, true);
    assert.equal(details.facts[0].value, 0);
});

test("category joins distinguish zero, missing values, and summary", () => {
    const base = normalizeGeometry(boundary, zone).features[0];
    const geometry: ZoneGeometry = { type: "FeatureCollection", features: ["pancoran", "setiabudi"].map((id) => ({ ...base, properties: { zone_id: id, zone_name: id } })) };
    const details: Record<string, ZoneDetailResult> = {
        pancoran: { is_sample: true, places: [], facts: [{ metric: "company_count", value: 0, unit: "companies", source: "SAMPLE", period_end: null, evidence_type: "estimated", limitations: null, is_sample: true }] },
        setiabudi: { is_sample: true, places: [], facts: [] },
    };
    assert.deepEqual(createZoneLayerData(geometry, details, "employment").features.map((feature) => feature.properties.value), [0, null]);
    assert.deepEqual(createZoneLayerData(geometry, details, "summary").features.map((feature) => feature.properties.value), [null, null]);
    assert.deepEqual(createZoneLayerData(geometry, details, "housing").features.map((feature) => feature.properties.zone_id), ["pancoran", "setiabudi"]);
    assert.equal(createZoneLayerData({ type: "FeatureCollection", features: [] }, details, "summary").features.length, 0);
    assert.equal(mapCategories.housing.format(1900000), "Rp1.900.000");
    assert.equal(formatFactValue({ metric: "median_monthly_rent_idr", value: 1900000, unit: "IDR", source: "SAMPLE", period_end: null, evidence_type: "estimated", limitations: null, is_sample: true }), "Rp1.900.000/month");
});

test("a stored boundary is returned alongside facts without a provider request", async (context) => {
    context.mock.method(globalThis, "fetch", async () => { throw new Error("Provider should not be called"); });
    const row = { region_code: "pancoran", region_name: "Pancoran", parent_code: "jakarta-selatan", parent_name: "Jakarta Selatan", is_sample: false, geometry: polygon, places: [], facts: [] };
    assert.equal((await getZoneBoundary(row)).features[0].properties.zone_id, "pancoran");
    await assert.rejects(getZoneBoundary({ ...row, geometry: { type: "Point", coordinates: [0, 0] } }), /Invalid stored boundary/);
});

function providerRow(code: string) {
    return { region_code: code, region_name: "Pancoran", parent_code: "jakarta-selatan", parent_name: "Jakarta Selatan", is_sample: false, geometry: null, places: [], facts: [] };
}

test("provider lookups cache validated boundaries and bypass raw HTTP response caching", async (context) => {
    let calls = 0;
    context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
        calls++;
        const query = new URL(url).searchParams;
        assert.equal(query.get("where"), "UPPER(WADMKC) LIKE 'P%A%N%C%O%R%A%N%' AND UPPER(WADMKK) LIKE '%JAKARTA SELATAN'");
        assert.equal(options.cache, "no-store");
        assert.equal("next" in options, false);
        return Response.json(boundary);
    });
    const row = providerRow("provider-cache");
    assert.equal((await getZoneBoundary(row)).features[0].properties.zone_id, row.region_code);
    assert.equal((await getZoneBoundary(row)).features.length, 1);
    assert.equal(calls, 1);
    // Stored geometry always wins, even after a provider result was cached.
    const stored = { ...polygon, coordinates: [[[108, -7], [109, -7], [109, -6], [108, -7]]] };
    assert.deepEqual((await getZoneBoundary({ ...row, geometry: stored })).features[0].geometry, stored);
});

test("simultaneous boundary requests share a lookup and cache identity includes the city", async (context) => {
    let calls = 0;
    let release!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => { release = resolve; });
    context.mock.method(globalThis, "fetch", async () => { calls++; return response; });
    const row = providerRow("provider-concurrent");
    const first = getZoneBoundary(row);
    const second = getZoneBoundary(row);
    assert.equal(calls, 1);
    release(Response.json(boundary));
    assert.deepEqual(await first, await second);
    context.mock.restoreAll();

    const other = structuredClone(boundary);
    other.features[0].properties.WADMKK = "Kota Bandung";
    context.mock.method(globalThis, "fetch", async () => { calls++; return Response.json(other); });
    assert.equal((await getZoneBoundary({ ...row, parent_code: "bandung", parent_name: "Bandung" })).features.length, 1);
    assert.equal(calls, 2);
});

test("failed, empty and invalid provider responses stay retryable with distinct errors", async (context) => {
    const wrong = structuredClone(boundary);
    wrong.features[0].properties.WADMKK = "Other city";
    const cases: [string, () => Response, RegExp][] = [
        ["empty", () => Response.json({ type: "FeatureCollection", features: [] }), /No boundary found/],
        ["http", () => new Response("Unavailable", { status: 503 }), /HTTP 503/],
        ["arcgis", () => Response.json({ error: { code: 499, message: "Token Required" } }), /returned an error \(499\)/],
        ["json", () => new Response("<html>Unavailable</html>"), /returned invalid data/],
        ["schema", () => Response.json({ unexpected: true }), /Invalid boundary response/],
        ["identity", () => Response.json(wrong), /does not match/],
        ["timeout", () => { throw new DOMException("Timeout", "TimeoutError"); }, /provider timed out/],
        ["network", () => { throw new TypeError("fetch failed"); }, /provider unavailable/],
    ];
    for (const [name, failure, message] of cases) {
        let calls = 0;
        context.mock.method(globalThis, "fetch", async () => ++calls === 1 ? failure() : Response.json(boundary));
        const row = providerRow(`provider-retry-${name}`);
        await assert.rejects(getZoneBoundary(row), message);
        assert.equal((await getZoneBoundary(row)).features.length, 1);
        assert.equal(calls, 2);
        context.mock.restoreAll();
    }
});

test("validated boundary cache expires and stays bounded", async (context) => {
    let now = Date.now();
    let calls = 0;
    context.mock.method(Date, "now", () => now);
    context.mock.method(globalThis, "fetch", async () => { calls++; return Response.json(boundary); });
    const row = providerRow("provider-expiry");
    await getZoneBoundary(row);
    now += 31 * 24 * 60 * 60 * 1000;
    await getZoneBoundary(row);
    assert.equal(calls, 2);
    for (let index = 0; index < 128; index++) await getZoneBoundary(providerRow(`provider-eviction-${index}`));
    await getZoneBoundary(row);
    assert.equal(calls, 131);
});

test("district colors remain data driven", () => {
    assert.deepEqual(getMetricRange([null, 0, 1400]), { min: 0, max: 1400 });
    const fill = getZoneFillLayer("employment", { min: 0, max: 1400 });
    assert.deepEqual(fill.paint?.["fill-color"], ["interpolate", ["linear"], ["to-number", ["get", "value"]], 0, "#9ED9EB", 1400, "#006AD8"]);
    assert.deepEqual(fill.paint?.["fill-opacity"], ["case", ["==", ["get", "value"], null], 0, 0.6]);
    assert.equal(ZONE_OUTLINE_LAYER.paint?.["line-color"], "#5F84B1");
    assert.equal(getZoneFillLayer("summary", null).paint?.["fill-opacity"], 0.16);
});

const fact = (value: number, sample_size: number | null = 5) => ({ value, unit: "workers", evidence_type: "estimated" as const,
    period_end: null, source: "SAMPLE", sample_size, limitations: "Synthetic", is_sample: true });
const hexCell = (code: string, x: number, facts: MapCell["facts"]): MapCell => ({
    cell_code: code, parent_code: "setiabudi", is_sample: true, centroid: [x + 0.001, -6.2015], facts,
    geometry: { type: "Polygon", coordinates: [[[x, -6.2], [x + 0.002, -6.2], [x + 0.002, -6.203], [x, -6.2]]] },
});

test("employment and housing get cell layers; education and mobility do not", () => {
    assert.deepEqual(cellMetrics("employment"), ["estimated_office_workers", "estimated_office_workers_low", "estimated_office_workers_high"]);
    assert.deepEqual(cellMetrics("housing"), ["median_monthly_rent_idr", "housing_listing_count"]);
    assert.deepEqual(cellMetrics("education"), []);
    assert.deepEqual(cellMetrics("mobility"), []);
    assert.deepEqual(cellLayers.housing?.map((layer) => layer.kind), ["fill", "glow"]);
    assert.deepEqual(validateCellQuery(new URLSearchParams("zone_id=setiabudi&category=housing")), { zoneId: "setiabudi", category: "housing" });
    assert.throws(() => validateCellQuery(new URLSearchParams("zone_id=setiabudi&category=education")), /Unsupported category/);
    assert.throws(() => validateCellQuery(new URLSearchParams("zone_id=setiabudi&category=toString")), /Unsupported category/);
    assert.throws(() => validateCellQuery(new URLSearchParams("zone_id=Setiabudi%3B&category=housing")), /Unsupported zone_id/);
});

test("cell glow weights are relative to the busiest cell and rent fills hexagons", () => {
    const workers = cellLayers.employment![0];
    const cells = [
        hexCell("h3-a", 106.8, { estimated_office_workers: fact(6000), estimated_office_workers_low: fact(4200), estimated_office_workers_high: fact(8400) }),
        hexCell("h3-b", 106.81, { estimated_office_workers: fact(1500), estimated_office_workers_low: fact(1050), estimated_office_workers_high: fact(2100) }),
        hexCell("h3-c", 106.82, {}),
    ];
    const glow = createCellGlowData(cells, workers.metric);
    assert.deepEqual(glow.features.map((f) => [f.properties.cell_code, f.properties.weight]), [["h3-a", 1], ["h3-b", 0.25]]);
    assert.deepEqual(glow.features[0].geometry.coordinates, [106.801, -6.2015]);
    assert.equal(createCellGlowData([hexCell("h3-z", 106.8, {})], workers.metric).features.length, 0);
    assert.deepEqual(summarizeCells(cells, workers), {
        cells: 3, withValue: 2, min: 1500, max: 6000, total: 7500,
        maxBounds: { low: 4200, high: 8400 }, totalBounds: { low: 5250, high: 10500 },
        sources: ["SAMPLE"], periods: ["period unavailable"], isSample: true,
    });
    const fill = createCellFillData(cells, "median_monthly_rent_idr");
    assert.deepEqual(fill.features.map((f) => f.properties.value), [null, null, null]);
    assert.equal(fill.features[0].geometry.type, "Polygon");
    assert.equal(summarizeCells(cells, cellLayers.housing![0]), null);
    assert.deepEqual(getCellFillLayer({ min: 2000000, max: 6000000 }).paint?.["fill-opacity"], ["case", ["==", ["get", "value"], null], 0, 0.7]);
    assert.deepEqual(CELL_GLOW_LAYER.paint?.["heatmap-weight"], ["get", "weight"]);
    assert.deepEqual(CELL_GLOW_LAYER.paint?.["heatmap-radius"], ["interpolate", ["exponential", 2], ["zoom"], 11, 5, 17, 336]);
});

test("cell API data must match the requested zone and category", async (context) => {
    const cell = hexCell("h3-a", 106.8, { estimated_office_workers: fact(6000, 12) });
    let payload: unknown = { is_sample: true, zone_id: "setiabudi", category: "employment", cells: [cell] };
    let requested = "";
    context.mock.method(globalThis, "fetch", async (url: string) => { requested = url; return Response.json(payload); });
    const result = await getMapCells("setiabudi", "employment", new AbortController().signal);
    assert.equal(requested, "/api/heatmap?zone_id=setiabudi&category=employment&geometry=1");
    assert.equal(result.cells[0].facts.estimated_office_workers.sample_size, 12);
    payload = { is_sample: true, zone_id: "setiabudi", category: "employment", cells: [{ ...cell, geometry: null }] };
    assert.equal((await getMapCells("setiabudi", "employment", new AbortController().signal, false)).cells[0].geometry, null);
    assert.equal(requested, "/api/heatmap?zone_id=setiabudi&category=employment&geometry=0");
    payload = { is_sample: true, zone_id: "setiabudi", category: "employment", cells: [cell] };
    await assert.rejects(getMapCells("setiabudi", "employment", new AbortController().signal, false), /Invalid heatmap data/);
    payload = { is_sample: true, zone_id: "pancoran", category: "employment", cells: [cell] };
    await assert.rejects(getMapCells("setiabudi", "employment", new AbortController().signal), /Invalid heatmap data/);
    payload = { is_sample: true, zone_id: "setiabudi", category: "employment", cells: [{ ...cell, facts: { estimated_office_workers: { ...fact(1), value: "many" } } }] };
    await assert.rejects(getMapCells("setiabudi", "employment", new AbortController().signal), /Invalid heatmap data/);
    context.mock.restoreAll();
});

test("basemap labels use local web fonts without requesting unavailable glyph stacks", () => {
    assert.equal("glyphs" in mapStyle, false);
    const fontNames = mapStyle.layers.filter((layer) => layer.type === "symbol" && layer.layout && "text-font" in layer.layout)
        .flatMap((layer) => layer.layout && "text-font" in layer.layout ? layer.layout["text-font"] : []);
    assert.deepEqual(new Set(fontNames), new Set(["Urbanist", "Source Sans 3"]));
});

test("catalogue keeps database ranking, sample flags and unknown ratios", async (context) => {
    const first = { ...zone, is_sample: true, average_monthly_wage_idr: 6600000, median_monthly_rent_idr: 1900000, population: 174542, wage_to_rent_ratio: 3.47 };
    const second = { ...first, zone_id: "setiabudi", zone_name: "Setiabudi", wage_to_rent_ratio: 2.23 };
    const senen = { ...first, zone_id: "senen", zone_name: "Senen", city_id: "jakarta-pusat", city_name: "Jakarta Pusat", average_monthly_wage_idr: null, median_monthly_rent_idr: null, population: null, wage_to_rent_ratio: null };
    let payload: unknown = { is_sample: true, zones: [first, second, senen] };
    context.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
        assert.equal(url, "/api/zones?sector_id=software_and_it_services");
        return Response.json(payload);
    });
    const signal = new AbortController().signal;
    assert.deepEqual((await getZones(signal)).zones.map((region) => [region.zone_id, region.city_name, region.wage_to_rent_ratio]), [
        ["pancoran", "Jakarta Selatan", 3.47], ["setiabudi", "Jakarta Selatan", 2.23], ["senen", "Jakarta Pusat", null],
    ]);
    payload = { is_sample: true, zones: [{ ...first, wage_to_rent_ratio: null }] };
    assert.equal((await getZones(signal)).zones[0].wage_to_rent_ratio, null);
    payload = { is_sample: true, zones: [{ ...first, wage_to_rent_ratio: "3.47" }] };
    await assert.rejects(getZones(signal), /Invalid zone summary/);
    context.mock.restoreAll();
});

test("browser API rejects malformed region facts", async (context) => {
    const sheetPlace = { id: 10, name: "Campus", category: "campus", latitude: -6.2, longitude: 106.8,
        source: "PDDikti", source_url: "https://example.id", observed_at: "2026-09-01", is_sample: false,
        address: "Jakarta", osm_type: "node", osm_id: 123, osm_tags: { amenity: "university" } };
    let payload: unknown = { is_sample: false, facts: [{ metric: "employed_people:kbli_j", value: 95000, unit: "count", source: "BPS",
        period_end: "2025-12-31", evidence_type: "observed", limitations: null, is_sample: false,
        dimension_key: "kbli_2020_code", dimension_value: "j" }], places: [sheetPlace] };
    context.mock.method(globalThis, "fetch", async () => Response.json(payload));
    const signal = new AbortController().signal;
    const details = await getZoneIntelligence("pancoran", signal);
    assert.equal(details.facts[0].value, 95000);
    assert.equal(details.facts[0].dimension_value, "j");
    assert.equal(details.places[0].osm_tags?.amenity, "university");
    payload = { is_sample: false, facts: [{ ...details.facts[0], dimension_value: null }], places: [sheetPlace] };
    await assert.rejects(getZoneIntelligence("pancoran", signal), /Invalid region data/);
    payload = { is_sample: true, facts: [{ metric: "company_count", value: "bad" }], places: [] };
    await assert.rejects(getZoneIntelligence("pancoran", signal), /Invalid region data/);
    context.mock.restoreAll();
});

test("combined zone load keeps facts when its boundary is unavailable", async (context) => {
    const details = { is_sample: true, facts: [{ metric: "company_count", value: 0, unit: "companies", source: "SAMPLE", period_end: null, evidence_type: "estimated", limitations: null, is_sample: true }], places: [] };
    const geometry = normalizeGeometry(boundary, zone);
    const calls: string[] = [];
    context.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
        calls.push(String(url));
        return Response.json({ details, geometry, geometry_error: null });
    });
    const signal = new AbortController().signal;
    assert.equal((await getZoneMapData("pancoran", signal)).geometry?.features[0].properties.zone_name, "Pancoran");
    assert.deepEqual(calls, ["/api/zones/pancoran/intelligence?sector_id=software_and_it_services&include_geometry=1"]);
    context.mock.restoreAll();

    context.mock.method(globalThis, "fetch", async () => Response.json({ details, geometry: null, geometry_error: "Boundary provider unavailable" }));
    const partial = await getZoneMapData("pancoran", signal);
    assert.equal(partial.geometry, null);
    assert.equal(partial.geometryError, "Boundary provider unavailable");
    assert.equal(partial.details.facts[0].value, 0);
    context.mock.restoreAll();

    context.mock.method(globalThis, "fetch", async () => Response.json({ details, geometry: { type: "FeatureCollection", features: [{ ...geometry.features[0], properties: { zone_id: "wrong", zone_name: "Pancoran" } }] }, geometry_error: null }));
    const malformedBoundary = await getZoneMapData("pancoran", signal);
    assert.equal(malformedBoundary.geometry, null);
    assert.match(malformedBoundary.geometryError ?? "", /Invalid zone boundary/);
    assert.equal(malformedBoundary.details.facts[0].value, 0);
});

test("boundary requests have a longer deadline without slowing cancellation or ordinary requests", async (context) => {
    const deadlines: number[] = [];
    context.mock.method(AbortSignal, "timeout", (milliseconds: number) => {
        deadlines.push(milliseconds);
        return new AbortController().signal;
    });
    const details = { is_sample: false, facts: [], places: [] };
    const geometry = normalizeGeometry(boundary, zone);
    context.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => {
        if (String(url).startsWith("https://")) return Response.json(boundary);
        if (String(url).startsWith("/api/geometry")) return Response.json(geometry);
        if (String(url).includes("include_geometry=1")) return Response.json({ details, geometry, geometry_error: null });
        return Response.json(details);
    });
    const controller = new AbortController();
    await getZoneBoundary(providerRow("provider-deadline"));
    await getZoneGeometry("pancoran", controller.signal);
    await getZoneMapData("pancoran", controller.signal);
    await getZoneIntelligence("pancoran", controller.signal);
    assert.deepEqual(deadlines, [BOUNDARY_PROVIDER_TIMEOUT_MS, ZONE_BOUNDARY_REQUEST_TIMEOUT_MS, ZONE_BOUNDARY_REQUEST_TIMEOUT_MS, ZONE_REQUEST_TIMEOUT_MS]);
    assert.ok(BOUNDARY_PROVIDER_TIMEOUT_MS > 20_000);
    assert.ok(ZONE_BOUNDARY_REQUEST_TIMEOUT_MS > BOUNDARY_PROVIDER_TIMEOUT_MS);
    context.mock.restoreAll();

    context.mock.method(globalThis, "fetch", (_url: RequestInfo | URL, options: RequestInit) => new Promise((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(options.signal!.reason), { once: true });
    }));
    const request = getZoneGeometry("pancoran", controller.signal);
    controller.abort();
    await assert.rejects(request, (error: Error) => error.name === "AbortError");
});

test("empty browser boundary responses cannot be cached as successful selections", async (context) => {
    const geometry = { type: "FeatureCollection", features: [] };
    const details = { is_sample: false, facts: [], places: [] };
    context.mock.method(globalThis, "fetch", async (url: RequestInfo | URL) => Response.json(String(url).startsWith("/api/geometry") ? geometry : { details, geometry, geometry_error: null }));
    const signal = new AbortController().signal;
    await assert.rejects(getZoneGeometry("pancoran", signal), /No boundary found/);
    const combined = await getZoneMapData("pancoran", signal);
    assert.equal(combined.geometry, null);
    assert.match(combined.geometryError ?? "", /No boundary found/);
    assert.deepEqual(combined.details, details);
});

test("zone requests report non-JSON errors and timeouts clearly", async (context) => {
    const signal = new AbortController().signal;
    context.mock.method(globalThis, "fetch", async () => new Response("Gateway unavailable", { status: 503 }));
    await assert.rejects(getZones(signal), /HTTP 503/);
    context.mock.restoreAll();

    context.mock.method(globalThis, "fetch", async () => new Response("Unexpected markup"));
    await assert.rejects(getZones(signal), /Invalid response from the zone service/);
    context.mock.restoreAll();

    context.mock.method(globalThis, "fetch", async () => { throw new DOMException("Timeout", "TimeoutError"); });
    await assert.rejects(getZones(signal), /timed out/);
});

test("company point sits at the district centre with its located company count", () => {
    const setiabudi = { zone_id: "setiabudi", zone_name: "Setiabudi", centroid: [106.83, -6.22] as [number, number], latest_retrieved_at: "2026-09-28T09:00:00Z",
        counts: { active_opening: { count: 1, organizations: 1 }, office_presence: { count: 3, organizations: 2 } },
        labels: ["approx. 1 opening", "approx. 3 offices"] };
    const data = createCompanyPointData(setiabudi);
    assert.deepEqual(data.features.map((feature) => feature.geometry.coordinates), [[106.83, -6.22]]);
    assert.deepEqual(data.features[0].properties, { zone_id: "setiabudi", companies: 2 });
    assert.equal(createCompanyPointData({ ...setiabudi, counts: { active_opening: { count: 1, organizations: 1 } } }).features.length, 0);
    assert.equal(createCompanyPointData(null).features.length, 0);
});

test("approximate facts are labelled as approximate counts", () => {
    const fact = { metric: "company_count", value: 2, unit: "companies", source: "Monitored sources", period_end: "2026-09-28",
        evidence_type: "observed" as const, limitations: null, is_sample: false, approximate: true };
    assert.equal(formatFactValue(fact), "approx. 2 companies");
    assert.equal(formatFactValue({ ...fact, value: 1 }), "approx. 1 company");
    assert.equal(formatFactValue({ ...fact, approximate: false, value: 3100 }), (3100).toLocaleString("id-ID"));
});
