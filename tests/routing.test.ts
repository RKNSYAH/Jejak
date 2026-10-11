import assert from "node:assert/strict";
import { test } from "node:test";
import { spyOn } from "bun:test";
import { parseCommuteRequest, routingRegion } from "../app/engine/routing/validation";
import { getCommuteEstimates } from "../app/engine/controller/commuteController";
import { parseTransitPlan, transitQuery } from "../app/engine/routing/otp";
import { roadOptions } from "../app/engine/routing/valhalla";
import { summarizeJourneys, meetingTravelCost } from "../app/engine/routing/estimates";
import { decodePolyline } from "../app/engine/routing/polyline";
import { districtRoutingOrigins, insideBoundary, scenarioDeparture } from "../app/engine/routing/sampling";
import { evaluateLiveOnboarding, formPreviewPreferences } from "../app/engine/onboarding/livePreview";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import type { CommuteRequest, RoutingPoint, SampleJourney } from "../app/engine/routing/types";
import type { RoutingConfig } from "../app/engine/routing/config";
import type { OnboardingArea } from "../app/engine/onboarding/types";
import { POST } from "../app/api/onboarding/commute/route";
import * as auth from "../app/engine/controller/userServerController";
import { postJson } from "./helpers";

const origin: RoutingPoint = [106.8, -6.25], destination: RoutingPoint = [106.82, -6.24];
const request: CommuteRequest = { origins: [{ id: "a", points: [origin] }], destination, mode: "car",
    departureAt: null, maxMinutes: 45, selectedOriginId: null, includeReach: false };
const config = (name: string): RoutingConfig => ({ roadUrl: `http://router.test/${name}`, transitUrl: `http://transit.test/${name}`,
    osmSha256: "a".repeat(64), gtfsSha256: "b".repeat(64), osmDate: null, gtfsDate: null });
const sample = (seconds: number | null): SampleJourney => ({ origin, status: seconds === null ? "unavailable" : "ok", seconds,
    networkSeconds: seconds, overheadSeconds: 0, distanceMeters: null, costIdr: null });
const geometry = { type: "Polygon" as const, coordinates: [[[106.7, -6.3], [106.9, -6.3], [106.9, -6.2], [106.7, -6.2], [106.7, -6.3]]] };

test("routing validates coordinates, bounded unique groups, mode, and exact Jakarta dates", () => {
    assert.ok(parseCommuteRequest(request));
    for (const patch of [{ mode: "fly" }, { maxMinutes: 0 }, { maxMinutes: 121 }, { destination: [181, 0] },
        { origins: [] }, { origins: [request.origins[0], request.origins[0]] }, { selectedOriginId: "missing" },
        { departureAt: "2026-02-31T07:00:00+07:00" }, { departureAt: "2026-10-05T24:00:00+07:00" },
        { origins: [{ id: "a", points: Array(4).fill(origin) }] }, { origins: Array(121).fill(request.origins[0]) }])
        assert.equal(parseCommuteRequest({ ...request, ...patch }), null);
    assert.ok(parseCommuteRequest({ ...request, departureAt: "2026-10-05T07:00:00+07:00" }));
    assert.equal(routingRegion(origin), "jakarta");
    assert.equal(routingRegion([107.61, -6.91]), "bandung");
    assert.equal(routingRegion([112.75, -7.25]), "surabaya");
    assert.equal(routingRegion([110.36, -7.8]), null);
});

test("disabled services and unversioned inputs stay unavailable without any fetch", async (context) => {
    let calls = 0;
    context.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({}); });
    const disabled = await getCommuteEstimates(request, undefined, { ...config("disabled"), roadUrl: null });
    assert.equal(disabled.estimates[0].status, "unavailable");
    const unversioned = await getCommuteEstimates(request, undefined, { ...config("disabled"), osmSha256: null });
    assert.equal(unversioned.provenance, null);
    assert.equal(calls, 0);
});

