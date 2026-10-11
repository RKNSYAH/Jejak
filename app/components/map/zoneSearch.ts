import type { Zone } from "@/app/engine/types";
import { getMetroArea, getMetroAreaAt, isMetroCity, type MetroAreaId } from "@/app/engine/lib/metroArea";

export type ZoneSearchScope = MetroAreaId;

export function getZoneSearchScope(longitude: number, latitude: number): ZoneSearchScope | null {
    return getMetroAreaAt(longitude, latitude)?.id ?? null;
}

export function getZoneSearchMatches<T extends Zone>(zones: readonly T[], query: string, scope: ZoneSearchScope | null): T[] {
    const area = getMetroArea(scope);
    const term = query.trim().toLowerCase();
    const isLocal = (zone: T) => !!area && isMetroCity(area, zone);
    // Empty input suggests local areas. Typed searches can always reach other cities.
    // Stable partitions preserve the existing ranking within each group and never
    // mutate the catalog shared with the bottom sheet.
    if (!term) return (area ? zones.filter(isLocal) : zones).slice(0, 3);
    const matches = zones.filter((zone) => `${zone.zone_name} ${zone.city_name}`.toLowerCase().includes(term));
    return [...matches.filter(isLocal), ...matches.filter((zone) => !isLocal(zone))].slice(0, 3);
}
