import { evidenceTypes, getJson, isNullableString } from "./zoneApi";
import { isCentroid, isRecord } from "./zoneGeometry";
import { getMetroCityIds } from "./metroArea";
import type { RegionFact } from "../types";
import type { OnboardingArea, OnboardingCampus, OnboardingCity } from "../onboarding/types";

function isCity(value: unknown): value is OnboardingCity {
    return isRecord(value) && typeof value.city_id === "string" && typeof value.city_name === "string" &&
        Number.isInteger(value.district_count) && Number(value.district_count) > 0 &&
        (value.center === null || isCentroid(value.center)) && typeof value.is_sample === "boolean";
}

function isFact(value: unknown): value is RegionFact {
    return isRecord(value) && typeof value.metric === "string" && typeof value.value === "number" && Number.isFinite(value.value) &&
        isNullableString(value.unit) && typeof value.source === "string" && isNullableString(value.period_end) &&
        evidenceTypes.includes(String(value.evidence_type)) && isNullableString(value.limitations) && typeof value.is_sample === "boolean" &&
        (value.source_url === undefined || isNullableString(value.source_url)) &&
        (value.dimension_key === undefined || value.dimension_key === null || value.dimension_key === "housing_type" || value.dimension_key === "kbli_2020_code") &&
        (value.dimension_value === undefined || isNullableString(value.dimension_value));
}

function isCampus(value: unknown): value is OnboardingCampus {
    return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isCentroid(value.center) &&
        typeof value.source === "string" && isNullableString(value.source_url) && typeof value.is_sample === "boolean";
}

function isArea(value: unknown): value is OnboardingArea {
    return isRecord(value) && typeof value.zone_id === "string" && typeof value.zone_name === "string" &&
        typeof value.city_id === "string" && typeof value.city_name === "string" && typeof value.is_sample === "boolean" &&
        (value.center === null || isCentroid(value.center)) && Array.isArray(value.facts) && value.facts.every(isFact) &&
        Array.isArray(value.campuses) && value.campuses.every(isCampus) &&
        Number.isInteger(value.transit_stop_count) && Number(value.transit_stop_count) >= 0 &&
        (value.living_cost === null || (isRecord(value.living_cost) && typeof value.living_cost.value === "number" &&
            Number.isFinite(value.living_cost.value) && typeof value.living_cost.source === "string" &&
            isNullableString(value.living_cost.source_url) && isNullableString(value.living_cost.limitations) &&
            typeof value.living_cost.is_sample === "boolean"));
}

export type OnboardingDataResponse = { cities: OnboardingCity[]; areas: OnboardingArea[]; destinations: OnboardingCampus[] };

export async function getOnboardingData(cityId: string | null, signal: AbortSignal): Promise<OnboardingDataResponse> {
    const query = cityId ? `?city_id=${encodeURIComponent(cityId)}` : "";
    const data = await getJson(`/api/onboarding/preview${query}`, signal);
    if (!isRecord(data) || !Array.isArray(data.cities) || !data.cities.every(isCity) ||
        !Array.isArray(data.areas) || !data.areas.every(isArea) ||
        !Array.isArray(data.destinations) || !data.destinations.every(isCampus)) {
        throw new Error("Data onboarding belum valid.");
    }
    const cities = data.cities as OnboardingCity[];
    const areas = data.areas as OnboardingArea[];
    const destinations = data.destinations as OnboardingCampus[];
    const cityIds = cityId ? new Set(getMetroCityIds(cityId, cities)) : null;
    if (cityIds && areas.some((area) => !cityIds.has(area.city_id))) throw new Error("Kota data onboarding tidak sesuai.");
    return { cities, areas, destinations };
}
