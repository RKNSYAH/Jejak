import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import { isCentroid } from "../lib/zoneGeometry";
import { previewDestination } from "../routing/sampling";
import type { RoutingPoint } from "../routing/types";
import type { LiveDistrictRecommendation, LivePreviewPreferences, OnboardingCampus, Transport } from "./types";
import type { ZoneGeometry } from "../types";

export type PlanningReachBand = "near" | "edge" | "outside" | "unknown";
export type PlanningReach = {
    basis: "distance_speed_assumptions";
    destination: RoutingPoint;
    mode: Transport;
    minutes: number;
    speedKmh: readonly [number, number];
    allowanceMinutes: number;
    detourFactor: number;
    radiusKm: { low: number; high: number };
    geometry: FeatureCollection<Polygon, { band: "low" | "high" }>;
};

// Declared planning assumptions, not measured city speeds or observed transit service.
const assumptions: Record<Transport, { speedKmh: readonly [number, number]; allowanceMinutes: number; detourFactor: number }> = {
    car: { speedKmh: [10, 20], allowanceMinutes: 2, detourFactor: 1.4 },
    motorcycle: { speedKmh: [15, 30], allowanceMinutes: 2, detourFactor: 1.4 },
    active: { speedKmh: [3, 5], allowanceMinutes: 0, detourFactor: 1.2 },
    transit: { speedKmh: [8, 18], allowanceMinutes: 10, detourFactor: 1.5 },
};
const EARTH_KM = 6371.0088;
const radians = (degrees: number) => degrees * Math.PI / 180;
const degrees = (value: number) => value * 180 / Math.PI;

export function pointDistanceKm(a: RoutingPoint, b: RoutingPoint): number {
    const latA = radians(a[1]), latB = radians(b[1]);
    const h = Math.sin((latB - latA) / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(radians(b[0] - a[0]) / 2) ** 2;
    return 2 * EARTH_KM * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

function circle(center: RoutingPoint, radiusKm: number): Polygon {
    const lat = radians(center[1]), lon = radians(center[0]), arc = radiusKm / EARTH_KM;
    const ring = Array.from({ length: 96 }, (_, index) => {
        const bearing = -index / 96 * 2 * Math.PI; // GeoJSON exterior: counterclockwise.
        const latitude = Math.asin(Math.sin(lat) * Math.cos(arc) + Math.cos(lat) * Math.sin(arc) * Math.cos(bearing));
        const longitude = lon + Math.atan2(Math.sin(bearing) * Math.sin(arc) * Math.cos(lat), Math.cos(arc) - Math.sin(lat) * Math.sin(latitude));
        return [degrees(longitude), degrees(latitude)];
    });
    ring.push([...ring[0]]);
    return { type: "Polygon", coordinates: [ring] };
}

export function estimatePlanningReach(preferences: LivePreviewPreferences, destinations: OnboardingCampus[]): PlanningReach | null {
    const destination = previewDestination(preferences, destinations);
    if (!destination || !isCentroid(destination) || !preferences.transport || preferences.commuteMinutes === null ||
        !Number.isFinite(preferences.commuteMinutes) || preferences.commuteMinutes <= 0 || preferences.commuteMinutes > 240) return null;
    const model = assumptions[preferences.transport];
    const hours = Math.max(0, preferences.commuteMinutes - model.allowanceMinutes) / 60;
    const radiusKm = { low: hours * model.speedKmh[0] / model.detourFactor, high: hours * model.speedKmh[1] / model.detourFactor };
    return {
        basis: "distance_speed_assumptions", destination, mode: preferences.transport, minutes: preferences.commuteMinutes,
        ...model, radiusKm,
        geometry: { type: "FeatureCollection", features: radiusKm.high > 0 ? (["high", "low"] as const).map((band) => ({
            type: "Feature", properties: { band }, geometry: circle(destination, radiusKm[band]),
        })) : [] },
    };
}

export function planningReachBand(center: RoutingPoint | null, reach: PlanningReach | null): PlanningReachBand {
    if (!center || !isCentroid(center) || !reach) return "unknown";
    if (reach.radiusKm.high === 0) return "outside";
    const distance = pointDistanceKm(center, reach.destination);
    return distance <= reach.radiusKm.low ? "near" : distance <= reach.radiusKm.high ? "edge" : "outside";
}

export function planningReachLabel(band: PlanningReachBand): string {
    return { near: "Titik kecamatan dalam perkiraan jangkauan", edge: "Titik kecamatan di tepi perkiraan jangkauan",
        outside: "Titik kecamatan di luar perkiraan jangkauan", unknown: "Lokasi kecamatan belum tersedia" }[band];
}

export function planningRadiusLabel(reach: PlanningReach): string {
    return `${planningDistanceLabel(reach.radiusKm.low).replace(" km", "")}–${planningDistanceLabel(reach.radiusKm.high)}`;
}

export function planningDistanceLabel(km: number): string {
    return `${km.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
}

// Keep the exact same district set and classification on map and list. A highlighted
// polygon represents its database center point, not every address in its boundary.
export function planningDistrictData(geometry: ZoneGeometry | null, districts: LiveDistrictRecommendation[]):
    FeatureCollection<Polygon | MultiPolygon, { zone_id: string; zone_name: string; reach_band: PlanningReachBand }> {
    const byId = new Map(districts.map((item) => [item.district.zone_id, item]));
    return { type: "FeatureCollection", features: geometry?.features.flatMap((feature) => {
        const item = byId.get(feature.properties.zone_id);
        return item ? [{ ...feature, properties: { ...feature.properties, reach_band: item.reachBand } }] : [];
    }) ?? [] };
}

export function planningDistrictPoints(districts: LiveDistrictRecommendation[]):
    FeatureCollection<Point, { zone_id: string; reach_band: PlanningReachBand }> {
    return { type: "FeatureCollection", features: districts.flatMap((item) => item.district.center && isCentroid(item.district.center) ? [{
        type: "Feature", properties: { zone_id: item.district.zone_id, reach_band: item.reachBand },
        geometry: { type: "Point", coordinates: item.district.center },
    }] : []) };
}
