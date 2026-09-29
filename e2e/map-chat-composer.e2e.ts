import { expect, test, type Page } from "@playwright/test";

const zones = [{
    zone_id: "pancoran",
    zone_name: "Pancoran",
    city_id: "jakarta-selatan",
    city_name: "Jakarta Selatan",
    is_sample: false,
    average_monthly_wage_idr: null,
    median_monthly_rent_idr: null,
    population: null,
    wage_to_rent_ratio: null,
}];

const details = { is_sample: false, places: [], facts: [] };

function geometry() {
    return {
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: [[[106.82, -6.28], [106.85, -6.28], [106.85, -6.25], [106.82, -6.25], [106.82, -6.28]]],
            },
            properties: { zone_id: "pancoran", zone_name: "Pancoran" },
        }],
    };
}

async function openMap(page: Page) {
    await page.route((url) => url.pathname === "/api/zones", (route) =>
        route.fulfill({ json: { is_sample: false, zones } }));
    await page.route((url) => /^\/api\/zones\/[^/]+\/intelligence$/.test(url.pathname), (route) => {
        const url = new URL(route.request().url());
        return route.fulfill({
            json: url.searchParams.get("include_geometry") === "1"
                ? { details, geometry: geometry(), geometry_error: null }
                : details,
        });
    });
    await page.route((url) => url.pathname === "/api/geometry", (route) =>
        route.fulfill({ json: geometry() }));

    await page.goto("/map?onboarding=demo");
    await page.getByRole("button", { name: /Lewati untuk sekarang/ }).click();
    await expect(page.getByRole("button", { name: "Legenda" })).toBeVisible();
}

test("composer stays above sheet, hides when expanded, and keeps draft", async ({ page }, testInfo) => {
    await openMap(page);

    if (testInfo.project.name === "desktop") {
        await page.setViewportSize({ width: 700, height: 420 });
    }

    const composer = page.locator('[data-hci-region="map-chat"]');
    await expect(composer).toBeVisible();
    await composer.getByRole("button", { name: "Bagaimana jika kerja remote?" }).click();
    const prompt = composer.locator("#map-chat-prompt");
    await expect(prompt).toHaveAccessibleName("Tanya atau ubah asumsi peta");
    await expect(prompt).toHaveValue("Bagaimana rekomendasi berubah jika saya kerja remote?");

    const sheetHandle = page.getByRole("separator", { name: "Resize exploration panel" });
    await sheetHandle.press("End");
    await expect(composer).toBeHidden();
    await expect(prompt).toHaveValue("Bagaimana rekomendasi berubah jika saya kerja remote?");

    await sheetHandle.press("Home");
    await expect(composer).toBeVisible();
});

test("dragging the sheet moves the composer before the snap", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Mouse drag is measured on desktop; keyboard resizing is covered on both viewports");
    await openMap(page);
    const composer = page.locator('[data-hci-region="map-chat"]');
    const sheetHandle = page.getByRole("separator", { name: "Resize exploration panel" });
    const box = (await sheetHandle.boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const initialBottom = await composer.evaluate((element) => parseFloat(getComputedStyle(element).bottom));

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - 180, { steps: 5 });
    await expect.poll(() => composer.evaluate((element) => parseFloat(getComputedStyle(element).bottom)))
        .toBeGreaterThan(initialBottom + 100);
    await page.mouse.up();

    await expect(sheetHandle).toHaveAttribute("aria-valuenow", "290");
    await expect.poll(() => composer.evaluate((element) => parseFloat(getComputedStyle(element).bottom)))
        .toBeGreaterThan(initialBottom + 200);
});

test("composer centers in remaining desktop map area when sidebar resizes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Mobile zone details use a modal sheet, not a desktop sidebar");
    await openMap(page);

    await page.getByRole("searchbox").fill("Pancoran");
    await page.getByRole("list", { name: "Supported zones" }).getByRole("button", { name: /Pancoran/ }).click();

    const panel = page.locator("#zone-intelligence-desktop");
    const composer = page.locator('[data-hci-region="map-chat"]');
    await expect(panel).toBeVisible();
    await expect(composer).toBeVisible();
    await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).right)).toBe("420px");

    await page.getByRole("separator", { name: "Resize panel" }).press("ArrowLeft");
    await expect.poll(() => composer.evaluate((element) => getComputedStyle(element).right)).toBe("440px");
});