for (const [region, point] of Object.entries({ jakarta: origin, bandung: [107.61, -6.91], surabaya: [112.75, -7.25] })) {
    test(`${region} road matrix goes FROM homes TO destination and adds endpoint allowance once`, async (context) => {
        let body: Record<string, unknown> | null = null;
        context.mock.method(globalThis, "fetch", async (_url: string | URL | Request, options?: RequestInit) => {
            body = JSON.parse(options!.body as string);
            return Response.json({ sources_to_targets: [[{ from_index: 0, to_index: 0, time: 600, distance: 5 }]] });
        });
        const local = { ...request, origins: [{ id: "a", points: [point as RoutingPoint] }], destination: [point[0] + 0.01, point[1]] as RoutingPoint };
        const result = await getCommuteEstimates(local, undefined, config(region));
        assert.deepEqual(body!.sources, [{ lon: point[0], lat: point[1], radius: 20, search_cutoff: 100, rank_candidates: true }]);
        assert.deepEqual(body!.targets, [{ lon: point[0] + 0.01, lat: point[1], radius: 20, search_cutoff: 100, rank_candidates: true }]);
        assert.equal(result.estimates[0].samples[0].seconds, 720);
        assert.deepEqual(result.estimates[0].minutes, { low: 12, high: 12 });
        assert.equal(result.provenance?.timing, "road_model");
        assert.equal(result.estimates[0].samples[0].costIdr, null);
    });
}

test("reverse reach subtracts endpoint time and preserves polygon holes", async (context) => {
    let reachBody: Record<string, unknown> | null = null;
    context.mock.method(globalThis, "fetch", async (url: string | URL | Request, options?: RequestInit) => {
        const body = JSON.parse(options!.body as string);
        if (String(url).endsWith("/isochrone")) {
            reachBody = body;
            return Response.json({ type: "FeatureCollection", features: [{ type: "Feature", geometry, properties: {} }] });
        }
        return Response.json({ sources_to_targets: [[{ from_index: 0, to_index: 0, time: 600, distance: 5 }]] });
    });
    const result = await getCommuteEstimates({ ...request, includeReach: true }, undefined, config("reach"));
    assert.equal(reachBody!.reverse, true);
    assert.deepEqual(reachBody!.contours, [{ time: 43 }]);
    assert.deepEqual(result.reach?.features[0].geometry, geometry);
});

test("matrix null pairs mean no route; malformed or failed batches never become zero", async (context) => {
    context.mock.method(globalThis, "fetch", async () => Response.json({ sources_to_targets: [[{ from_index: 0, to_index: 0, time: null, distance: null }]] }));
    const result = await getCommuteEstimates(request, undefined, config("unreachable"));
    assert.equal(result.estimates[0].status, "no_route");
    assert.equal(result.estimates[0].minutes, null);
});

test("embedded road error with HTTP 200 is unavailable, not a successful commute", async (context) => {
    context.mock.method(globalThis, "fetch", async () => Response.json({ error_code: 442, error: "No path" }));
    const result = await getCommuteEstimates(request, undefined, config("embedded-error"));
    assert.equal(result.estimates[0].status, "unavailable");
    assert.ok(result.warnings.includes("matrix_failed"));
});

test("motorcycle uses access-aware scooter costing without bypassing restrictions", () => {
    const options = roadOptions("motorcycle");
    assert.equal(options.costing, "motor_scooter");
    assert.equal(JSON.stringify(options).includes("ignore_access"), false);
    assert.equal(JSON.stringify(options).includes("ignore_oneways"), false);
    assert.equal(roadOptions("active").costing, "pedestrian");
});

test("Bandung and Surabaya transit never fall back to road estimates", async (context) => {
    let calls = 0;
    context.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({}); });
    for (const point of [[107.61, -6.91], [112.75, -7.25]] as RoutingPoint[]) {
        const result = await getCommuteEstimates({ ...request, mode: "transit", destination: point,
            origins: [{ id: "a", points: [point] }], departureAt: "2026-10-05T07:00:00+07:00" }, undefined, config("no-transit"));
        assert.equal(result.estimates[0].status, "outside_coverage");
        assert.equal(result.estimates[0].minutes, null);
    }
    assert.equal(calls, 0);
});

