import assert from "node:assert/strict";
import { test } from "node:test";
import { estimatePlanningReach, planningReachBand, planningDistrictData, planningDistrictPoints, planningDistanceLabel, pointDistanceKm } from "../app/engine/onboarding/planningReach";
import type { Polygon } from "geojson";
import { getGeometryBounds } from "../app/engine/lib/zoneGeometry";
import type { ZoneGeometry } from "../app/engine/types";
import { evaluateLiveOnboarding, formPreviewPreferences, profilePreviewPreferences } from "../app/engine/onboarding/livePreview";
import { buildFormRelocationProfile } from "../app/engine/lib/relocationProfile";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import type { OnboardingArea, OnboardingCity } from "../app/engine/onboarding/types";

const preferences = { ...formPreviewPreferences(initialFormAnswers), transport: "car" as const,
    destinationPoint: [106.82, -6.24] as [number, number], commuteMinutes: 45 };

test("planning reach exposes assumptions and changes with transport and time", () => {
    const car = estimatePlanningReach(preferences, [])!;
    assert.equal(car.basis, "distance_speed_assumptions");
    assert.equal(car.allowanceMinutes, 2);
    assert.deepEqual(car.speedKmh, [10, 20]);
    assert.ok(Math.abs(car.radiusKm.high - (43 / 60 * 20 / 1.4)) < 0.00001);
    const motorcycle = estimatePlanningReach({ ...preferences, transport: "motorcycle" }, [])!;
    assert.ok(motorcycle.radiusKm.high > car.radiusKm.high);
    const walking = estimatePlanningReach({ ...preferences, transport: "active" }, [])!;
    const shorter = estimatePlanningReach({ ...preferences, transport: "active", commuteMinutes: 15 }, [])!;
    assert.equal(walking.radiusKm.high, shorter.radiusKm.high * 3);
    assert.equal(walking.allowanceMinutes, 0);
    const transit = estimatePlanningReach({ ...preferences, transport: "transit" }, [])!;
    assert.equal(transit.allowanceMinutes, 10);
    assert.equal(transit.basis, "distance_speed_assumptions");
});

test("midday departure reaches farther than morning; walking is unaffected", () => {
    const morning = estimatePlanningReach({ ...preferences, departure: "morning" }, [])!;
    const midday = estimatePlanningReach({ ...preferences, departure: "midday" }, [])!;
    assert.deepEqual(midday.speedKmh, [13, 25]);
    assert.ok(midday.radiusKm.high > morning.radiusKm.high && midday.radiusKm.low > morning.radiusKm.low);
    assert.deepEqual(estimatePlanningReach({ ...preferences, departure: "flexible" }, [])?.radiusKm, morning.radiusKm);
    const walk = { ...preferences, transport: "active" as const };
    assert.deepEqual(estimatePlanningReach({ ...walk, departure: "midday" }, [])?.radiusKm, estimatePlanningReach({ ...walk, departure: "morning" }, [])?.radiusKm);
});

test("geodesic polygons are closed and maintain radius in all three metros", () => {
    for (const destinationPoint of [[106.82, -6.24], [107.61, -6.91], [112.75, -7.25]] as [number, number][]) {
        const reach = estimatePlanningReach({ ...preferences, destinationPoint }, [])!;
        assert.equal(reach.geometry.features.length, 2);
        for (const feature of reach.geometry.features) {
            const ring = feature.geometry.coordinates[0];
            assert.equal(ring.length, 97);
            assert.deepEqual(ring[0], ring.at(-1));
            for (const point of ring) {
                assert.ok(Math.abs(pointDistanceKm(destinationPoint, point as [number, number]) - reach.radiusKm[feature.properties.band]) < 0.000001);
            }
        }
    }
});

