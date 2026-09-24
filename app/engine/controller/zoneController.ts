import { MOCK_ZONE_INTELLIGENCE_BY_ZONE, SUPPORTED_ZONES } from "@/app/datas/mockData";
import type { ZoneIntelligenceResponse, ZoneListResponse } from "../types";

export const supportedZones = SUPPORTED_ZONES;
export const supportedSector = "software_and_it_services";

// Replace this fixture lookup with a database query when snapshots are available.
export function getZoneSnapshot(zoneId: string, sectorId: string): ZoneIntelligenceResponse | null {
    if (sectorId !== supportedSector) return null;
    return MOCK_ZONE_INTELLIGENCE_BY_ZONE[zoneId] ?? null;
}

export function getZones(cityId: string, sectorId: string): ZoneListResponse {
    return {
        is_sample: true,
        zones: supportedZones.filter((zone) => zone.city_id === cityId).map((zone) => ({
            ...zone,
            intelligence: getZoneSnapshot(zone.zone_id, sectorId),
        })),
    };
}

export function validateZoneQuery(params: URLSearchParams) {
    const cityId = params.get("city_id") ?? "jakarta-selatan";
    const sectorId = params.get("sector_id") ?? supportedSector;
    if (!supportedZones.some((zone) => zone.city_id === cityId)) throw new Error("Unsupported city_id");
    if (sectorId !== supportedSector) throw new Error("Unsupported sector_id");
    return { cityId, sectorId };
}
