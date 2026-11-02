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

publicTest("landing page has a semantic heading, three highlights, and a decorative hero image behind the header", async ({ page }, testInfo) => {
    await page.goto("/");

    const main = page.getByRole("main");
    await expect(main.getByRole("heading", { level: 1 })).toBeVisible();

    const highlights = page.locator('[data-hci-region="landing-highlights"]');
    await expect(highlights.getByRole("listitem")).toHaveCount(3);
    await expect(highlights).not.toContainText(/(?:3|50)\s*\+/);

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
    const highlights = page.locator('[data-hci-region="landing-highlights"] ul');
    for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(main.getByRole("heading", { level: 1 })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);

        const heroBounds = (await hero.boundingBox())!;
        const cardBounds = (await highlights.boundingBox())!;
        expect(cardBounds.y).toBeLessThan(heroBounds.y + heroBounds.height);
        expect(cardBounds.y + cardBounds.height).toBeGreaterThan(heroBounds.y + heroBounds.height);
    }
    await page.screenshot({ path: testInfo.outputPath("landing.png") });
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
