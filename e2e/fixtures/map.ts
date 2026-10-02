import type { Page } from "@playwright/test";

export async function stubZones(page: Page, zones: unknown[] = [], isSample = false) {
    await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { is_sample: isSample, zones } }));
    const cities = [{
        city_id: "jakarta-selatan", city_name: "Kota Administrasi Jakarta Selatan", district_count: 2,
        center: [106.82, -6.27], is_sample: false,
    }, { city_id: "bandung-kota", city_name: "Kota Bandung", district_count: 1, center: [107.6191, -6.9175], is_sample: false }];
    const campus = {
        id: "jakarta-selatan:101", name: "Kampus Selatan", center: [106.82, -6.24],
        source: "Direktori kampus", source_url: "https://example.test/kampus", is_sample: false,
    };
    const fact = (value: number) => ({
        metric: "median_monthly_rent_idr", value, unit: "IDR", source: "Survei hunian fixture",
        source_url: "https://example.test/sewa", period_end: "2026-06-30", evidence_type: "derived",
        limitations: null, is_sample: false, dimension_key: "housing_type", dimension_value: "kos",
    });
    const areas = [{
        zone_id: "jakarta-selatan-a", zone_name: "Kecamatan A", city_id: "jakarta-selatan",
        city_name: cities[0].city_name, is_sample: false, center: [106.8, -6.25], facts: [fact(1_500_000)],
        campuses: [campus], transit_stop_count: 4,
        living_cost: { value: 3_000_000, source: "Keranjang biaya kota", source_url: "https://example.test/biaya",
            limitations: "Estimasi kota", is_sample: false },
    }, {
        zone_id: "jakarta-selatan-b", zone_name: "Kecamatan B", city_id: "jakarta-selatan",
        city_name: cities[0].city_name, is_sample: false, center: [106.82, -6.24], facts: [fact(3_000_000)],
        campuses: [], transit_stop_count: 1,
        living_cost: { value: 3_000_000, source: "Keranjang biaya kota", source_url: "https://example.test/biaya",
            limitations: "Estimasi kota", is_sample: false },
    }];
    await page.route((url) => url.pathname === "/api/onboarding/preview", (route) => {
        const cityId = new URL(route.request().url()).searchParams.get("city_id");
        const cityAreas = cityId === "jakarta-selatan" ? areas : cityId === "bandung-kota" ? [{
            ...areas[0], zone_id: "bandung-a", zone_name: "Kecamatan Bandung", city_id: "bandung-kota",
            city_name: cities[1].city_name, center: [107.6191, -6.9175], campuses: [],
        }] : [];
        return route.fulfill({ json: { cities, areas: cityAreas, destinations: cityAreas.flatMap((area) => area.campuses) } });
    });
    await page.route((url) => url.pathname === "/api/onboarding/geometry", (route) => {
        const cityId = new URL(route.request().url()).searchParams.get("city_id");
        const cityAreas = cityId === "jakarta-selatan" ? areas : cityId === "bandung-kota" ? [{
            ...areas[0], zone_id: "bandung-a", zone_name: "Kecamatan Bandung", city_id: "bandung-kota",
            city_name: cities[1].city_name, center: [107.6191, -6.9175],
        }] : [];
        return route.fulfill({ json: {
            geometry: { type: "FeatureCollection", features: cityAreas.map((area) => {
                const [longitude, latitude] = area.center;
                return {
                type: "Feature", geometry: { type: "Polygon", coordinates: [[[longitude - 0.02, latitude - 0.02], [longitude + 0.02, latitude - 0.02],
                    [longitude + 0.02, latitude + 0.02], [longitude - 0.02, latitude + 0.02], [longitude - 0.02, latitude - 0.02]]] },
                properties: { zone_id: area.zone_id, zone_name: area.zone_name },
            }; }) }, missingZones: [],
        } });
    });
}

// Opens the map in demo onboarding and skips the story dialog.
export async function openDemoMap(page: Page) {
    await page.goto("/map?onboarding=demo");
    await page.getByRole("button", { name: /Lewati untuk sekarang/ }).click();
}
