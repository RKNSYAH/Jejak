import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/auth";
import { openDemoMap, stubZones } from "./fixtures/map";

const zone = (id: string, name: string, cityId: string, cityName: string, center: [number, number]) => ({
    zone_id: id, zone_name: name, city_id: cityId, city_name: cityName, is_sample: false, center,
    average_monthly_wage_idr: null, median_monthly_rent_idr: null, population: null, wage_to_rent_ratio: null,
});
const zones = [
    zone("jakarta-a", "Tebet", "jakarta-selatan", "Kota Administrasi Jakarta Selatan", [106.85, -6.23]),
    zone("jakarta-b", "Menteng", "jakarta-pusat", "Kota Administrasi Jakarta Pusat", [106.83, -6.19]),
    zone("bandung-a", "Coblong", "bandung-kota", "Kota Bandung", [107.61, -6.89]),
    zone("bandung-b", "Sukajadi", "bandung-kota", "Kota Bandung", [107.59, -6.89]),
    zone("bandung-c", "Cidadap", "bandung-kota", "Kota Bandung", [107.6, -6.86]),
];

async function openMap(page: Page) {
    const requested: string[] = [];
    await stubZones(page, zones);
    await page.route((url) => /^\/api\/zones\/[^/]+\/intelligence$/.test(url.pathname), (route) => {
        const id = new URL(route.request().url()).pathname.split("/")[3];
        const item = zones.find((candidate) => candidate.zone_id === id)!;
        requested.push(id);
        const [x, y] = item.center;
        return route.fulfill({ json: {
            details: { is_sample: false, places: [], facts: [] },
            geometry: { type: "FeatureCollection", features: [{ type: "Feature",
                geometry: { type: "Polygon", coordinates: [[[x, y], [x + 0.01, y], [x + 0.01, y + 0.01], [x, y + 0.01], [x, y]]] },
                properties: { zone_id: id, zone_name: item.zone_name } }] },
            geometry_error: null,
        } });
    });
    await openDemoMap(page);
    return requested;
}

// The Pendidikan legend counts the kecamatan drawn on the map.
async function legendCount(page: Page) {
    await page.getByRole("button", { name: "Pendidikan", exact: true }).click();
    await page.getByRole("button", { name: "Legenda" }).click();
    const text = await page.locator("#map-legend").innerText();
    await page.keyboard.press("Escape");
    return text;
}

test("choosing an area loads that area's kecamatan and drops the previous area", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    const requested = await openMap(page);
    await expect.poll(() => [...requested].sort()).toEqual(["jakarta-a", "jakarta-b"]);
    expect(await legendCount(page)).toContain("dari 2 kecamatan");

    await page.getByRole("button", { name: "Wilayah: Jabodetabek" }).click();
    await page.getByRole("list", { name: "Pilih wilayah" }).getByRole("button", { name: "Bandung Raya" }).click();
    await expect(page.getByRole("button", { name: "Wilayah: Bandung Raya" })).toBeVisible();
    await expect.poll(() => requested.filter((id) => id.startsWith("bandung")).sort()).toEqual(["bandung-a", "bandung-b", "bandung-c"]);
    await expect.poll(() => legendCount(page)).toContain("dari 3 kecamatan");
});

test("panning the map into another area switches the area and its kecamatan", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    const requested = await openMap(page);
    await expect.poll(() => requested.length).toBe(2);

    // Zoom out, then drag east-to-west until the camera center reaches Bandung.
    await page.mouse.move(640, 400);
    for (let step = 0; step < 4; step++) await page.mouse.wheel(0, 600);
    const area = page.getByRole("button", { name: /^Wilayah:/ });
    for (let step = 0; step < 20 && (await area.getAttribute("aria-label")) !== "Wilayah: Bandung Raya"; step++) {
        await page.mouse.move(700, 450);
        await page.mouse.down();
        await page.mouse.move(640, 400, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(150);
    }
    await expect(area).toHaveAttribute("aria-label", "Wilayah: Bandung Raya");
    await expect.poll(() => requested.filter((id) => id.startsWith("bandung")).length).toBe(3);
});
