import { expect, test as publicTest } from "@playwright/test";
import { test } from "./fixtures/auth";

publicTest("guest landing page links its main CTA to login", async ({ page }) => {
    await page.goto("/");

    const main = page.getByRole("main");
    await expect(main.locator('[data-hci-region="landing-hero-start"]')).toHaveAttribute("href", "/login");
    await expect(main.locator('[data-hci-region="landing-bottom-start"]')).toHaveAttribute("href", "/login");
    await expect(main.getByText("Sudah punya akun?", { exact: false })).toBeVisible();
});

test("signed-in landing page links its main CTA to the map without a login prompt", async ({ page }) => {
    await page.goto("/");

    const main = page.getByRole("main");
    await expect(main.locator('[data-hci-region="landing-hero-start"]')).toHaveAttribute("href", "/map");
    await expect(main.locator('[data-hci-region="landing-bottom-start"]')).toHaveAttribute("href", "/map");
    await expect(main.getByText("Sudah punya akun?", { exact: false })).toHaveCount(0);
});

publicTest("landing page shows product screenshots and a decorative hero image behind the header", async ({ page }, testInfo) => {
    await page.goto("/");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();

    const walkthrough = page.locator('[data-hci-region="landing-walkthrough"]');
    await expect(walkthrough.getByRole("img")).toBeVisible();
    await expect(walkthrough.getByRole("img")).toHaveAttribute("src", "/landing/map-workspace.png");
    await expect(page.locator('[data-hci-region="landing-tradeoff"]').getByRole("img")).toHaveCount(2);
    await expect(page.locator('[data-hci-region="landing-sourcing"]').getByRole("link")).toHaveCount(0);

    const imageSlot = page.locator('[data-hci-region="landing-image"]');
    await expect(imageSlot).toHaveAttribute("aria-hidden", "true");
    await expect(imageSlot.locator("img")).toHaveAttribute("alt", "");
    const bounds = (await imageSlot.boundingBox())!;
    const header = (await page.getByRole("banner").boundingBox())!;
    expect(bounds.y).toBeLessThanOrEqual(header.y);
    if (testInfo.project.name === "desktop") {
        await expect(page.getByRole("banner").getByRole("link", { name: "Mulai Jejakmu" })).toHaveClass(/btn-primary/);
    }
});

publicTest("landing layout reflows without horizontal overflow from mobile to desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await page.goto("/");

    const main = page.getByRole("main");
    const hero = page.locator('[data-hci-region="landing-hero"]');
    const walkthrough = page.locator('[data-hci-region="landing-walkthrough"]');
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

        const heroBounds = (await hero.boundingBox())!;
        const walkthroughBounds = (await walkthrough.boundingBox())!;
        expect(walkthroughBounds.y).toBeGreaterThanOrEqual(heroBounds.y + heroBounds.height);
    }
    await page.screenshot({ path: testInfo.outputPath("landing.png") });
});

publicTest("main landing CTA is at least 48px tall and receives visible keyboard focus", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop");
    await page.goto("/");

    const cta = page.locator('[data-hci-region="landing-hero-start"]');
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
