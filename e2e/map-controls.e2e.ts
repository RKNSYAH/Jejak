import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/auth";
import { openDemoMap, stubZones } from "./fixtures/map";

async function openMap(page: Page) {
    await stubZones(page);
    await openDemoMap(page);
    await expect(page.getByRole("group", { name: "Kategori peta" })).toBeVisible();
}

for (const reducedMotion of ["reduce", "no-preference"] as const) {
    test(`desktop arrows follow overflow edges (${reducedMotion})`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop");
        await page.setViewportSize({ width: 800, height: 800 });
        await page.emulateMedia({ reducedMotion });
        await openMap(page);

        const viewport = page.locator("#map-category-scroll");
        const left = page.getByRole("button", { name: "Gulir kategori ke kiri", includeHidden: true });
        const right = page.getByRole("button", { name: "Gulir kategori ke kanan", includeHidden: true });
        await viewport.evaluate((element) => { element.scrollLeft = 0; });
        await expect(left).toBeHidden();
        await expect(right).toBeVisible();
        await expect(right).toHaveAttribute("aria-controls", "map-category-scroll");
        await expect(right).toHaveCSS("position", "absolute");
        await expect(right).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
        await expect(right).toHaveCSS("border-top-width", "0px");
        await expect(right).toHaveCSS("box-shadow", /^(none|(rgba\(0, 0, 0, 0\) 0px 0px 0px 0px,? ?)+)$/);
        expect(await page.getByRole("group", { name: "Kategori peta" }).evaluate((element) => {
            const style = getComputedStyle(element);
            const viewport = element.querySelector<HTMLElement>("#map-category-scroll")!;
            return Math.abs(element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - viewport.clientWidth);
        })).toBeLessThanOrEqual(1);

        const firstTarget = await viewport.evaluate((element) => Math.min(
            element.clientWidth * 0.8, element.scrollWidth - element.clientWidth,
        ));
        await right.focus();
        await right.press("Enter");
        await expect.poll(() => viewport.evaluate((element, expected) =>
            Math.abs(element.scrollLeft - expected), firstTarget)).toBeLessThan(1);
        await expect(left).toBeVisible();
        await viewport.evaluate((element) => { element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2; });
        await expect(right).toBeVisible();

        // Repeated clicks reach the end without selecting a category or changing the map.
        for (let step = 0; step < 10 && await right.isVisible(); step++) {
            const target = await viewport.evaluate((element) => Math.min(
                element.scrollLeft + element.clientWidth * 0.8,
                element.scrollWidth - element.clientWidth,
            ));
            await right.click();
            await expect.poll(() => viewport.evaluate((element, expected) =>
                Math.abs(element.scrollLeft - expected), target)).toBeLessThan(1);
            if (await viewport.evaluate((element) => element.scrollWidth - element.clientWidth - element.scrollLeft < 1)) {
                await expect(right).toBeHidden();
                break;
            }
        }
        await expect(right).toBeHidden();
        await expect(left).toBeVisible();

        for (let step = 0; step < 10 && await left.isVisible(); step++) {
            const target = await viewport.evaluate((element) => Math.max(
                element.scrollLeft - element.clientWidth * 0.8, 0,
            ));
            await left.click();
            await expect.poll(() => viewport.evaluate((element, expected) =>
                Math.abs(element.scrollLeft - expected), target)).toBeLessThan(1);
            if (target === 0) {
                await expect(left).toBeHidden();
                break;
            }
        }
        await expect(left).toBeHidden();
        await expect(right).toBeVisible();
    });
}

test("arrows disappear when desktop content fits and stay hidden on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 800 });
    await openMap(page);
    const left = page.getByRole("button", { name: "Gulir kategori ke kiri", includeHidden: true });
    const right = page.getByRole("button", { name: "Gulir kategori ke kanan", includeHidden: true });
    await expect(right).toBeVisible();

    await page.setViewportSize({ width: 1600, height: 800 });
    await expect(left).toBeHidden();
    await expect(right).toBeHidden();
    await expect.poll(() => page.locator("#map-category-scroll").evaluate((element) =>
        element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);

    await page.setViewportSize({ width: 800, height: 800 });
    await expect(right).toBeVisible();

    await page.setViewportSize({ width: 390, height: 700 });
    await expect(left).toBeHidden();
    await expect(right).toBeHidden();
    const viewport = page.locator("#map-category-scroll");
    await expect.poll(() => viewport.evaluate((element) =>
        element.scrollWidth - element.clientWidth)).toBeGreaterThan(0);
    await viewport.evaluate((element) => { element.scrollLeft = element.scrollWidth; });
    await expect.poll(() => viewport.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
    await expect(left).toBeHidden();
    await expect(right).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("overflow updates when sidebar resizes and Reset disappears", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: {
        is_sample: false,
        zones: [{
            zone_id: "pancoran", zone_name: "Pancoran", city_id: "jakarta-selatan", city_name: "Jakarta Selatan",
            is_sample: false, average_monthly_wage_idr: null, median_monthly_rent_idr: null,
            population: null, wage_to_rent_ratio: null,
        }],
    } }));
    await page.route((url) => /^\/api\/zones\/[^/]+\/intelligence$/.test(url.pathname), (route) => {
        const details = { is_sample: false, places: [], facts: [] };
        return route.fulfill({ json: new URL(route.request().url()).searchParams.get("include_geometry") === "1"
            ? { details, geometry: { type: "FeatureCollection", features: [] }, geometry_error: null }
            : details });
    });
    await page.route((url) => url.pathname === "/api/geometry", (route) => route.fulfill({ json: {
        type: "FeatureCollection", features: [],
    } }));
    await openDemoMap(page);
    const right = page.getByRole("button", { name: "Gulir kategori ke kanan", includeHidden: true });
    const left = page.getByRole("button", { name: "Gulir kategori ke kiri", includeHidden: true });
    await expect(right).toBeHidden();

    await page.getByRole("searchbox").fill("Pancoran");
    await page.getByRole("list", { name: "Hasil pencarian kecamatan" }).getByRole("button", { name: /Pancoran/ }).click();
    await expect(page.locator("#zone-intelligence-desktop")).toBeVisible();
    await expect(right).toBeVisible();
    const viewport = page.locator("#map-category-scroll");
    const initialWidth = await viewport.evaluate((element) => element.clientWidth);
    await page.getByRole("separator", { name: "Ubah lebar panel" }).press("ArrowLeft");
    await expect.poll(() => viewport.evaluate((element) => element.clientWidth)).toBeLessThan(initialWidth);

    await page.getByRole("button", { name: "Reset semua lapisan peta" }).click();
    await expect(page.getByRole("button", { name: "Reset semua lapisan peta" })).toHaveCount(0);
    await expect(right).toBeHidden();
    await expect(left).toBeHidden();
    await expect.poll(() => viewport.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
});
