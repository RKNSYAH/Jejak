import type { FeatureCollection, MultiPolygon, Point, Polygon, Position } from "geojson";
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
type PlanePoint = [number, number];

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
    // The base speeds are rush-hour speeds, so a midday departure reaches farther. Walking ignores traffic.
    const speedKmh = preferences.departure === "midday" && preferences.transport !== "active"
        ? model.speedKmh.map((speed) => Math.round(speed * 1.25)) as [number, number] : model.speedKmh;
    const hours = Math.max(0, preferences.commuteMinutes - model.allowanceMinutes) / 60;
    const radiusKm = { low: hours * speedKmh[0] / model.detourFactor, high: hours * speedKmh[1] / model.detourFactor };
    return {
        basis: "distance_speed_assumptions", destination, mode: preferences.transport, minutes: preferences.commuteMinutes,
        ...model, speedKmh, radiusKm,
        geometry: { type: "FeatureCollection", features: radiusKm.high > 0 ? (["high", "low"] as const).map((band) => ({
            type: "Feature", properties: { band }, geometry: circle(destination, radiusKm[band]),
        })) : [] },
    };
}

function projectRing(ring: Position[], reach: PlanningReach): PlanePoint[] | null {
    const [lon0, lat0] = reach.destination;
    const kx = 111.32 * Math.cos(radians(lat0)), ky = 110.574;
    const points = ring.map(([longitude, latitude]) => [(longitude - lon0) * kx, (latitude - lat0) * ky] as PlanePoint);
    return points.length >= 3 && points.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) ? points : null;
}

function ringArea(ring: PlanePoint[]): number {
    let area = 0;
    for (let index = 0; index < ring.length; index++) {
        const [x1, y1] = ring[index], [x2, y2] = ring[(index + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area / 2);
}

// Green's theorem gives exact circle overlap for straight polygon edges in the local km projection.
function ringCircleIntersectionArea(ring: PlanePoint[], radius: number): number {
    const radiusSquared = radius * radius;
    let area = 0;
    for (let index = 0; index < ring.length; index++) {
        const [ax, ay] = ring[index], [bx, by] = ring[(index + 1) % ring.length];
        const dx = bx - ax, dy = by - ay;
        const quadratic = dx * dx + dy * dy;
        const roots = [0, 1];
        if (quadratic > 0) {
            const linear = 2 * (ax * dx + ay * dy);
            const constant = ax * ax + ay * ay - radiusSquared;
            const discriminant = linear * linear - 4 * quadratic * constant;
            if (discriminant > 0) {
                const root = Math.sqrt(discriminant);
                for (const t of [(-linear - root) / (2 * quadratic), (-linear + root) / (2 * quadratic)]) {
                    if (t > 0 && t < 1) roots.push(t);
                }
            }
        }
        roots.sort((a, b) => a - b);
        for (let part = 1; part < roots.length; part++) {
            const start = roots[part - 1], end = roots[part];
            const x1 = ax + start * dx, y1 = ay + start * dy;
            const x2 = ax + end * dx, y2 = ay + end * dy;
            const cross = x1 * y2 - x2 * y1;
            const middle = (start + end) / 2;
            const mx = ax + middle * dx, my = ay + middle * dy;
            area += mx * mx + my * my <= radiusSquared
                ? cross / 2
                : radiusSquared * Math.atan2(cross, x1 * x2 + y1 * y2) / 2;
        }
    }
    return Math.abs(area);
}

export function planningReachCoverage(boundaries: (Polygon | MultiPolygon)[], reach: PlanningReach): number | null {
    const radius = reach.radiusKm.high;
    if (!boundaries.length || !Number.isFinite(radius) || radius <= 0) return null;
    let totalArea = 0, coveredArea = 0;
    for (const boundary of boundaries) {
        const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
        for (const polygon of polygons) {
            const rings = polygon.map((ring) => projectRing(ring, reach));
            if (!rings.length || rings.some((ring) => ring === null)) return null;
            const [outer, ...holes] = rings as PlanePoint[][];
            const outerArea = ringArea(outer);
            const holeArea = holes.reduce((sum, ring) => sum + ringArea(ring), 0);
            const polygonArea = outerArea - holeArea;
            if (!Number.isFinite(polygonArea) || polygonArea <= 0) return null;
            totalArea += polygonArea;
            coveredArea += ringCircleIntersectionArea(outer, radius) - holes.reduce((sum, ring) => sum + ringCircleIntersectionArea(ring, radius), 0);
        }
    }
    if (!(totalArea > 0)) return null;
    // Arcs of a ring that never enters the circle cancel to rounding noise (~1e-16), not real overlap.
    const coverage = coveredArea / totalArea;
    return coverage < 1e-9 ? 0 : Math.min(1, coverage);
}

// A district whose center is outside (or unknown) but whose boundary touches the circle still counts as "edge".
export function planningReachBand(center: RoutingPoint | null, reach: PlanningReach | null, boundaries: (Polygon | MultiPolygon)[] = []): PlanningReachBand {
    if (!reach) return "unknown";
    let band: PlanningReachBand = "unknown";
    if (center && isCentroid(center)) {
        const distance = pointDistanceKm(center, reach.destination);
        band = reach.radiusKm.high === 0 ? "outside" : distance <= reach.radiusKm.low ? "near" : distance <= reach.radiusKm.high ? "edge" : "outside";
    }
    const coverage = band !== "near" && band !== "edge" ? planningReachCoverage(boundaries, reach) : null;
    return coverage !== null && coverage > 0 ? "edge" : band;
}

// Fit beyond the reach falls with the log of how many reach radii away a district is, so one extra kilometre
// costs a lot in a tight reach and little in a wide one. A cheap but far district can't buy its way back up.
// ponytail: uses the district's centre point and a fixed zero point; tune REACH_ZERO_RADII with user testing.
const REACH_ZERO_RADII = 10;
export function reachFit(distanceKm: number | null, reach: PlanningReach): number {
    const radius = reach.radiusKm.high;
    if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm <= radius) return 1;
    if (!(radius > 0)) return 0;
    return Math.max(0, 1 - Math.log(distanceKm / radius) / Math.log(REACH_ZERO_RADII));
}

export function planningReachLabel(band: PlanningReachBand): string {
    return { near: "Titik kecamatan dalam perkiraan jangkauan", edge: "Kecamatan di tepi perkiraan jangkauan",
        outside: "Titik kecamatan di luar perkiraan jangkauan", unknown: "Lokasi kecamatan belum tersedia" }[band];
}

export function planningCoverageLabel(coverage: number | null): string | null {
    if (coverage === null || !Number.isFinite(coverage)) return null;
    const percentage = coverage > 0 && coverage < 0.001 ? "<0,1" : (coverage * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 });
    return `Wilayah kecamatan dalam jangkauan perkiraan: ${percentage}%`;
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
