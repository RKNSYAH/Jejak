import { expect, test, type Page } from "@playwright/test";
import type { HciClick, HciClickBatch } from "../app/engine/types";

// INP thresholds for click to next frame: 200 ms or less is good, over 500 ms is poor.
// Single clicks can spike under software WebGL, so typical clicks must be good and none poor.
const PAINT_GOOD_MS = 200;
const PAINT_POOR_MS = 500;
// A loaded result within 1 s keeps the user's flow of thought.
const RESPONSE_BUDGET_MS = 1000;
// Simulated API latency so response times cover a real loading state.
const API_DELAY_MS = 300;

// The first five zones preload as recommendations; Cilandak loads on demand.
const zones = ["Tebet", "Setiabudi", "Menteng", "Kebayoran Baru", "Pancoran", "Cilandak"].map((name, index) => ({
    zone_id: `fixture-${index}`, zone_name: name, city_id: "jakarta-selatan", city_name: "Jakarta Selatan", is_sample: true,
    average_monthly_wage_idr: 9_000_000 + index * 250_000, median_monthly_rent_idr: 2_500_000,
    population: 150_000, wage_to_rent_ratio: 3.6 + index / 10,
}));

const details = {
    is_sample: true, places: [],
    facts: [{ metric: "population", value: 150_000, unit: null, source: "Playwright fixture", source_url: null, period_start: null,
        period_end: "2025-12-31", confidence: 0.8, evidence_type: "observed", limitations: null, is_sample: true }],
};

function geometry(zoneId: string) {
    const zone = zones.find((candidate) => candidate.zone_id === zoneId)!;
    const west = 106.76 + Number(zoneId.split("-")[1]) * 0.02;
    const south = -6.28;
    return {
        type: "FeatureCollection",
        features: [{
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[west, south], [west + 0.015, south], [west + 0.015, south + 0.015], [west, south + 0.015], [west, south]]] },
            properties: { zone_id: zoneId, zone_name: zone.zone_name },
        }],
    };
}

async function openMap(page: Page) {
    const batches: HciClickBatch[] = [];
    await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { is_sample: true, zones } }));
    await page.route((url) => /^\/api\/zones\/[^/]+\/intelligence$/.test(url.pathname), async (route) => {
        const url = new URL(route.request().url());
        const zoneId = decodeURIComponent(url.pathname.split("/")[3]);
        await new Promise((resolve) => setTimeout(resolve, API_DELAY_MS));
        await route.fulfill({ json: url.searchParams.get("include_geometry") === "1" ? { details, geometry: geometry(zoneId), geometry_error: null } : details });
    });
    await page.route((url) => url.pathname === "/api/geometry", (route) =>
        route.fulfill({ json: geometry(new URL(route.request().url()).searchParams.get("zone_id")!) }));
    await page.route((url) => url.pathname === "/api/hci", (route) => {
        batches.push(route.request().postDataJSON());
        return route.fulfill({ status: 204 });
    });

    await page.goto("/map?study=e2e");
    // The legend appears with the first recommendation; measure only after they all finish loading.
    await expect(page.getByRole("button", { name: "Legenda" })).toBeVisible();
    await expect(page.getByText("Memuat area peringkat…")).toBeHidden();
    return batches;
}

// Measurements finish asynchronously, so keep flushing until every expected click has been sent.
async function sentClicks(page: Page, batches: HciClickBatch[], count: number): Promise<HciClick[]> {
    await expect.poll(async () => {
        await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
        return batches.flatMap((batch) => batch.clicks).length;
    }).toBe(count);
    const clicks = batches.flatMap((batch) => batch.clicks);
    expect(new Set(batches.map((batch) => batch.session_id)).size).toBe(1);
    expect(batches.every((batch) => batch.participant === "e2e")).toBe(true);
    await test.info().attach("clicks.json", { body: JSON.stringify(clicks, null, 2), contentType: "application/json" });
    return clicks;
}

test("category lens clicks repaint within budget", async ({ page }) => {
    const batches = await openMap(page);
    const lenses = ["Pekerjaan", "Pendidikan", "Hunian", "Mobilitas", "Ringkasan"];
    for (const name of lenses) {
        const button = page.getByRole("button", { name, exact: true });
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
    }

    const clicks = await sentClicks(page, batches, lenses.length);
    expect(clicks.map(({ region, target }) => [region, target])).toEqual(lenses.map((name) => ["categories", name]));
    const paints = clicks.map((click) => click.paint_ms).sort((a, b) => a - b);
    expect(paints[Math.floor(paints.length / 2)]).toBeLessThanOrEqual(PAINT_GOOD_MS);
    expect(paints.at(-1)).toBeLessThanOrEqual(PAINT_POOR_MS);
});

