import type { Zone } from "@/app/engine/types";

export type ZoneSearchScope = "jabodetabek" | "bandung";

// Camera proximity defines a search context, not an administrative boundary.
// Membership uses the catalog's city names/IDs, never fabricated zone geometry.
const searchAreas = [
    {
        scope: "jabodetabek" as const,
        center: [106.8456, -6.2088] as const,
        radiusKm: 80,
        cities: ["jakarta", "jakarta selatan", "jakarta pusat", "jakarta barat", "jakarta timur", "jakarta utara",
            "kepulauan seribu", "bogor", "depok", "tangerang", "tangerang selatan", "bekasi"],
    },
    {
        scope: "bandung" as const,
        center: [107.6191, -6.9175] as const,
        radiusKm: 50,
        cities: ["bandung", "bandung barat", "cimahi"],
    },
];

function distanceKm(longitude: number, latitude: number, center: readonly [number, number]) {
    const radians = Math.PI / 180;
    const a = Math.sin((latitude - center[1]) * radians / 2) ** 2 +
        Math.cos(latitude * radians) * Math.cos(center[1] * radians) *
        Math.sin((longitude - center[0]) * radians / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function getZoneSearchScope(longitude: number, latitude: number): ZoneSearchScope | null {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
    const candidates = searchAreas.map((area) => ({ area, distance: distanceKm(longitude, latitude, area.center) }))
        .filter(({ area, distance }) => distance <= area.radiusKm)
        .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.area.scope ?? null;
}

function normalizeCity(value: string) {
    return value.toLowerCase().replace(/\s*\(demo parent\)\s*$/, "").replace(/[._-]+/g, " ").trim()
        .replace(/^(?:(?:kota|kabupaten|kab|administrasi)\s+)+/, "").replace(/\s+/g, " ");
}

export function getZoneSearchMatches<T extends Zone>(zones: readonly T[], query: string, scope: ZoneSearchScope | null): T[] {
    const area = searchAreas.find((area) => area.scope === scope);
    const term = query.trim().toLowerCase();
    const isLocal = (zone: T) => !!area &&
        (area.cities.includes(normalizeCity(zone.city_name)) || area.cities.includes(normalizeCity(zone.city_id)));
    // Empty input suggests local areas. Typed searches can always reach other cities.
    // Stable partitions preserve the existing ranking within each group and never
    // mutate the catalog shared with the bottom sheet.
    if (!term) return (area ? zones.filter(isLocal) : zones).slice(0, 3);
    const matches = zones.filter((zone) => `${zone.zone_name} ${zone.city_name}`.toLowerCase().includes(term));
    return [...matches.filter(isLocal), ...matches.filter((zone) => !isLocal(zone))].slice(0, 3);
}
