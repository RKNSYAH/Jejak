import { createClient } from "@/app/engine/lib/server";
import { cellLayers, cellMetrics } from "@/app/components/map/mapMetrics";
import { isRegionCode } from "../lib/zoneGeometry";
import type { MapCategory, MapCell, MapCellsResponse, RegionFact, RegionPlace, Zone, ZoneDetailResult, ZoneListResponse } from "../types";

export const supportedSector = "software_and_it_services";
export const includeSample = process.env.JEJAK_INCLUDE_SAMPLE_DATA !== "false";

export function validateZoneQuery(params: URLSearchParams) {
    const cityId = params.get("city_id");
    if (cityId !== null && !isRegionCode(cityId)) throw new Error("Unsupported city_id");
    if ((params.get("sector_id") ?? supportedSector) !== supportedSector) throw new Error("Unsupported sector_id");
    return { cityId };
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
    const name = (value: string) => row.is_sample ? value.replace(/ \(demo parent\)$/, "") : value;
    return { zone_id: row.region_code, zone_name: name(row.region_name), city_id: row.parent_code, city_name: name(row.parent_name) };
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

export async function getZoneRow(zoneId: string, includeGeometry = true): Promise<RegionDetailRow | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_map_region", {
        p_region_code: zoneId,
        p_include_sample: includeSample,
        p_include_geometry: includeGeometry,
    });
    if (error) throw error;
    return (data as RegionDetailRow[])[0] ?? null;
}

export function validateCellQuery(params: URLSearchParams): { zoneId: string; category: MapCategory } {
    const zoneId = params.get("zone_id") ?? "";
    const category = params.get("category") ?? "";
    if (!isRegionCode(zoneId)) throw new Error("Unsupported zone_id");
    if (!Object.hasOwn(cellLayers, category)) throw new Error("Unsupported category");
    return { zoneId, category: category as MapCategory };
}

type MapCellRow = Omit<MapCell, "centroid"> & { centroid: { coordinates: [number, number] } };

export async function getMapCells(zoneId: string, category: MapCategory, includeGeometry: boolean): Promise<MapCellsResponse> {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_map_cells", {
        p_parent_code: zoneId,
        p_metrics: cellMetrics(category),
        p_include_sample: includeSample,
        p_include_geometry: includeGeometry,
    });
    if (error) throw error;
    const cells = (data as MapCellRow[]).map((row) => ({
        ...row,
        centroid: [Number(row.centroid.coordinates[0]), Number(row.centroid.coordinates[1])] as [number, number],
        facts: Object.fromEntries(Object.entries(row.facts).map(([metric, fact]) => [metric, {
            ...fact, value: Number(fact.value), sample_size: fact.sample_size == null ? null : Number(fact.sample_size),
        }])),
    }));
    return { is_sample: cells.some((cell) => cell.is_sample), zone_id: zoneId, category, cells };
}

export function toZoneDetails(row: RegionDetailRow): ZoneDetailResult {
    return {
        is_sample: row.is_sample || row.facts.some((fact) => fact.is_sample) || row.places.some((place) => place.is_sample),
        facts: row.facts.map((fact) => ({ ...fact, value: Number(fact.value),
            confidence: fact.confidence == null ? null : Number(fact.confidence) })),
        places: row.places,
    };
}
