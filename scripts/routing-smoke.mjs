// Real-service checks only. No mock fallback and no source/graph writes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const road = process.env.JEJAK_VALHALLA_URL;
const transit = process.env.JEJAK_OTP_URL;
if (!road) throw new Error("JEJAK_VALHALLA_URL is required. No road service has been tested.");
const manifest = JSON.parse(await readFile(new URL("../ingestion/data/routing/manifest.json", import.meta.url), "utf8"));
assert.equal(manifest.pbf_extent_checked, true, "Run private extraction/extent checks first");
assert.equal(manifest.extract_references_checked, true, "Run extract reference checks first");
assert.equal(process.env.JEJAK_ROUTING_OSM_SHA256, manifest.inputs.osm.sha256, "App hash differs from graph input manifest");
if (transit) assert.equal(process.env.JEJAK_ROUTING_GTFS_SHA256, manifest.inputs.gtfs.sha256, "App GTFS hash differs from graph input manifest");

async function post(base, path, body) {
    const response = await fetch(`${base.replace(/\/$/, "")}${path}`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
    const data = await response.json();
    assert.ok(response.ok && data.error_code === undefined && !data.errors?.length, `Routing service rejected ${path}`);
    return data;
}

const cities = {
    jakarta: [[106.8006, -6.2449], [106.8249, -6.1754]],
    bandung: [[107.6098, -6.8933], [107.6191, -6.9175]],
    surabaya: [[112.7391, -7.2892], [112.7508, -7.2575]],
};
const location = ([lon, lat]) => ({ lon, lat, radius: 20, search_cutoff: 100, rank_candidates: true });
for (const [city, [origin, destination]] of Object.entries(cities)) {
    for (const costing of ["auto", "motor_scooter", "pedestrian"]) {
        const options = { costing, costing_options: { [costing]: costing === "motor_scooter"
            ? { top_speed: 60, use_highways: 0, use_tolls: 0 } : costing === "pedestrian" ? { walking_speed: 4.5 } : {} } };
        const matrix = await post(road, "/sources_to_targets", { ...options, sources: [location(origin)], targets: [location(destination)], verbose: true });
        const pair = matrix.sources_to_targets?.[0]?.[0];
        assert.ok(pair && pair.from_index === 0 && pair.to_index === 0 && Number.isFinite(pair.time) && pair.time > 0, `${city}/${costing}: no matrix route`);
        const route = await post(road, "/route", { ...options, locations: [location(origin), location(destination)], shape_format: "polyline6" });
        assert.ok(route.trip?.status === 0 && route.trip.legs?.length && route.trip.legs.every((leg) => typeof leg.shape === "string"), `${city}/${costing}: invalid geometry`);
        const reach = await post(road, "/isochrone", { ...options, locations: [location(destination)], contours: [{ time: 30 }],
            reverse: true, polygons: true, denoise: 0, generalize: 30 });
        assert.ok(reach.type === "FeatureCollection" && reach.features?.length &&
            reach.features.every((feature) => ["Polygon", "MultiPolygon"].includes(feature.geometry?.type)), `${city}/${costing}: no reverse reach`);
        console.log(`${city}/${costing}: network ${Math.ceil(pair.time / 60)} min; route and reverse reach returned`);
    }
}

if (transit) {
    const departure = process.env.JEJAK_ROUTING_SMOKE_DEPARTURE;
    if (!departure || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/.test(departure))
        throw new Error("Set JEJAK_ROUTING_SMOKE_DEPARTURE to an active GTFS service date/time (+07:00)");
    const [origin, destination] = cities.jakarta;
    const coordinate = ([longitude, latitude]) => `location: { coordinate: { latitude: ${latitude}, longitude: ${longitude} } }`;
    const plan = await post(transit, "/otp/gtfs/v1", { operationName: "commute", query: `query commute {
        planConnection(first: 3, origin: { ${coordinate(origin)} }, destination: { ${coordinate(destination)} },
          dateTime: { earliestDeparture: ${JSON.stringify(departure)} }, modes: { direct: [WALK], transit: { transit: [{ mode: BUS }] } }) {
          routingErrors { code } edges { node { start end duration legs { mode distance legGeometry { points } } } }
        }
    }` });
    const itinerary = plan.data?.planConnection?.edges?.map((edge) => edge.node).find((node) => node.legs.some((leg) => leg.mode === "BUS"));
    assert.ok(itinerary, "No TransJakarta itinerary; inspect service dates/coverage and routingErrors");
    const seconds = (Date.parse(itinerary.end) - Date.parse(departure)) / 1000;
    assert.ok(Number.isFinite(seconds) && seconds > 0 && itinerary.legs.every((leg) => typeof leg.legGeometry?.points === "string"));
    console.log(`Jakarta TransJakarta+walking: ${Math.ceil(seconds / 60)} min including initial wait; ${itinerary.legs.length} legs`);
} else {
    console.log("Transit NOT tested: JEJAK_OTP_URL is unset.");
}
console.log("Service sanity checks passed. Accuracy, access legality, one-way fixtures, and deployed UI tests still need review.");