test("district labels use only known center points, never the entire kecamatan", () => {
    const reach = estimatePlanningReach({ ...preferences, transport: "active" }, [])!;
    assert.equal(planningReachBand(preferences.destinationPoint, reach), "near");
    assert.equal(planningReachBand([106.8, -6.25], reach), "edge");
    assert.equal(planningReachBand([106.7, -6.25], reach), "outside");
    assert.equal(planningReachBand(null, reach), "unknown");
    assert.equal(planningReachBand(preferences.destinationPoint, null), "unknown");
});

test("a district whose boundary touches the circle counts as edge even when its center is outside", () => {
    const reach = estimatePlanningReach({ ...preferences, transport: "active", commuteMinutes: 15 }, [])!; // ~0.6–1.0 km
    const [lon, lat] = preferences.destinationPoint;
    const box = (west: number, east: number, size = 0.01): Polygon => ({ type: "Polygon", coordinates: [[
        [lon + west, lat - size], [lon + east, lat - size], [lon + east, lat + size], [lon + west, lat + size], [lon + west, lat - size]]] });
    const farCenter: [number, number] = [lon + 0.05, lat];
    assert.equal(planningReachBand(farCenter, reach), "outside");
    assert.equal(planningReachBand(farCenter, reach, [box(0.007, 0.03)]), "edge"); // west edge ~0.8 km away
    assert.equal(planningReachBand(farCenter, reach, [box(0.02, 0.03)]), "outside"); // ~2.2 km away
    assert.equal(planningReachBand(farCenter, reach, [box(-0.1, 0.1, 0.1)]), "edge"); // destination inside, no edge near
    assert.equal(planningReachBand(null, reach, [box(0.007, 0.03)]), "edge");
    assert.equal(planningReachBand(null, reach, [box(0.02, 0.03)]), "unknown");
    assert.equal(planningReachBand(preferences.destinationPoint, reach, [box(0.02, 0.03)]), "near");
});

test("missing destination, mode or time does not invent reach; endpoint allowance is bounded", () => {
    for (const overrides of [{ destinationPoint: null }, { transport: null }, { commuteMinutes: null },
        { commuteMinutes: 0 }, { commuteMinutes: -1 }, { commuteMinutes: Infinity }, { commuteMinutes: 241 }]) {
        assert.equal(estimatePlanningReach({ ...preferences, ...overrides }, []), null);
    }
    const insufficient = estimatePlanningReach({ ...preferences, commuteMinutes: 1 }, [])!;
    assert.equal(insufficient.radiusKm.high, 0);
    assert.equal(insufficient.geometry.features.length, 0);
    assert.equal(planningReachBand(preferences.destinationPoint, insufficient), "outside");
});

test("database campus destination resolves without a journey service", () => {
    const reach = estimatePlanningReach({ ...preferences, destinationPoint: null, destinationId: "campus" }, [{
        id: "campus", name: "Kampus", center: [107.61, -6.91], source: "Direktori", source_url: null, is_sample: false,
    }]);
    assert.deepEqual(reach?.destination, [107.61, -6.91]);
});

test("estimated areas are linked to shared previews but never become measured commute fit", () => {
    const city: OnboardingCity = { city_id: "jakarta-selatan", city_name: "Jakarta Selatan", district_count: 1,
        center: preferences.destinationPoint, is_sample: false };
    const area: OnboardingArea = { zone_id: "a", zone_name: "A", city_id: city.city_id, city_name: city.city_name,
        center: preferences.destinationPoint, is_sample: true, facts: [], campuses: [], transit_stop_count: 0, living_cost: null };
    const input = { cities: [city], areas: [area], destinations: [] };
    const preview = evaluateLiveOnboarding({ ...preferences, monthlyBudget: null, maximumRent: null,
        weights: { mobility: 100, opportunity: 0, affordability: 0, environment: 0 } }, 4, input);
    assert.ok(preview.planningReach);
    assert.equal(preview.districts[0].reachBand, "near");
    assert.equal(preview.districts[0].commuteMinutes, null);
    assert.equal(preview.districts[0].eligible, null);
    assert.equal(preview.districts[0].score, null);
    assert.equal(preview.commuteAvailable, false);
    assert.equal(preview.is_sample, true);
    assert.equal(evaluateLiveOnboarding(preferences, 2, input).planningReach, null);
    assert.equal(evaluateLiveOnboarding({ ...preferences, destinationPoint: null }, 4, input).planningReach, null);
});