test("transit requires an explicit departure scenario", async () => {
    const result = await getCommuteEstimates({ ...request, mode: "transit" }, undefined, config("no-departure"));
    assert.equal(result.estimates[0].status, "departure_required");
    assert.equal(scenarioDeparture("flexible"), null);
    assert.equal(scenarioDeparture("morning", new Date("2026-10-02T12:00:00Z")), "2026-10-05T07:00:00+07:00");
});

function transitResponse() {
    const leg = (mode: string) => ({ mode, distance: 200, duration: 300, legGeometry: { points: "_p~iF~ps|U_ulLnnqC_mqNvxq`@" },
        route: mode === "BUS" ? { shortName: "1", gtfsId: "TJ:1" } : null });
    return { data: { planConnection: { routingErrors: [], edges: [{ node: { start: "2026-10-05T07:05:00+07:00",
        end: "2026-10-05T07:35:00+07:00", duration: 1800, legs: [leg("WALK"), leg("BUS"), leg("WALK")] } }] } } };
}

test("OTP 2.10 query selects exact field names and only loaded bus mode", () => {
    const query = transitQuery(origin, destination, "2026-10-05T07:00:00+07:00");
    assert.match(query, /planConnection\(first: 3/);
    assert.match(query, /earliestDeparture/);
    assert.match(query, /mode: BUS/);
    assert.doesNotMatch(query, /RAIL|distanceMeters|startTime/);
});

test("OTP sums all door-to-door time including initial waiting without per-stop double counting", () => {
    const result = parseTransitPlan(transitResponse(), origin, "2026-10-05T07:00:00+07:00");
    assert.equal(result.journey.seconds, 2100);
    assert.equal(result.journey.networkSeconds, 1800);
    assert.equal(result.journey.overheadSeconds, 300);
    assert.equal(result.geometry?.features.length, 3);
    assert.equal(result.journey.distanceMeters, 600);
});

test("OTP GraphQL errors, outside service, and walking-only results stay distinct", () => {
    assert.throws(() => parseTransitPlan({ errors: [{ message: "bad query" }] }, origin, "2026-10-05T07:00:00+07:00"));
    assert.equal(parseTransitPlan({ data: { planConnection: { edges: [], routingErrors: [{ code: "OUTSIDE_SERVICE_PERIOD" }] } } }, origin,
        "2026-10-05T07:00:00+07:00").journey.status, "no_service");
    const walking = transitResponse();
    walking.data.planConnection.edges[0].node.legs = walking.data.planConnection.edges[0].node.legs.filter((leg) => leg.mode === "WALK");
    assert.equal(parseTransitPlan(walking, origin, "2026-10-05T07:00:00+07:00").journey.status, "no_route");
});

test("partial sampling preserves missing values and meeting totals require BOTH travelers", () => {
    const estimate = summarizeJourneys("a", [sample(600), sample(null), sample(1200)]);
    assert.equal(estimate.status, "partial");
    assert.deepEqual(estimate.minutes, { low: 10, high: 20 });
    assert.equal(meetingTravelCost([sample(600), sample(1200)]).totalSeconds, 1800);
    assert.equal(meetingTravelCost([sample(600), sample(null)]).totalSeconds, null);
});

test("meeting API returns both travelers' endpoint-inclusive costs, not just one", async (context) => {
    context.mock.method(globalThis, "fetch", async () => Response.json({ sources_to_targets: [
        [{ from_index: 0, to_index: 0, time: 600, distance: 5 }], [{ from_index: 1, to_index: 0, time: 1200, distance: 8 }],
    ] }));
    const meeting: CommuteRequest = { ...request, purpose: "meeting", origins: [{ id: "first", points: [origin] },
        { id: "second", points: [[106.81, -6.24]] }] };
    const result = await getCommuteEstimates(meeting, undefined, config("meeting"));
    assert.deepEqual(result.meeting, { travelerIds: ["first", "second"], travelerSeconds: [720, 1320], totalSeconds: 2040, costIdr: null });
    assert.equal(parseCommuteRequest({ ...request, purpose: "meeting" }), null);
});

test("sampling stays within polygon and excludes holes; no boundary means one labeled centroid", () => {
    const area = { zone_id: "a", center: origin } as OnboardingArea;
    const hole = [[106.79, -6.26], [106.81, -6.26], [106.81, -6.24], [106.79, -6.24], [106.79, -6.26]];
    const boundary = { ...geometry, coordinates: [...geometry.coordinates, hole] };
    assert.equal(insideBoundary(origin, boundary), false);
    const origins = districtRoutingOrigins([area], { type: "FeatureCollection", features: [{ type: "Feature", geometry: boundary,
        properties: { zone_id: "a", zone_name: "A" } }] });
    assert.equal(origins[0].points.length, 3);
    assert.ok(origins[0].points.every((point) => insideBoundary(point, boundary)));
    assert.deepEqual(districtRoutingOrigins([area], null)[0].points, [origin]);
});

test("polyline decoding respects engine-specific precision and rejects truncation", () => {
    assert.deepEqual(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@", 5)[0], [-120.2, 38.5]);
    assert.throws(() => decodePolyline("_", 6));
});

test("route estimates affect fit and ranking, but partial, stale and wrong-mode data cannot satisfy limits", async (context) => {
    context.mock.method(globalThis, "fetch", async () => Response.json({ sources_to_targets: [[{ from_index: 0, to_index: 0, time: 600, distance: 5 }]] }));
    const commute = await getCommuteEstimates(request, undefined, config("scoring"));
    const area: OnboardingArea = { zone_id: "a", zone_name: "A", city_id: "jakarta-selatan", city_name: "Jakarta Selatan", center: origin,
        is_sample: false, facts: [], campuses: [], transit_stop_count: 200, living_cost: null };
    const preferences = { ...formPreviewPreferences(initialFormAnswers), monthlyBudget: null, maximumRent: null, destinationPoint: destination,
        transport: "car" as const, commuteMinutes: 15, weights: { mobility: 100, affordability: 0, opportunity: 0, environment: 0 } };
    const input = { cities: [{ city_id: "jakarta-selatan", city_name: "Jakarta Selatan", district_count: 1, center: origin, is_sample: false }],
        areas: [area], destinations: [], commute };
    assert.equal(evaluateLiveOnboarding(preferences, 4, input).districts[0].eligible, true);
    assert.equal(evaluateLiveOnboarding({ ...preferences, commuteMinutes: 5 }, 4, input).districts[0].eligible, false);
    assert.equal(evaluateLiveOnboarding({ ...preferences, transport: "transit" }, 4, input).districts[0].eligible, null);
    const stale = { ...commute, provenance: { ...commute.provenance!, freshness: "stale" as const } };
    assert.equal(evaluateLiveOnboarding(preferences, 4, { ...input, commute: stale }).districts[0].score, null);
    const partial = { ...commute, estimates: [{ ...commute.estimates[0], status: "partial" as const }] };
    assert.equal(evaluateLiveOnboarding(preferences, 4, { ...input, commute: partial }).districts[0].eligible, null);
});

test("commute route rejects invalid/large bodies before routing and denies anonymous users", async () => {
    const mock = spyOn(auth, "getAuthenticatedUserId").mockResolvedValue(null);
    try {
        assert.equal((await POST(postJson("/api/onboarding/commute", "{}", "text/plain"))).status, 415);
        assert.equal((await POST(postJson("/api/onboarding/commute", "{"))).status, 400);
        assert.equal((await POST(postJson("/api/onboarding/commute", "{}"))).status, 400);
        assert.equal((await POST(postJson("/api/onboarding/commute", JSON.stringify({ padding: "x".repeat(70_000) })))).status, 413);
        assert.equal((await POST(postJson("/api/onboarding/commute", JSON.stringify(request)))).status, 403);
    } finally { mock.mockRestore(); }
});
