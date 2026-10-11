import { expect } from "@playwright/test";
import { test } from "./fixtures/auth";
import { openDemoMap, stubZones } from "./fixtures/map";

const zones = Array.from({ length: 30 }, (_, index) => ({
    zone_id: `area-${index + 1}`,
    zone_name: `Area ${index + 1}`,
    city_id: "jakarta-selatan",
    city_name: "Jakarta Selatan",
    is_sample: false,
    average_monthly_wage_idr: null,
    median_monthly_rent_idr: null,
    population: null,
    wage_to_rent_ratio: null,
}));

test("expanded exploration sheet wraps cards and scrolls vertically", async ({ page }) => {
    await stubZones(page, zones);
    await openDemoMap(page);

    const sheet = page.locator('[data-hci-region="zone-list"]');
    const handle = sheet.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" });
    const scroller = sheet.locator(".\\@container");
    const cards = sheet.locator("button.card");
    await expect(cards).toHaveCount(zones.length);

    // The intermediate snap remains a horizontal carousel.
    for (let step = 0; step < 4; step++) await handle.press("ArrowUp");
    await expect.poll(() => scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);

    await handle.press("End");
    await expect.poll(() => scroller.evaluate((element) => {
        const style = getComputedStyle(element);
        return style.overflowY === "auto"
            && element.scrollWidth <= element.clientWidth
            && element.scrollHeight > element.clientHeight;
    })).toBe(true);

    // Read all positions in one frame while the sheet's height animates.
    const [first, second, last] = await cards.evaluateAll((elements) =>
        [elements[0], elements[1], elements[elements.length - 1]].map((element) => {
            const { y, height } = element.getBoundingClientRect();
            return { y, height };
        }));
    expect(Math.abs(first.y - second.y)).toBeLessThan(1);
    expect(last.y).toBeGreaterThan(first.y + first.height);

    await cards.last().scrollIntoViewIfNeeded();
    await expect(cards.last()).toBeInViewport();
    expect(await scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await scroller.evaluate((element) => element.scrollLeft)).toBe(0);
});
