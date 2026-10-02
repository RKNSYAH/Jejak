import { expect, test as publicTest } from "@playwright/test";
import { test } from "./fixtures/auth";

publicTest("guest landing page links its main CTA to login", async ({ page }) => {
    await page.goto("/");

    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Mulai Jejakmu" })).toHaveAttribute("href", "/login");
    await expect(main.getByText("Sudah punya akun?", { exact: false })).toBeVisible();
});

test("signed-in landing page links its main CTA to the map without a login prompt", async ({ page }) => {
    await page.goto("/");

    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Mulai Jejakmu" })).toHaveAttribute("href", "/map");
    await expect(main.getByText("Sudah punya akun?", { exact: false })).toHaveCount(0);
});

publicTest("landing page has a semantic heading, three highlights, and an empty decorative image slot", async ({ page }) => {
    await page.goto("/");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();

    const highlights = page.locator('[data-hci-region="landing-highlights"]');
    await expect(highlights.getByRole("listitem")).toHaveCount(3);
    await expect(highlights).not.toContainText(/(?:3|50)\s*\+/);

    const imageSlot = page.locator('[data-hci-region="landing-image"]');
    await expect(imageSlot).toHaveAttribute("aria-hidden", "true");
    await expect(imageSlot.locator("img, svg")).toHaveCount(0);
    expect((await imageSlot.textContent())?.trim()).toBe("");
    const bounds = await imageSlot.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(0);
    expect(bounds!.height).toBeGreaterThan(0);
});

publicTest("landing layout reflows without horizontal overflow from mobile to desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await page.goto("/");

    const main = page.getByRole("main");
    const text = page.locator('[data-hci-region="landing-hero"] .hero-content > div').first();
    const imageSlot = page.locator('[data-hci-region="landing-image"]');
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

        const textBounds = await text.boundingBox();
        const imageBounds = await imageSlot.boundingBox();
        expect(textBounds).not.toBeNull();
        expect(imageBounds).not.toBeNull();
        if (width < 768) {
            expect(imageBounds!.y).toBeGreaterThanOrEqual(textBounds!.y + textBounds!.height - 1);
        } else {
            expect(imageBounds!.x).toBeGreaterThanOrEqual(textBounds!.x + textBounds!.width - 1);
            expect(imageBounds!.y).toBeLessThan(textBounds!.y + textBounds!.height);
        }
    }
});

publicTest("main landing CTA is at least 48px tall and receives visible keyboard focus", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await page.goto("/");

    const cta = page.getByRole("main").getByRole("link", { name: "Mulai Jejakmu" });
    const bounds = await cta.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(48);

    let focused = false;
    for (let tab = 0; tab < 20; tab++) {
        await page.keyboard.press("Tab");
        focused = await cta.evaluate((element) => element === document.activeElement);
        if (focused) break;
    }
    expect(focused).toBe(true);
    await expect(cta).toBeFocused();
    expect(await cta.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
    })).toBe(true);
});
