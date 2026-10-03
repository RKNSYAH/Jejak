import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { Transport } from "../onboarding/types";

export type RoutingPoint = [number, number]; // longitude, latitude
export type RoutingRegion = "jakarta" | "bandung" | "surabaya";
export type RouteStatus = "ok" | "partial" | "no_route" | "unavailable" | "outside_coverage" | "departure_required" | "no_service";
export type OriginGroup = { id: string; points: RoutingPoint[] };
export type CommuteRequest = {
    purpose?: "district_preview" | "meeting";
    destination: RoutingPoint;
    mode: Transport;
    origins: OriginGroup[];
    departureAt: string | null;
    maxMinutes: number;
    selectedOriginId: string | null;
    includeReach: boolean;
};
export type RouteProvenance = {
    engine: "Valhalla" | "OpenTripPlanner";
    engineVersion: string;
    osmSha256: string;
    gtfsSha256: string | null;
    sources: { name: string; url: string }[];
    snapshotDate: string | null;
    freshness: "unknown" | "stale" | "recent";
    timing: "road_model" | "scheduled_frequency";
    liveTraffic: false;
    liveTransit: false;
    operator: "TransJakarta" | null;
};
export type SampleJourney = {
    origin: RoutingPoint;
    status: RouteStatus;
    seconds: number | null;
    networkSeconds: number | null;
    overheadSeconds: number;
    distanceMeters: number | null;
    costIdr: null; // No verified fares, fuel or parking prices in the loaded inputs.
};
export type CommuteEstimate = {
    id: string;
    status: RouteStatus;
    samples: SampleJourney[];
    minutes: { low: number; high: number } | null;
    geometry: FeatureCollection<LineString> | null;
};
export type CommuteResponse = {
    destination: RoutingPoint;
    mode: Transport;
    departureAt: string | null;
    estimates: CommuteEstimate[];
    reach: FeatureCollection<Polygon | MultiPolygon> | null;
    reachStatus: RouteStatus;
    provenance: RouteProvenance | null;
    warnings: string[];
    meeting: { travelerIds: [string, string]; travelerSeconds: (number | null)[]; totalSeconds: number | null; costIdr: null } | null;
};
