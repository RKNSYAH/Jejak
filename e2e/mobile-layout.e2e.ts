import { expect, test as publicTest } from "@playwright/test";
import { test } from "./fixtures/auth";
import { openDemoMap, stubZones } from "./fixtures/map";

test("mobile map controls use full width without covering each other", async ({ page }) => {
    await stubZones(page);
    await openDemoMap(page);

    for (const width of [320, 360, 390, 430]) {
        await page.setViewportSize({ width, height: 700 });
        const search = await page.getByRole("searchbox").boundingBox();
        const profile = await page.getByRole("link", { name: "Profil" }).boundingBox();
        const categories = await page.locator('[data-hci-region="categories"]').boundingBox();
        expect(search).not.toBeNull();
        expect(profile).not.toBeNull();
        expect(categories).not.toBeNull();
        expect(search!.x + search!.width).toBeLessThan(profile!.x);
        expect(categories!.x + categories!.width).toBeGreaterThan(profile!.x + profile!.width - 2);
        expect(categories!.y).toBeGreaterThan(search!.y + search!.height - 1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
});

publicTest("login and pricing reflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/login");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await page.getByRole("button", { name: "Daftar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Buat akun dan lanjut" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);

    await page.goto("/pricing");
    await expect(page.getByRole("heading", { name: "Semua detail dalam satu tabel" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("short mobile map clears controls when discovery opens", async ({ page }) => {
    await stubZones(page);
    await page.setViewportSize({ width: 320, height: 420 });
    await openDemoMap(page);
    const sheetHandle = page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" });
    await expect(page.getByRole("button", { name: /Bangunan 3D/ })).toBeVisible();
    await sheetHandle.press("End");
    await expect(page.locator('[data-hci-region="map-chat"]')).toBeHidden();
    await expect(page.getByRole("button", { name: /Bangunan 3D/ })).toHaveCount(0);
    await sheetHandle.press("Home");
    await expect(page.getByRole("button", { name: /Bangunan 3D/ })).toBeVisible();
});

test("desktop keeps search and lenses on one line, tools at bottom left", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await stubZones(page);
    await page.setViewportSize({ width: 1440, height: 800 });
    await openDemoMap(page);

    const search = (await page.locator('[data-hci-region="search"]').boundingBox())!;
    const categories = (await page.locator('[data-hci-region="categories"]').boundingBox())!;
    const tools = (await page.getByRole("button", { name: /Bangunan 3D/ }).boundingBox())!;
    expect(search.width).toBeGreaterThanOrEqual(300);
    expect(categories.x).toBeGreaterThan(search.x + search.width);
    expect(Math.abs(categories.y - search.y)).toBeLessThan(10);
    expect(tools.x).toBeLessThan(64);
    expect(tools.y + tools.height).toBeGreaterThan(720);
});
