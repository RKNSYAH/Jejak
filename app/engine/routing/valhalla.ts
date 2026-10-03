import "server-only";
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import { isBoundary, isRecord } from "../lib/zoneGeometry";
import type { Transport } from "../onboarding/types";
import type { RoutingPoint, SampleJourney } from "./types";
import { routerJson } from "./http";
import { decodePolyline } from "./polyline";

export function roadOptions(mode: Exclude<Transport, "transit">) {
    const costing = mode === "active" ? "pedestrian" : mode === "motorcycle" ? "motor_scooter" : "auto";
    return { costing, costing_options: { [costing]: mode === "motorcycle"
        ? { top_speed: 60, use_highways: 0, use_tolls: 0 } : mode === "active" ? { walking_speed: 4.5 } : {} } };
}

// Explicit planning allowance at the two endpoints, never at every road node/stop.
export function roadOverhead(mode: Transport): number { return mode === "active" ? 0 : 120; }
// Pinned 3.9 parser uses meters here. Do not silently snap a lake/island probe 35 km away.
const location = ([lon, lat]: RoutingPoint) => ({ lon, lat, radius: 20, search_cutoff: 100, rank_candidates: true });

export async function roadMatrix(url: string, version: string, origins: RoutingPoint[], destination: RoutingPoint,
    mode: Exclude<Transport, "transit">, signal: AbortSignal): Promise<SampleJourney[]> {
    const response = await routerJson(`${url}/sources_to_targets`, {
        sources: origins.map(location), targets: [location(destination)], ...roadOptions(mode), verbose: true, units: "kilometers",
    }, version, signal);
    if (!isRecord(response) || !Array.isArray(response.sources_to_targets) || response.sources_to_targets.length !== origins.length)
        throw new Error("INVALID_ROAD_MATRIX");
    const matrix = response.sources_to_targets;
    return origins.map((origin, index) => {
        const row = matrix[index];
        const pair = Array.isArray(row) && row.length === 1 ? row[0] : null;
        if (!isRecord(pair) || pair.from_index !== index || pair.to_index !== 0) throw new Error("INVALID_ROAD_MATRIX");
        const overheadSeconds = roadOverhead(mode);
        if (pair.time === null && pair.distance === null) return { origin, status: "no_route", seconds: null,
            networkSeconds: null, overheadSeconds, distanceMeters: null, costIdr: null };
        if (typeof pair.time !== "number" || !Number.isFinite(pair.time) || pair.time < 0 ||
            typeof pair.distance !== "number" || !Number.isFinite(pair.distance) || pair.distance < 0) throw new Error("INVALID_ROAD_MATRIX");
        return { origin, status: "ok", seconds: pair.time + overheadSeconds, networkSeconds: pair.time,
            overheadSeconds, distanceMeters: pair.distance * 1000, costIdr: null };
    });
}

export async function roadGeometry(url: string, version: string, origin: RoutingPoint, destination: RoutingPoint,
    mode: Exclude<Transport, "transit">, signal: AbortSignal): Promise<FeatureCollection<LineString>> {
    const response = await routerJson(`${url}/route`, { locations: [location(origin), location(destination)],
        ...roadOptions(mode), units: "kilometers", shape_format: "polyline6" }, version, signal);
    if (!isRecord(response) || !isRecord(response.trip) || response.trip.status !== 0 || !Array.isArray(response.trip.legs))
        throw new Error("INVALID_ROAD_ROUTE");
    const features = response.trip.legs.map((leg) => {
        if (!isRecord(leg) || typeof leg.shape !== "string") throw new Error("INVALID_ROAD_ROUTE");
        return { type: "Feature" as const, properties: { mode }, geometry: {
            type: "LineString" as const, coordinates: decodePolyline(leg.shape, 6),
        } };
    });
    if (!features.length) throw new Error("INVALID_ROAD_ROUTE");
    return { type: "FeatureCollection", features };
}

export async function roadReach(url: string, version: string, destination: RoutingPoint, mode: Exclude<Transport, "transit">,
    minutes: number, signal: AbortSignal): Promise<FeatureCollection<Polygon | MultiPolygon> | null> {
    // Subtract the SAME endpoint allowance used by matrix estimates.
    const networkMinutes = minutes - roadOverhead(mode) / 60;
    if (networkMinutes <= 0) return null;
    const response = await routerJson(`${url}/isochrone`, { locations: [location(destination)], ...roadOptions(mode),
        contours: [{ time: networkMinutes }], polygons: true, reverse: true, denoise: 0, generalize: 30 }, version, signal);
    if (!isRecord(response) || response.type !== "FeatureCollection" || !Array.isArray(response.features) || !response.features.length)
        throw new Error("INVALID_ROAD_REACH");
    const features = response.features.map((feature) => {
        if (!isRecord(feature) || feature.type !== "Feature" || !isBoundary(feature.geometry)) throw new Error("INVALID_ROAD_REACH");
        return { type: "Feature" as const, geometry: feature.geometry as Polygon | MultiPolygon,
            properties: { minutes, estimated: true, direction: "to_destination" } };
    });
    return { type: "FeatureCollection", features };
}
