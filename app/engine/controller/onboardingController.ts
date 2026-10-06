import "server-only";
import { createClient } from "@/app/engine/lib/server";
import { includeSample, supportedSector, type RegionDetailRow } from "./zoneController";
import { withCachedEvidence } from "./cachedEvidenceController";
import { createAdminClient, isAdminConfigured } from "../lib/admin";
import { getMetroCityIds } from "../lib/metroArea";
import type { OnboardingArea, OnboardingCity, OnboardingCampus } from "../onboarding/types";
import type { RegionFact } from "../types";

type RawCity = {
    city_id: string;
    city_name: string;
    district_count: number | string;
    center: unknown;
    is_sample: boolean;
};

type RawArea = {
    region_id: number | string;
    region_code: string;
    region_name: string;
    parent_code: string;
    parent_name: string;
    is_sample: boolean;
    center: unknown;
    geometry: unknown;
    facts: RegionFact[];
    campuses: Array<{
        id: number | string;
        name: string;
        longitude: number | string;
        latitude: number | string;
        source: string;
        source_url: string | null;
        is_sample: boolean;
    }>;
    transit_stop_count: number | string;
    living_cost_monthly_idr: number | string | null;
    living_cost_source: string | null;
    living_cost_source_url: string | null;
    living_cost_limitations: string | null;
    living_cost_is_sample: boolean | null;
};

function number(value: number | string | null): number | null {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function coordinates(value: unknown): [number, number] | null {
    if (!Array.isArray(value) || value.length !== 2 || value.some((part) => part === null || typeof part === "boolean")) return null;
    const longitude = Number(value[0]);
    const latitude = Number(value[1]);
    return Number.isFinite(longitude) && Number.isFinite(latitude) && Math.abs(longitude) <= 180 && Math.abs(latitude) <= 90
        ? [longitude, latitude] : null;
}

export type OnboardingCityRows = {
    cities: OnboardingCity[];
    areas: OnboardingArea[];
    destinations: OnboardingCampus[];
    boundaryRows: RegionDetailRow[];
};

export async function getOnboardingCityRows(cityId: string | null): Promise<OnboardingCityRows> {
    const supabase = await createClient();
    const { data: cityData, error: cityError } = await supabase.rpc("get_onboarding_cities", {
        p_include_sample: includeSample,
    });
    if (cityError) throw cityError;

    const cities = ((cityData ?? []) as RawCity[]).map((row) => ({
        city_id: row.city_id,
        city_name: row.city_name,
        district_count: Number(row.district_count),
        center: coordinates(row.center),
        is_sample: row.is_sample,
    }));
    if (!cityId) return { cities, areas: [], destinations: [], boundaryRows: [] };

    const city = cities.find((item) => item.city_id === cityId);
    if (!city) throw new Error("Unsupported city_id");
    // A destination inside a metro (e.g. Jakarta Selatan) ranks kecamatan across the whole
    // metro (Jabodetabek), since people live in one city and commute to another.
    const results = await Promise.all(getMetroCityIds(cityId, cities).map((parentCode) =>
        supabase.rpc("get_onboarding_city_preview", { p_parent_code: parentCode, p_include_sample: includeSample })));
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;

    const rawAreas = await withCachedEvidence(results.flatMap((result) => (result.data ?? []) as RawArea[]), supportedSector);
    // KBLI-to-product mappings are data, not inferred from sector labels.
    let sectorMappings: { kbli_2020_code: string; jejak_sector_id: string }[] = [];
    if (isAdminConfigured()) {
        try {
            const { data, error } = await createAdminClient().from("sector_mapping").select("kbli_2020_code,jejak_sector_id");
            if (error) throw error;
            sectorMappings = data ?? [];
        } catch { /* Missing mappings leave sector fit unsupported, not guessed. */ }
    }
    const areas: OnboardingArea[] = rawAreas.map((row) => ({
        zone_id: row.region_code,
        zone_name: row.region_name,
        city_id: row.parent_code,
        city_name: row.parent_name,
        is_sample: row.is_sample,
        center: coordinates(row.center),
        facts: (Array.isArray(row.facts) ? row.facts : []).map((fact) => fact.dimension_key === "kbli_2020_code"
            ? { ...fact, sector_ids: sectorMappings.filter((mapping) => mapping.kbli_2020_code === fact.dimension_value)
                .map((mapping) => mapping.jejak_sector_id) } : fact),
        campuses: (Array.isArray(row.campuses) ? row.campuses : []).map((place) => ({
            id: `${row.region_code}:${place.id}`,
            name: place.name,
            center: [Number(place.longitude), Number(place.latitude)],
            source: place.source,
            source_url: place.source_url,
            is_sample: place.is_sample,
        })),
        transit_stop_count: Number(row.transit_stop_count) || 0,
        living_cost: number(row.living_cost_monthly_idr) !== null && row.living_cost_source
            ? {
                value: number(row.living_cost_monthly_idr)!,
                source: row.living_cost_source,
                source_url: row.living_cost_source_url,
                limitations: row.living_cost_limitations,
                is_sample: !!row.living_cost_is_sample,
            }
            : null,
    }));
    const destinations = areas.flatMap((area) => area.campuses);
    const boundaryRows: RegionDetailRow[] = rawAreas.map((row) => ({
        region_id: Number(row.region_id),
        region_code: row.region_code,
        region_name: row.region_name,
        parent_code: row.parent_code,
        parent_name: row.parent_name,
        is_sample: row.is_sample,
        geometry: row.geometry,
        facts: Array.isArray(row.facts) ? row.facts : [],
        places: [],
    }));
    return { cities, areas, destinations, boundaryRows };
}

export async function getOnboardingCityPreview(cityId: string | null) {
    const { cities, areas, destinations } = await getOnboardingCityRows(cityId);
    return { cities, areas, destinations };
}

export async function getOnboardingCityBoundaries(cityId: string) {
    const { boundaryRows } = await getOnboardingCityRows(cityId);
    return boundaryRows;
}
