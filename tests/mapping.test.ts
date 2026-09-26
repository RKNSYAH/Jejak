import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGeometry, getGeometryBounds } from "../app/engine/lib/zoneGeometry";
import { toZone, toZoneDetails, validateZoneQuery } from "../app/engine/controller/zoneController";
import { createZoneLayerData } from "../app/components/map/zoneLayerData";
import { getZoneIntelligence, getZones } from "../app/engine/lib/zoneApi";
import type { ZoneDetailResult, ZoneGeometry } from "../app/engine/types";

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
    let payload: unknown = { is_sample: true, facts: [{ metric: "company_count", value: 0, unit: "companies", source: "SAMPLE", period_end: null, evidence_type: "estimated", limitations: null, is_sample: true }], places: [] };
    context.mock.method(globalThis, "fetch", async () => Response.json(payload));
    const signal = new AbortController().signal;
    assert.equal((await getZoneIntelligence("pancoran", signal)).facts[0].value, 0);
    payload = { is_sample: true, facts: [{ metric: "company_count", value: "bad" }], places: [] };
    await assert.rejects(getZoneIntelligence("pancoran", signal), /Invalid region data/);
    context.mock.restoreAll();
});
