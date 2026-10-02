import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/auth";
import { openDemoMap, stubZones } from "./fixtures/map";

const zones = [
    ["Coblong", "Bandung", "bandung"],
    ["Tebet", "Jakarta Selatan", "jakarta-selatan"],
    ["Sukajadi", "Bandung", "bandung"],
    ["Menteng", "Jakarta Pusat", "jakarta-pusat"],
    ["Bogor Tengah", "Kota Bogor", "bogor"],
    ["Bekasi Selatan", "Kota Bekasi", "bekasi"],
    ["Antapani", "Bandung", "bandung"],
    ["Cibinong", "Kabupaten Bogor", "kabupaten-bogor"],
    ["Gondokusuman", "Yogyakarta", "yogyakarta"],
].map(([name, city, cityId], index) => ({
    zone_id: `search-fixture-${index}`, zone_name: name, city_id: cityId, city_name: city,
    is_sample: true, average_monthly_wage_idr: null, median_monthly_rent_idr: null,
    population: null, wage_to_rent_ratio: null,
}));

async function openMap(page: Page) {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Keep camera tests independent of the remote basemap's network/load timing.
    await page.route("https://tiles.openfreemap.org/**", (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/planet") return route.fulfill({ json: {
            tilejson: "2.2.0", minzoom: 0, maxzoom: 14,
            tiles: ["https://tiles.openfreemap.org/search-fixture/{z}/{x}/{y}.pbf"],
        } });
        if (path.startsWith("/search-fixture/")) return route.fulfill({ contentType: "application/x-protobuf", body: Buffer.alloc(0) });
        if (path.endsWith(".json")) return route.fulfill({ json: {} });
        if (path.endsWith(".png")) return route.fulfill({ contentType: "image/png",
            body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
        return route.abort();
    });
    await stubZones(page, zones, true);
    await page.route((url) => /^\/api\/zones\/[^/]+\/intelligence$/.test(url.pathname), (route) => {
        const url = new URL(route.request().url());
        const zone = zones.find((zone) => zone.zone_id === url.pathname.split("/")[3])!;
        const [x, y] = zone.city_id === "bandung" ? [107.6191, -6.9175]
            : zone.city_id === "yogyakarta" ? [110.3695, -7.7956] : [106.8456, -6.2088];
        const details = { is_sample: true, facts: [], places: [] };
        const geometry = { type: "FeatureCollection", features: [{ type: "Feature",
            properties: { zone_id: zone.zone_id, zone_name: zone.zone_name },
            geometry: { type: "Polygon", coordinates: [[[x, y], [x + 0.02, y], [x + 0.02, y + 0.02], [x, y + 0.02], [x, y]]] },
        }] };
        return route.fulfill({ json: url.searchParams.get("include_geometry") === "1"
            ? { details, geometry, geometry_error: null } : details });
    });
    await openDemoMap(page);
    await expect(page.locator('[data-hci-region="zone-list"]')).toContainText(`${zones.length} kecamatan tersedia`);
}

async function openSheet(page: Page) {
    await page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" }).press("End");
    await expect(page.locator('[data-hci-region="zone-list"] button')).toHaveCount(zones.length);
}

async function selectFromSheet(page: Page, name: string) {
    await openSheet(page);
    await page.locator('[data-hci-region="zone-list"] button').filter({ hasText: name }).click();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Tutup detail ${name}`, exact: true }).click();
}

test("search limits local suggestions but can find other cities and submits the first visible result", async ({ page }) => {
    await openMap(page);
    const search = page.getByRole("searchbox");
    const results = page.getByRole("list", { name: "Hasil pencarian kecamatan" });
    await search.click();
    await expect(results.getByRole("button")).toHaveText(["TebetJakarta Selatan", "MentengJakarta Pusat", "Bogor TengahKota Bogor"]);
    await expect(page.getByText(/Maks\. 3 hasil/)).toHaveCount(0);

    await search.fill("Bogor");
    await expect(results.getByRole("button")).toHaveText(["Bogor TengahKota Bogor", "CibinongKabupaten Bogor"]);
    await search.fill("Coblong");
    await expect(results.getByRole("button")).toHaveText(["CoblongBandung"]);
    await search.fill("not found");
    await expect(results.getByRole("button")).toHaveCount(0);
    await expect(page.getByText("Tidak ada kecamatan yang cocok. Coba kata lain.")).toBeVisible();
    await search.press("Enter");
    await expect(page.getByRole("heading", { name: "Coblong", exact: true })).toHaveCount(0);

    await search.fill("");
    await search.press("Escape");
    await expect(results).toBeHidden();
    await search.press("Tab");
    await search.focus();
    await search.press("Enter");
    await expect(page.getByRole("heading", { name: "Tebet", exact: true })).toBeVisible();
});

test("camera moves switch Jakarta and Bandung search contexts without filtering the bottom sheet", async ({ page }) => {
    await openMap(page);
    await selectFromSheet(page, "Coblong");
    const search = page.getByRole("searchbox");
    const results = page.getByRole("list", { name: "Hasil pencarian kecamatan" });
    await search.click();
    await expect(results.getByRole("button")).toHaveText(["CoblongBandung", "SukajadiBandung", "AntapaniBandung"]);
    await search.fill("Tebet");
    await expect(results.getByRole("button")).toHaveText(["TebetJakarta Selatan"]);

    await selectFromSheet(page, "Tebet");
    await search.fill("");
    await expect(results.getByRole("button")).toHaveText(["TebetJakarta Selatan", "MentengJakarta Pusat", "Bogor TengahKota Bogor"]);
    await openSheet(page);
    await expect(page.locator('[data-hci-region="zone-list"]')).toContainText(`${zones.length} kecamatan tersedia`);
    await expect(page.locator('[data-hci-region="zone-list"] button').filter({ hasText: "Coblong" })).toBeVisible();
});

test("a camera outside the configured search areas still supports searching all cities", async ({ page }) => {
    await openMap(page);
    await selectFromSheet(page, "Gondokusuman");
    await page.getByRole("searchbox").click();
    const results = page.getByRole("list", { name: "Hasil pencarian kecamatan" });
    await expect(results.getByRole("button")).toHaveText(["CoblongBandung", "TebetJakarta Selatan", "SukajadiBandung"]);
    await page.getByRole("searchbox").fill("Gondokusuman");
    await expect(results.getByRole("button")).toHaveText(["GondokusumanYogyakarta"]);
    await openSheet(page);
    await expect(page.locator('[data-hci-region="zone-list"] button')).toHaveCount(zones.length);
});
