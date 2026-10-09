import "server-only";
import type { FeatureCollection, LineString } from "geojson";
import { isRecord } from "../lib/zoneGeometry";
import type { RoutingPoint, SampleJourney, RouteStatus } from "./types";
import { routerJson } from "./http";
import { decodePolyline } from "./polyline";

// OTP 2.10 GTFS GraphQL schema. Only the TransJakarta feed is loaded.
export function transitQuery(origin: RoutingPoint, destination: RoutingPoint, departureAt: string): string {
    const coordinate = ([longitude, latitude]: RoutingPoint) => `location: { coordinate: { latitude: ${latitude}, longitude: ${longitude} } }`;
    return `query commute { planConnection(first: 3,
        origin: { ${coordinate(origin)} }, destination: { ${coordinate(destination)} },
        dateTime: { earliestDeparture: ${JSON.stringify(departureAt)} },
        modes: { direct: [WALK], transit: { transit: [{ mode: BUS }] } }
    ) { routingErrors { code } edges { node { start end duration legs {
        mode duration distance route { gtfsId shortName }
        legGeometry { points }
    } } } } }`;
}

export function parseTransitPlan(value: unknown, origin: RoutingPoint, departureAt: string): {
    journey: SampleJourney; geometry: FeatureCollection<LineString> | null;
} {
    const missing = (status: RouteStatus) => ({ journey: { origin, status, seconds: null, networkSeconds: null,
        overheadSeconds: 0, distanceMeters: null, costIdr: null } as SampleJourney, geometry: null });
    if (!isRecord(value) || (Array.isArray(value.errors) && value.errors.length) || !isRecord(value.data) ||
        !isRecord(value.data.planConnection) || !Array.isArray(value.data.planConnection.edges) ||
        !Array.isArray(value.data.planConnection.routingErrors)) throw new Error("INVALID_TRANSIT_PLAN");
    const plan = value.data.planConnection;
    const errors = (plan.routingErrors as unknown[]).flatMap((error: unknown) => isRecord(error) && typeof error.code === "string" ? [error.code] : []);
    const candidates = (plan.edges as unknown[]).flatMap((edge: unknown) => isRecord(edge) && isRecord(edge.node) && Array.isArray(edge.node.legs) &&
        edge.node.legs.some((leg: unknown) => isRecord(leg) && leg.mode === "BUS") ? [edge.node] : []);
    if (!candidates.length) return missing(errors.includes("OUTSIDE_SERVICE_PERIOD") ? "no_service" :
        errors.some((code: string) => code === "OUTSIDE_BOUNDS" || code === "LOCATION_NOT_FOUND") ? "outside_coverage" : "no_route");
    const itineraries = candidates.map((node) => {
        if (typeof node.start !== "string" || typeof node.end !== "string" || typeof node.duration !== "number" ||
            !Number.isFinite(node.duration) || node.duration < 0) throw new Error("INVALID_TRANSIT_TIMES");
        const start = Date.parse(node.start), end = Date.parse(node.end), departure = Date.parse(departureAt);
        if (![start, end, departure].every(Number.isFinite) || start < departure || end < start || end - departure > 172_800_000)
            throw new Error("INVALID_TRANSIT_TIMES");
        // Total includes initial wait, walking, transfers, in-vehicle travel and GTFS dwell.
        // Never add 1–2 minutes per stop: the feed already includes those stop times.
        const legs = node.legs as unknown[];
        let distanceMeters = 0;
        const features = legs.map((leg) => {
            if (!isRecord(leg) || !["BUS", "WALK"].includes(String(leg.mode)) || typeof leg.distance !== "number" ||
                !Number.isFinite(leg.distance) || leg.distance < 0 || !isRecord(leg.legGeometry) || typeof leg.legGeometry.points !== "string")
                throw new Error("INVALID_TRANSIT_LEGS");
            distanceMeters += leg.distance;
            return { type: "Feature" as const, properties: { mode: leg.mode, route: isRecord(leg.route) ? leg.route.shortName : null },
                geometry: { type: "LineString" as const, coordinates: decodePolyline(leg.legGeometry.points, 5) } };
        });
        return { journey: { origin, status: "ok" as const, seconds: (end - departure) / 1000, networkSeconds: (end - start) / 1000,
            overheadSeconds: (start - departure) / 1000, distanceMeters, costIdr: null },
            geometry: { type: "FeatureCollection" as const, features } };
    });
    return itineraries.sort((a, b) => a.journey.seconds - b.journey.seconds)[0];
}

export async function transitJourney(url: string, version: string, origin: RoutingPoint, destination: RoutingPoint,
    departureAt: string, signal: AbortSignal) {
    const response = await routerJson(`${url}/otp/gtfs/v1`, {
        query: transitQuery(origin, destination, departureAt), operationName: "commute",
    }, version, signal);
    return parseTransitPlan(response, origin, departureAt);
}