test("confirmed profile and form produce identical planning geometry", () => {
    const cities: OnboardingCity[] = [{ city_id: "jakarta-selatan", city_name: "Jakarta Selatan", district_count: 1,
        center: preferences.destinationPoint, is_sample: false }];
    for (const transport of ["car", "motorcycle", "active", "transit"] as const) {
        const answers = { ...initialFormAnswers, transport, destinationPoint: preferences.destinationPoint, destinationName: "Kantor", destinationId: null };
        const saved = buildFormRelocationProfile(answers);
        const confirmed = profilePreviewPreferences(saved, cities)!;
        assert.deepEqual(estimatePlanningReach(confirmed, []), estimatePlanningReach(formPreviewPreferences(answers), []));
    }
});

test("reach geometry bounds include both labeled radii for camera framing", () => {
    const reach = estimatePlanningReach(preferences, [])!;
    const bounds = getGeometryBounds(reach.geometry)!;
    for (const feature of reach.geometry.features) for (const [longitude, latitude] of feature.geometry.coordinates[0]) {
        assert.ok(longitude >= bounds[0][0] && longitude <= bounds[1][0]);
        assert.ok(latitude >= bounds[0][1] && latitude <= bounds[1][1]);
    }
    assert.equal(planningDistanceLabel(reach.radiusKm.low), "5,1 km");
    assert.equal(planningDistanceLabel(reach.radiusKm.high), "10,2 km");
});

test("map polygons use exactly list classifications; missing boundaries and centers stay missing", () => {
    const areas: OnboardingArea[] = [
        { zone_id: "near", zone_name: "Near", city_id: "jakarta-selatan", city_name: "Jakarta Selatan", center: preferences.destinationPoint,
            is_sample: false, facts: [], campuses: [], transit_stop_count: 0, living_cost: null },
        { zone_id: "edge", zone_name: "Edge", city_id: "jakarta-selatan", city_name: "Jakarta Selatan", center: [106.8, -6.25],
            is_sample: true, facts: [], campuses: [], transit_stop_count: 0, living_cost: null },
        { zone_id: "outside", zone_name: "Outside", city_id: "jakarta-selatan", city_name: "Jakarta Selatan", center: [106.7, -6.25],
            is_sample: false, facts: [], campuses: [], transit_stop_count: 0, living_cost: null },
        { zone_id: "unknown", zone_name: "Unknown", city_id: "jakarta-selatan", city_name: "Jakarta Selatan", center: null,
            is_sample: false, facts: [], campuses: [], transit_stop_count: 0, living_cost: null },
    ];
    const preview = evaluateLiveOnboarding({ ...preferences, transport: "active" }, 4, { cities: [], areas, destinations: [] });
    const geometry: ZoneGeometry = { type: "FeatureCollection", features: areas.map((area) => ({
        type: "Feature", properties: { zone_id: area.zone_id, zone_name: area.zone_name },
        geometry: { type: "Polygon", coordinates: [[[106.7, -6.3], [106.9, -6.3], [106.9, -6.2], [106.7, -6.3]]] },
    })) };
    const polygons = planningDistrictData(geometry, preview.districts);
    assert.deepEqual(polygons.features.map((feature) => feature.properties.reach_band), ["near", "edge", "outside", "unknown"]);
    assert.equal(planningDistrictPoints(preview.districts).features.length, 3);
    assert.equal(planningDistrictData(null, preview.districts).features.length, 0);
    // Hidden-budget or other-metro districts cannot retain stale polygon highlights.
    assert.deepEqual(planningDistrictData(geometry, [preview.districts[1]]).features.map((feature) => feature.properties.zone_id), ["edge"]);
    assert.equal(planningDistrictData(geometry, []).features.length, 0);
});
