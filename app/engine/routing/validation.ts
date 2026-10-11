import { isCentroid, isRecord } from "../lib/zoneGeometry";
import type { CommuteRequest, RoutingPoint, RoutingRegion } from "./types";

// Metro-sized extracts retain surrounding connections; these are not transit coverage claims.
export const ROUTING_BOUNDS: Record<RoutingRegion, readonly [number, number, number, number]> = {
    jakarta: [106.35, -6.85, 107.4, -5.85],
    bandung: [107.2, -7.35, 108.05, -6.55],
    surabaya: [112.25, -7.85, 113.15, -6.8],
};

export function routingRegion(point: RoutingPoint): RoutingRegion | null {
    return (Object.keys(ROUTING_BOUNDS) as RoutingRegion[]).find((region) => {
        const [west, south, east, north] = ROUTING_BOUNDS[region];
        return point[0] >= west && point[0] <= east && point[1] >= south && point[1] <= north;
    }) ?? null;
}

export function parseCommuteRequest(value: unknown): CommuteRequest | null {
    if (!isRecord(value) || !isCentroid(value.destination) ||
        (value.purpose !== undefined && value.purpose !== "district_preview" && value.purpose !== "meeting") ||
        !["transit", "motorcycle", "car", "active"].includes(String(value.mode)) ||
        !Array.isArray(value.origins) || value.origins.length < 1 || value.origins.length > 120 ||
        typeof value.maxMinutes !== "number" || !Number.isInteger(value.maxMinutes) || value.maxMinutes < 1 || value.maxMinutes > 120 ||
        typeof value.includeReach !== "boolean" ||
        (value.departureAt !== null && (typeof value.departureAt !== "string" ||
            !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+07:00$/.test(value.departureAt) || !Number.isFinite(Date.parse(value.departureAt)))) ||
        (value.selectedOriginId !== null && typeof value.selectedOriginId !== "string")) return null;
    const ids = new Set<string>();
    if (typeof value.departureAt === "string" && new Date(Date.parse(value.departureAt) + 7 * 3_600_000).toISOString().slice(0, 16) !== value.departureAt.slice(0, 16)) return null;
    for (const group of value.origins) {
        if (!isRecord(group) || typeof group.id !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(group.id) || ids.has(group.id) ||
            !Array.isArray(group.points) || group.points.length < 1 || group.points.length > 3 || !group.points.every(isCentroid)) return null;
        ids.add(group.id);
    }
    if (value.selectedOriginId !== null && !ids.has(value.selectedOriginId as string)) return null;
    if (value.purpose === "meeting" && (value.origins.length !== 2 || value.origins.some((group) => group.points.length !== 1))) return null;
    return value as unknown as CommuteRequest;
}
