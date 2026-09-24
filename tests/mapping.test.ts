import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeGeometry, getGeometryBounds } from "../app/engine/lib/zoneGeometry";
import { createZoneLayerData } from "../app/components/map/zoneLayerData";
import { getZones, supportedZones } from "../app/engine/controller/zoneController";
import { GET as getZoneList } from "../app/api/zones/route";
import { GET as getIntelligence } from "../app/api/zones/[zoneId]/intelligence/route";
import type { ZoneGeometry } from "../app/engine/types";
import { getZoneIntelligence } from "../app/engine/lib/zoneApi";

// Synthetic coordinates are used only to exercise geometry validation, never as map data.
const polygon = { type: "Polygon", coordinates: [[[106, -6], [107, -6], [107, -5], [106, -6]]] };
const boundary = {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: polygon, properties: { WADMKC: "Pancoran", WADMKK: "JAKARTA SELATAN", KDCBPS: "test-code" } }],
};

test("trusted boundaries retain the application ID and separate provider code", () => {
    const geometry = normalizeGeometry(boundary, supportedZones[0]);
    assert.equal(geometry.features[0].properties.zone_id, "pancoran");
    assert.equal(geometry.features[0].properties.source_region_code, "test-code");
    assert.deepEqual(getGeometryBounds(geometry), [[106, -6], [107, -5]]);
    assert.equal(getGeometryBounds({ type: "FeatureCollection", features: [] }), null);
});

test("rejects same-named boundaries in a different city and invalid coordinates", () => {
    const wrongCity = structuredClone(boundary);
    wrongCity.features[0].properties.WADMKK = "Other city";
    assert.throws(() => normalizeGeometry(wrongCity, supportedZones[0]), /does not match/);
    const invalid = structuredClone(boundary);
    invalid.features[0].geometry.coordinates[0][0][0] = 300;
    assert.throws(() => normalizeGeometry(invalid, supportedZones[0]), /Invalid zone boundary/);
    assert.throws(() => normalizeGeometry({ error: { message: "Upstream failed" } }, supportedZones[0]), /Invalid boundary/);
});

test("multi-zone joins preserve independent scores, zero values, and missing snapshots", () => {
    const zones = getZones("jakarta-selatan", "software_and_it_services").zones;
    const base = normalizeGeometry(boundary, supportedZones[0]).features[0];
    const geometry: ZoneGeometry = {
        type: "FeatureCollection",
        features: zones.map((zone) => ({ ...base, properties: { zone_id: zone.zone_id, zone_name: zone.zone_name } })),
    };
    const joined = createZoneLayerData(geometry, Object.fromEntries(zones.map((zone) => [zone.zone_id, zone.intelligence])));
    assert.equal(joined.features.length, 3);
    assert.deepEqual(joined.features.map((feature) => feature.properties.sector_presence), [72, 85, null]);
    assert.deepEqual(joined.features.map((feature) => feature.properties.hiring_activity), [46, 0, null]);
});

test("zone routes distinguish unsupported parameters, missing data and unknown IDs", async () => {
    assert.equal((await getZoneList(new Request("http://localhost/api/zones?city_id=unsupported"))).status, 400);
    assert.equal((await getZoneList(new Request("http://localhost/api/zones?sector_id=unsupported"))).status, 400);
    const list = await getZoneList(new Request("http://localhost/api/zones"));
    assert.equal((await list.json()).is_sample, true);
    const missing = await getIntelligence(new Request("http://localhost/api/zones/mampang-prapatan/intelligence"), {
        params: Promise.resolve({ zoneId: "mampang-prapatan" }),
    });
    assert.deepEqual(await missing.json(), { is_sample: true, intelligence: null });
    const unknown = await getIntelligence(new Request("http://localhost/api/zones/unknown/intelligence"), {
        params: Promise.resolve({ zoneId: "unknown" }),
    });
    assert.equal(unknown.status, 404);
});

test("browser API rejects wrong-zone snapshots and malformed numeric evidence", async (context) => {
    const snapshot = getZones("jakarta-selatan", "software_and_it_services").zones[0].intelligence;
    let payload: unknown = { is_sample: true, intelligence: snapshot };
    context.mock.method(globalThis, "fetch", async () => Response.json(payload));
    const signal = new AbortController().signal;
    await assert.rejects(getZoneIntelligence("setiabudi", signal), /does not match/);
    const invalid = structuredClone(snapshot)!;
    invalid.snapshot.indices.sector_presence = 110;
    payload = { is_sample: true, intelligence: invalid };
    await assert.rejects(getZoneIntelligence("pancoran", signal), /Invalid zone intelligence/);
    payload = { is_sample: true, intelligence: null };
    assert.deepEqual(await getZoneIntelligence("pancoran", signal), payload);
    context.mock.restoreAll();
});
