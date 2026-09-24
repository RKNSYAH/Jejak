import type { MultiPolygon, Polygon, Position } from "geojson";
import type { Zone, ZoneGeometry } from "../types";

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPosition(value: unknown): value is Position {
    return Array.isArray(value) && value.length >= 2 &&
        value.every((number) => typeof number === "number" && Number.isFinite(number)) &&
        Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

function isRing(value: unknown): value is Position[] {
    if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false;
    const first = value[0];
    const last = value[value.length - 1];
    return first[0] === last[0] && first[1] === last[1];
}

function isPolygonCoordinates(value: unknown): value is Position[][] {
    return Array.isArray(value) && value.length > 0 && value.every(isRing);
}

export function isBoundary(value: unknown): value is Polygon | MultiPolygon {
    if (!isRecord(value)) return false;
    if (value.type === "Polygon") return isPolygonCoordinates(value.coordinates);
    return value.type === "MultiPolygon" && Array.isArray(value.coordinates) &&
        value.coordinates.length > 0 && value.coordinates.every(isPolygonCoordinates);
}

export function normalizeGeometry(value: unknown, zone: Zone): ZoneGeometry {
    if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
        throw new Error("Invalid boundary response");
    }
    return {
        type: "FeatureCollection",
        features: value.features.map((feature, index) => {
            if (!isRecord(feature) || feature.type !== "Feature" || !isBoundary(feature.geometry) || !isRecord(feature.properties)) {
                throw new Error("Invalid zone boundary");
            }
            const properties = feature.properties;
            const name = String(properties.WADMKC ?? "").trim().toLowerCase();
            const city = String(properties.WADMKK ?? "").replace(/^kota (administrasi|adm\.)\s+/i, "").trim().toLowerCase();
            if (name !== zone.zone_name.toLowerCase() || city !== zone.city_name.toLowerCase()) {
                throw new Error("Boundary does not match the requested zone");
            }
            return {
                type: "Feature",
                id: `${zone.zone_id}-${index}`,
                geometry: feature.geometry,
                properties: {
                    zone_id: zone.zone_id,
                    zone_name: zone.zone_name,
                    source_region_code: properties.KDCBPS == null ? undefined : String(properties.KDCBPS),
                },
            };
        }),
    };
}

export function getGeometryBounds(geometry: ZoneGeometry): [[number, number], [number, number]] | null {
    let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
    for (const feature of geometry.features) {
        const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
        for (const polygon of polygons) {
            for (const ring of polygon) {
                for (const [longitude, latitude] of ring) {
                    west = Math.min(west, longitude);
                    south = Math.min(south, latitude);
                    east = Math.max(east, longitude);
                    north = Math.max(north, latitude);
                }
            }
        }
    }
    return Number.isFinite(west) ? [[west, south], [east, north]] : null;
}
