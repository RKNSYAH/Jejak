import { expect } from "@playwright/test";
import { test } from "./fixtures/auth";
import { openDemoMap, stubZones } from "./fixtures/map";

test("education switches metrics and keeps zero and school-only districts useful", async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const districts = [
        { id: "jakarta-selatan-setiabudi", name: "Setiabudi", schools: 51, universities: 3 },
        { id: "jakarta-selatan-tebet", name: "Tebet", schools: 24, universities: 0 },
        { id: "jakarta-pusat-menteng", name: "Menteng", schools: 12, universities: null },
        { id: "jakarta-selatan-kebayoran-baru", name: "Kebayoran Baru", schools: null, universities: 2 },
        { id: "jakarta-pusat-tanah-abang", name: "Tanah Abang", schools: null, universities: null },
    ];
    await stubZones(page, districts.map((district) => ({
        zone_id: district.id, zone_name: district.name, city_id: "jakarta-selatan", city_name: "Jakarta Selatan",
        is_sample: false, average_monthly_wage_idr: null, median_monthly_rent_idr: null, population: null, wage_to_rent_ratio: null,
    })));
    let requests = 0;
    await page.route((url) => /^\/api\/zones\/[^/]+\/intelligence$/.test(url.pathname), (route) => {
        requests++;
        const district = districts.find((item) => route.request().url().includes(item.id))!;
        const facts = (["schools", "universities"] as const).flatMap((metric) => district[metric] === null ? [] : [{
            metric, value: district[metric], unit: "count", source: "Direktori pendidikan fixture",
            source_url: "https://example.test/pendidikan", period_end: "2025-12-31",
            evidence_type: "observed", limitations: null, is_sample: false,
        }]);
        const details = { is_sample: false, places: [], facts };
        const longitude = 106.8 + districts.indexOf(district) * 0.01;
        const geometry = { type: "FeatureCollection", features: [{ type: "Feature",
            properties: { zone_id: district.id, zone_name: district.name },
            geometry: { type: "Polygon", coordinates: [[[longitude, -6.2], [longitude + 0.008, -6.2],
                [longitude + 0.008, -6.208], [longitude, -6.208], [longitude, -6.2]]] },
        }] };
        return route.fulfill({ json: new URL(route.request().url()).searchParams.get("include_geometry") === "1"
            ? { details, geometry, geometry_error: null } : details });
    });
    await openDemoMap(page);
    await expect.poll(() => requests).toBe(5);
    await page.getByRole("button", { name: "Pendidikan", exact: true }).click();
    await page.getByRole("button", { name: "Legenda", exact: true }).click();
    const legend = page.locator("#map-legend");
    await expect(legend.getByRole("heading", { name: "Jumlah sekolah" })).toBeVisible();
    await expect(legend.getByRole("radio", { name: "Sekolah", exact: true })).toBeChecked();
    await expect(legend.getByText("3 dari 5 kecamatan memiliki data.")).toBeVisible();
    await legend.getByRole("radio", { name: "Sekolah", exact: true }).focus();
    await legend.getByRole("radio", { name: "Sekolah", exact: true }).press("ArrowRight");
    await expect(legend.getByRole("radio", { name: "Universitas", exact: true })).toBeChecked();
    await expect(legend.getByRole("heading", { name: "Jumlah universitas" })).toBeVisible();
    await expect(legend.getByText("Tanpa warna: data belum tersedia.")).toBeVisible();
    expect(requests).toBe(5); // Switching metrics uses accepted facts, not new evidence requests.
    await page.getByRole("button", { name: "Legenda", exact: true }).click();

    const panel = page.locator(testInfo.project.name === "mobile" ? "dialog[data-hci-region='zone-panel']" : "#zone-intelligence-desktop");
    for (const [name, schools, universities] of [["Setiabudi", "51", "3"], ["Tebet", "24", "0"],
        ["Menteng", "12", "Belum tersedia"], ["Kebayoran Baru", "Belum tersedia", "2"],
        ["Tanah Abang", "Belum tersedia", "Belum tersedia"]]) {
        await page.getByRole("searchbox").fill(name);
        await page.getByRole("list", { name: "Hasil pencarian kecamatan" }).getByRole("button", { name: new RegExp(name) }).click();
        await expect(panel).toBeVisible();
        await expect(panel.getByText("Sekolah", { exact: true }).locator("..").locator("dd").first()).toHaveText(schools);
        await expect(panel.getByText("Universitas", { exact: true }).locator("..").locator("dd").first()).toHaveText(universities);
        await panel.getByRole("button", { name: `Tutup detail ${name}` }).click();
        await expect(panel).toBeHidden();
    }
    await page.getByRole("button", { name: "Legenda", exact: true }).click();
    await expect(legend.getByRole("radio", { name: "Universitas", exact: true })).toBeChecked();
});
