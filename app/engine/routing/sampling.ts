import type { MultiPolygon, Polygon, Position } from "geojson";
import type { OnboardingArea, LivePreviewPreferences, FormAnswers } from "../onboarding/types";
import type { ZoneGeometry } from "../types";
import type { OriginGroup, RoutingPoint } from "./types";

function inRing(point: RoutingPoint, ring: Position[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const a = ring[i], b = ring[j];
        if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
}

export function insideBoundary(point: RoutingPoint, geometry: Polygon | MultiPolygon): boolean {
    const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    return polygons.some((rings) => inRing(point, rings[0]) && !rings.slice(1).some((ring) => inRing(point, ring)));
}

// Geographic probes, NOT observed housing locations or exhaustive district reachability.
export function districtRoutingOrigins(areas: Pick<OnboardingArea, "zone_id" | "center">[], geometry: ZoneGeometry | null): OriginGroup[] {
    return areas.flatMap((area) => {
        const boundary = geometry?.features.find((feature) => feature.properties.zone_id === area.zone_id)?.geometry;
        if (!boundary) return area.center ? [{ id: area.zone_id, points: [area.center] }] : [];
        const polygons = boundary.type === "Polygon" ? [boundary.coordinates] : boundary.coordinates;
        const candidates: RoutingPoint[] = area.center && insideBoundary(area.center, boundary) ? [area.center] : [];
        for (const rings of polygons) {
            const positions = rings[0];
            let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
            for (const point of positions) {
                west = Math.min(west, point[0]); east = Math.max(east, point[0]);
                south = Math.min(south, point[1]); north = Math.max(north, point[1]);
            }
            for (const x of [0.5, 0.25, 0.75, 0.1, 0.9]) for (const y of [0.5, 0.25, 0.75, 0.1, 0.9]) {
                const point: RoutingPoint = [west + (east - west) * x, south + (north - south) * y];
                if (insideBoundary(point, boundary) && !candidates.some((candidate) => candidate[0] === point[0] && candidate[1] === point[1])) candidates.push(point);
            }
        }
        if (!candidates.length) return [];
        const points = [candidates[0]];
        while (points.length < 3 && points.length < candidates.length) {
            const remaining = candidates.filter((candidate) => !points.includes(candidate));
            const separation = (candidate: RoutingPoint) => Math.min(...points.map((point) => (point[0] - candidate[0]) ** 2 + (point[1] - candidate[1]) ** 2));
            remaining.sort((a, b) => separation(b) - separation(a));
            points.push(remaining[0]);
        }
        return [{ id: area.zone_id, points }];
    });
}

export function previewDestination(preferences: LivePreviewPreferences, destinations: { id: string; center: RoutingPoint }[]): RoutingPoint | null {
    return preferences.destinationPoint ?? destinations.find((item) => item.id === preferences.destinationId)?.center ?? null;
}

// A declared planning scenario, never a prediction of the user's actual departure.
export function scenarioDeparture(period: FormAnswers["departure"] | null | undefined, now = new Date()): string | null {
    if (!period || period === "flexible") return null;
    const local = new Date(now.getTime() + 7 * 3_600_000);
    local.setUTCDate(local.getUTCDate() + 1);
    while (local.getUTCDay() === 0 || local.getUTCDay() === 6) local.setUTCDate(local.getUTCDate() + 1);
    const hour = { morning: "07", midday: "12", evening: "17" }[period];
    return `${local.toISOString().slice(0, 10)}T${hour}:00:00+07:00`;
}
