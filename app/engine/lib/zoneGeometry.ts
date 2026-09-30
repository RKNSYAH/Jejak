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

// "Kota Administrasi Jakarta Selatan", "Kota Adm. Jakarta Selatan" and "Jakarta Selatan" share a key.
// "Kota " stays otherwise, so Kota Bekasi and Kabupaten Bekasi (BIG: "Bekasi") remain distinct.
export function cityKey(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ")
        .replace(/^((kota|kabupaten|kab\.)\s+)?(administrasi|adm\.)\s+/, "")
        .replace(/^(kabupaten|kab\.)\s+/, "");
}

// BIG spaces and punctuates district names differently ("Asem Rowo", "Pal Merah", "Kepulauan Seribu Selatan.").
export function districtKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesCity(providerCity: string, requestedCity: string): boolean {
    const providerKey = cityKey(providerCity);
    const requestedKey = cityKey(requestedCity);
    if (providerKey === requestedKey) return true;
    // Catalogue shorthand like "Bandung" may mean BIG's "Kota Bandung".
    // Never apply this alias to an explicitly named kabupaten or kota.
    const explicitType = /^(kota|kabupaten|kab\.)\s+/i.test(requestedCity.trim());
    return !explicitType && providerKey === `kota ${requestedKey}`;
}

export function normalizeGeometry(value: unknown, zone: Zone): ZoneGeometry {
    if (!isRecord(value) || value.type !== "FeatureCollection" || !Array.isArray(value.features)) {
        throw new Error("Invalid boundary response");
    }
    const zoneName = districtKey(zone.zone_name);
    const matches = value.features.map((feature) => {
        if (!isRecord(feature) || feature.type !== "Feature" || !isBoundary(feature.geometry) || !isRecord(feature.properties)) {
            throw new Error("Invalid zone boundary");
        }
        return { geometry: feature.geometry, properties: feature.properties };
    }).filter(({ properties }) => districtKey(String(properties.WADMKC ?? "")) === zoneName &&
        matchesCity(String(properties.WADMKK ?? ""), zone.city_name));
    if (value.features.length === 0) throw new Error("No boundary found for the requested zone");
    if (matches.length === 0) throw new Error("Boundary does not match the requested zone");
    // A shorthand must not silently combine a kota and kabupaten of the same name.
    const cities = new Set(matches.map(({ properties }) => cityKey(String(properties.WADMKK ?? ""))));
    if (cities.size > 1) throw new Error("Boundary matches multiple administrative areas");
    return {
        type: "FeatureCollection",
        features: matches.map((feature, index) => {
            const properties = feature.properties;
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
