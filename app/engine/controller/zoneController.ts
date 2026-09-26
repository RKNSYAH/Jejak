import { createClient } from "@/app/engine/lib/server";
import type { RegionFact, RegionPlace, Zone, ZoneDetailResult, ZoneListResponse } from "../types";

export const supportedSector = "software_and_it_services";
const includeSample = process.env.JEJAK_INCLUDE_SAMPLE_DATA !== "false";

export function validateZoneQuery(params: URLSearchParams) {
    const cityId = params.get("city_id");
    const sectorId = params.get("sector_id") ?? supportedSector;
    if (cityId !== null && (cityId.length > 64 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cityId))) {
        throw new Error("Unsupported city_id");
    }
    if (sectorId !== supportedSector) throw new Error("Unsupported sector_id");
    return { cityId, sectorId };
}

type RegionRow = {
    region_code: string;
    region_name: string;
    parent_code: string;
    parent_name: string;
    is_sample: boolean;
};

type RankedRegionRow = RegionRow & {
    average_monthly_wage_idr: string | number | null;
    median_monthly_rent_idr: string | number | null;
    population: string | number | null;
    wage_to_rent_ratio: string | number | null;
};

export type RegionDetailRow = RegionRow & {
    geometry: unknown;
    facts: RegionFact[];
    places: RegionPlace[];
};

export function toZone(row: RegionRow): Zone {
    const name = row.is_sample ? row.region_name.replace(/ \(demo parent\)$/, "") : row.region_name;
    const city = row.is_sample ? row.parent_name.replace(/ \(demo parent\)$/, "") : row.parent_name;
    return { zone_id: row.region_code, zone_name: name, city_id: row.parent_code, city_name: city };
}

function numeric(value: string | number | null): number | null {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export async function getZones(cityId: string | null): Promise<ZoneListResponse> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_map_regions", {
        p_parent_code: cityId,
        p_include_sample: includeSample,
    });
    if (error) throw error;
    const zones = (data as RankedRegionRow[]).map((row) => ({
        ...toZone(row), is_sample: row.is_sample,
        average_monthly_wage_idr: numeric(row.average_monthly_wage_idr),
        median_monthly_rent_idr: numeric(row.median_monthly_rent_idr),
        population: numeric(row.population),
        wage_to_rent_ratio: numeric(row.wage_to_rent_ratio),
    }));
    return { is_sample: zones.some((zone) => zone.is_sample), zones };
}

export async function getZoneRow(zoneId: string): Promise<RegionDetailRow | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_map_region", {
        p_region_code: zoneId,
        p_include_sample: includeSample,
    });
    if (error) throw error;
    return (data as RegionDetailRow[])[0] ?? null;
}

export function toZoneDetails(row: RegionDetailRow): ZoneDetailResult {
    return {
        is_sample: row.is_sample || row.facts.some((fact) => fact.is_sample) || row.places.some((place) => place.is_sample),
        facts: row.facts.map((fact) => ({ ...fact, value: Number(fact.value),
            confidence: fact.confidence == null ? null : Number(fact.confidence) })),
        places: row.places,
    };
}