test("selecting an unloaded zone from search responds within budget", async ({ page }) => {
    const batches = await openMap(page);
    const search = page.getByRole("searchbox");
    await search.click();
    await search.fill("Cilandak");
    await page.getByRole("list", { name: "Supported zones" }).getByRole("button", { name: /Cilandak/ }).click();
    await expect(page.getByRole("heading", { name: "Cilandak" })).toBeVisible();

    const [, select] = await sentClicks(page, batches, 2);
    expect(select).toMatchObject({ region: "search", target: "Cilandak Jakarta Selatan" });
    expect(select.paint_ms).toBeLessThanOrEqual(PAINT_POOR_MS);
    // The response waits for this selection's work and result frame, including the API delay.
    expect(select.response_ms).toBeGreaterThanOrEqual(API_DELAY_MS);
    expect(select.response_ms).toBeLessThanOrEqual(RESPONSE_BUDGET_MS);
});

test("an unrelated busy element does not extend a selection response", async ({ page }) => {
    const batches = await openMap(page);
    await page.evaluate(() => {
        const unrelated = document.createElement("div");
        unrelated.setAttribute("aria-busy", "true");
        document.body.append(unrelated);
    });
    await page.getByRole("searchbox").fill("Cilandak");
    await page.getByRole("list", { name: "Supported zones" }).getByRole("button", { name: /Cilandak/ }).click();

    const [select] = await sentClicks(page, batches, 1);
    expect(select.response_ms).toBeGreaterThanOrEqual(API_DELAY_MS);
    // Completion while the unrelated element is still busy proves attribution;
    // the dedicated selection test above enforces the latency budget.
    expect(select.response_ms).not.toBeNull();
    await expect(page.locator('body > [aria-busy="true"]')).toHaveCount(1);
});

test("a category click finishes while a previous selection is still loading", async ({ page }) => {
    const batches = await openMap(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/zones/fixture-5/intelligence?*", async (route) => {
        await gate;
        await route.fulfill({ json: { details, geometry: geometry("fixture-5"), geometry_error: null } });
    });
    try {
        await page.getByRole("searchbox").fill("Cilandak");
        await page.getByRole("list", { name: "Supported zones" }).getByRole("button", { name: /Cilandak/ }).click();
        // Mobile search keeps the detail panel hidden until its geometry is ready.
        await expect(page.locator('[aria-busy="true"]').first()).toBeAttached();
        await page.getByRole("button", { name: "Hunian", exact: true }).click();

        const [unrelated] = await sentClicks(page, batches, 1);
        expect(unrelated).toMatchObject({ region: "categories", target: "Hunian" });
        expect(unrelated.response_ms).toBe(unrelated.paint_ms);
        await expect(page.locator('[aria-busy="true"]').first()).toBeAttached();
    } finally {
        release();
    }
    const clicks = await sentClicks(page, batches, 2);
    expect(clicks.find((click) => click.region === "search")?.response_ms).toBeGreaterThan(0);
});

test("cancelling a pending selection records a null response", async ({ page, isMobile }) => {
    const batches = await openMap(page);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/api/zones/fixture-5/intelligence?*", async (route) => {
        await gate;
        await route.fulfill({ json: { details, geometry: geometry("fixture-5"), geometry_error: null } });
    });
    try {
        await page.getByRole("searchbox").fill("Cilandak");
        await page.getByRole("list", { name: "Supported zones" }).getByRole("button", { name: /Cilandak/ }).click();
        const cancelLabel = isMobile ? "Reset semua lapisan peta" : "Close Cilandak details";
        await page.getByRole("button", { name: cancelLabel }).click();
        const clicks = await sentClicks(page, batches, 2);
        expect(clicks.find((click) => click.region === "search")).toMatchObject({ response_ms: null });
        const cancel = clicks.find((click) => click.target === cancelLabel)!;
        expect(cancel.response_ms).toBe(cancel.paint_ms);
    } finally {
        release();
    }
});

test("click rate ignores map pans and keeps keyboard activation", async ({ page }) => {
    const batches = await openMap(page);
    const box = (await page.locator(".maplibregl-canvas").boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 120, y + 40, { steps: 8 });
    await page.mouse.up();
    await page.mouse.click(x, y);
    await page.getByRole("button", { name: "Hunian", exact: true }).focus();
    await page.keyboard.press("Enter");

    const [mapClick, keyboard] = await sentClicks(page, batches, 2);
    expect(mapClick).toMatchObject({ region: "map", target: "Map" });
    expect(mapClick.x).toBeCloseTo(x / page.viewportSize()!.width, 2);
    expect(keyboard).toMatchObject({ region: "categories", target: "Hunian", x: null, y: null });
});
