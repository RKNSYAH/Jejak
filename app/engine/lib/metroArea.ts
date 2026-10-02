export type MetroAreaId = "jabodetabek" | "bandung" | "surabaya";

export type MetroArea = {
    id: MetroAreaId;
    name: string;
    center: readonly [number, number];
    radiusKm: number;
    zoom: number;
    cities: readonly string[];
};

// People commute across city lines inside a metro, so a destination in any member
// city searches and ranks kecamatan across the whole metro. Membership uses the
// catalog's city names/IDs, never fabricated zone geometry; the camera radius only
// picks the default search context.
export const metroAreas: readonly MetroArea[] = [
    {
        id: "jabodetabek",
        name: "Jabodetabek",
        center: [106.8456, -6.2088],
        radiusKm: 80,
        zoom: 10,
        cities: ["jakarta", "jakarta selatan", "jakarta pusat", "jakarta barat", "jakarta timur", "jakarta utara",
            "kepulauan seribu", "bogor", "depok", "tangerang", "tangerang selatan", "bekasi"],
    },
    {
        id: "bandung",
        name: "Bandung Raya",
        center: [107.6191, -6.9175],
        radiusKm: 50,
        zoom: 11,
        cities: ["bandung", "bandung barat", "cimahi"],
    },
    {
        id: "surabaya",
        name: "Surabaya",
        center: [112.7521, -7.2575],
        radiusKm: 40,
        zoom: 11,
        cities: ["surabaya"],
    },
];

export function normalizeCity(value: string) {
    return value.toLowerCase().replace(/\s*\(demo parent\)\s*$/, "").replace(/[._-]+/g, " ").trim()
        .replace(/^(?:(?:kota|kabupaten|kab|administrasi|adm)\s+)+/, "").replace(/\s+(?:kota|kabupaten|kab)$/, "")
        .replace(/\s+/g, " ");
}

export function getMetroArea(id: MetroAreaId | null): MetroArea | null {
    return metroAreas.find((area) => area.id === id) ?? null;
}

export function isMetroCity(area: MetroArea, city: { city_id: string; city_name: string }) {
    return area.cities.includes(normalizeCity(city.city_name)) || area.cities.includes(normalizeCity(city.city_id));
}

export function getCityMetroArea(city: { city_id: string; city_name: string }): MetroArea | null {
    return metroAreas.find((area) => isMetroCity(area, city)) ?? null;
}

// Previews of a metro city cover the whole metro, so they are labeled by the metro.
export function getCityAreaName(city: { city_id: string; city_name: string }): string {
    return getCityMetroArea(city)?.name ?? city.city_name;
}

// The chosen city plus every catalog city in the same metro.
export function getMetroCityIds<T extends { city_id: string; city_name: string }>(cityId: string, cities: readonly T[]): string[] {
    const city = cities.find((item) => item.city_id === cityId);
    const area = city ? getCityMetroArea(city) : null;
    if (!area) return [cityId];
    return [cityId, ...cities.filter((item) => item.city_id !== cityId && isMetroCity(area, item)).map((item) => item.city_id)];
}

function distanceKm(longitude: number, latitude: number, center: readonly [number, number]) {
    const radians = Math.PI / 180;
    const a = Math.sin((latitude - center[1]) * radians / 2) ** 2 +
        Math.cos(latitude * radians) * Math.cos(center[1] * radians) *
        Math.sin((longitude - center[0]) * radians / 2) ** 2;
    return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}

export function getMetroAreaAt(longitude: number, latitude: number): MetroArea | null {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(latitude) > 90) return null;
    const candidates = metroAreas.map((area) => ({ area, distance: distanceKm(longitude, latitude, area.center) }))
        .filter(({ area, distance }) => distance <= area.radiusKm)
        .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.area ?? null;
}
