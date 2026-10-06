import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/auth";
import { stubZones } from "./fixtures/map";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import type { RoutingPoint } from "../app/engine/routing/types";
import { estimatePlanningReach } from "../app/engine/onboarding/planningReach";
import { formPreviewPreferences } from "../app/engine/onboarding/livePreview";

const metros = {
    jakarta: { id: "jakarta-selatan", name: "Jakarta Selatan", center: [106.82, -6.24] as RoutingPoint },
    bandung: { id: "bandung-kota", name: "Bandung", center: [107.61, -6.91] as RoutingPoint },
    surabaya: { id: "surabaya-kota", name: "Surabaya", center: [112.75, -7.25] as RoutingPoint },
};

async function openReachForm(page: Page, region: keyof typeof metros) {
    const city = metros[region];
    let routeCalls = 0;
    await stubZones(page);
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => route.request().method() === "GET"
        ? route.fulfill({ json: { profile: null } }) : route.fallback());
    const areas = [0, 1].map((index) => ({ zone_id: `${city.id}-${index ? "b" : "a"}`, zone_name: `Kecamatan ${index ? "B" : "A"}`,
        city_id: city.id, city_name: city.name, is_sample: false, center: [city.center[0] - 0.02 + index * 0.01, city.center[1] - 0.01],
        facts: [{ metric: "median_monthly_rent_idr", value: 1_500_000, unit: "IDR", source: "Survei fixture", source_url: null,
            period_end: null, evidence_type: "derived", limitations: null, is_sample: false, dimension_key: "housing_type", dimension_value: "kos" }],
        campuses: [], transit_stop_count: 0, living_cost: { value: 3_000_000, source: "Biaya fixture", source_url: null, limitations: null, is_sample: false } }));
    await page.route((url) => url.pathname === "/api/onboarding/preview", (route) => route.fulfill({ json: {
        cities: Object.values(metros).map((metro) => ({ city_id: metro.id, city_name: metro.name, district_count: 2, center: metro.center, is_sample: false })),
        areas, destinations: [],
    } }));
    await page.route((url) => url.pathname === "/api/onboarding/geometry", (route) => route.fulfill({ json: {
        geometry: { type: "FeatureCollection", features: areas.map((area) => {
            const [x, y] = area.center;
            return { type: "Feature", properties: { zone_id: area.zone_id, zone_name: area.zone_name },
                geometry: { type: "Polygon", coordinates: [[[x - 0.005, y - 0.005], [x + 0.005, y - 0.005], [x + 0.005, y + 0.005], [x - 0.005, y + 0.005], [x - 0.005, y - 0.005]]] } };
        }) }, missingZones: [],
    } }));
    await page.route((url) => /^\/api\/zones\/[^/]+\/intelligence$/.test(url.pathname), (route) => {
        const area = areas.find((item) => route.request().url().includes(item.zone_id));
        if (!area) return route.fallback();
        const [x, y] = area.center;
        const details = { is_sample: area.is_sample, facts: area.facts, places: [] };
        return route.fulfill({ json: new URL(route.request().url()).searchParams.has("include_geometry") ? {
            details, geometry_error: null, geometry: { type: "FeatureCollection", features: [{
                type: "Feature", properties: { zone_id: area.zone_id, zone_name: area.zone_name },
                geometry: { type: "Polygon", coordinates: [[[x - 0.005, y - 0.005], [x + 0.005, y - 0.005], [x + 0.005, y + 0.005], [x - 0.005, y + 0.005], [x - 0.005, y - 0.005]]] },
            }] },
        } : details });
    });
    // The overlay must work even when the journey endpoint cannot serve anything.
    await page.route((url) => url.pathname === "/api/onboarding/commute", (route) => { routeCalls++; return route.abort(); });
    await page.addInitScript(({ cityId, point, defaults }) => {
        // Seed the first visit only; subsequent visits must use the saved/skipped state.
        if (sessionStorage.getItem("jejak:relocation-form:v1")) return;
        sessionStorage.setItem("jejak:relocation-form:v1", JSON.stringify({
            version: 1, status: "active", step: 3, answers: { ...defaults, city: cityId, transport: "car", destinationId: null,
                destinationName: "Kantor fixture", destinationPoint: point },
        }));
    }, { cityId: city.id, point: city.center, defaults: initialFormAnswers });
    await page.goto("/map?onboarding=demo");
    await expect(page.getByRole("heading", { name: "Seberapa jauh perjalanan yang nyaman?" })).toBeVisible();
    return () => routeCalls;
}

for (const region of Object.keys(metros) as (keyof typeof metros)[]) {
    test(`${region} estimated reach updates mode and time without journey services`, async ({ page }) => {
        const routeCalls = await openReachForm(page, region);
        const panel = page.locator(".onboarding-form-panel");
        await expect(panel).toContainText("Perkiraan jangkauan 5,1–10,2 km · 2 kecamatan");
        await page.getByText("Lihat daftar kecamatan dan batasnya", { exact: true }).click();
        const list = panel.getByRole("list", { name: "Kecamatan dalam pratinjau" });
        await expect(list).toContainText("Titik kecamatan dalam perkiraan jangkauan");
        await page.getByRole("radio", { name: "Motor", exact: true }).check();
        await expect(panel).toContainText("Perkiraan jangkauan 7,7–15,4 km");
        await page.getByRole("radio", { name: "Jalan kaki", exact: true }).check();
        await expect(panel).toContainText("Perkiraan jangkauan 1,9–3,1 km");
        await expect(list).toContainText("Kecamatan di tepi perkiraan jangkauan");
        await page.getByRole("radio", { name: "15 mnt", exact: true }).check();
        await expect(panel).toContainText("Perkiraan jangkauan 0,6–1,0 km · 0 kecamatan");
        await expect(list).toContainText("Titik kecamatan di luar perkiraan jangkauan");
        await page.getByRole("radio", { name: "45 mnt", exact: true }).check();
        await page.getByRole("radio", { name: "Transport umum", exact: true }).check();
        await expect(panel).toContainText("Perkiraan jangkauan 3,1–7,0 km");
        await expect(panel).not.toContainText("TransJakarta + jalan kaki");
        await expect(panel).not.toContainText(/Layanan transit belum diperiksa|bukan jangkauan jaringan/);
        await page.getByRole("radio", { name: "Siang", exact: true }).check();
        await expect(panel).toContainText("Perkiraan jangkauan 3,9–8,9 km");
        expect(routeCalls()).toBe(0);
    });

    test(`${region} keeps labeled circles and matching zones when exploring the regular map`, async ({ page }, testInfo) => {
        test.setTimeout(60_000);
        const routeCalls = await openReachForm(page, region);
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error" && /layers\.(planning|explore)|Source.*(planning|explore)/.test(message.text())) errors.push(message.text()); });
        await expect(page.locator('[data-hci-region="planning-radius-label"]').filter({ hasText: "Luar · 10,2 km" })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath("setup-circles.png") });
        await page.getByRole("button", { name: "Lanjut", exact: true }).click();
        await page.getByRole("button", { name: "Konfirmasi dan simpan", exact: true }).click();
        await page.getByRole("button", { name: "Jelajahi data peta", exact: true }).click();
        const summary = page.locator('[data-hci-region="map-planning-reach"]');
        await expect(summary).toContainText("Perkiraan jangkauan 5,1–10,2 km");
        await expect(summary).toContainText("2 kecamatan dalam kisaran");
        const headingBox = await summary.getByRole("heading", { name: /Perkiraan jangkauan/ }).boundingBox();
        const feedbackBox = await page.locator('[data-hci-region="profile-save-feedback"]').boundingBox();
        expect(headingBox).not.toBeNull();
        expect(feedbackBox).not.toBeNull();
        expect(feedbackBox!.y).toBeGreaterThanOrEqual(headingBox!.y + headingBox!.height);
        await summary.getByRole("button", { name: "Lihat jangkauan" }).click();
        await expect(page.locator('[data-hci-region="planning-radius-label"]').filter({ hasText: "Dalam · 5,1 km" })).toBeVisible();
        await expect(page.locator('[data-hci-region="planning-radius-label"]').filter({ hasText: "Luar · 10,2 km" })).toBeVisible();
        await expect(summary).not.toContainText(/bukan seluruh wilayah|bukan jangkauan jaringan/);
        await page.screenshot({ path: testInfo.outputPath("regular-circles.png") });
        const separator = page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" });
        await separator.press("End");
        const card = page.locator('[data-hci-region="zone-list"]').getByRole("button", { name: /Kecamatan A/ });
        await expect(card).toHaveAttribute("data-reach-band", "near");
        await expect(card).toContainText("Dalam perkiraan jangkauan");
        await card.click();
        await expect(page.getByRole("heading", { name: "Kecamatan A", exact: true })).toBeVisible();
        if (testInfo.project.name === "mobile") {
            await page.getByRole("button", { name: "Tutup detail Kecamatan A", exact: true }).click();
            await expect(page.getByRole("dialog")).not.toBeVisible();
        }
        await separator.press("Home");
        await page.emulateMedia({ reducedMotion: "reduce" });
        await summary.getByRole("button", { name: "Lihat jangkauan" }).click();
        // The map is north-up with zero pitch. Use its labeled ring and destination
        // as two reference points to click B's database center (no test-only map API).
        const destination = await page.locator('[data-hci-region="planning-destination"]').locator("..").boundingBox();
        const outer = await page.locator('[data-hci-region="planning-radius-label"]').filter({ hasText: "Luar · 10,2 km" }).locator("..").boundingBox();
        expect(destination).not.toBeNull();
        expect(outer).not.toBeNull();
        const reach = estimatePlanningReach({ ...formPreviewPreferences(initialFormAnswers), transport: "car", destinationPoint: metros[region].center }, [])!;
        const outerPoint = reach.geometry.features[0].geometry.coordinates[0][84];
        const [lon, lat] = metros[region].center;
        const scale = (outer!.x + outer!.width / 2 - destination!.x - destination!.width / 2) / (outerPoint[0] - lon);
        const mercator = (latitude: number) => Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360));
        await page.mouse.click(destination!.x + destination!.width / 2 - 0.01 * scale,
            destination!.y + destination!.height - (mercator(lat - 0.01) - mercator(lat)) * scale * 180 / Math.PI);
        await expect(page.getByRole("heading", { name: "Kecamatan B", exact: true })).toBeVisible();
        await page.goto("/map");
        await expect(summary).toContainText("Perkiraan jangkauan 5,1–10,2 km");
        await expect(summary).toContainText("2 kecamatan dalam kisaran");
        await summary.getByRole("button", { name: "Lihat jangkauan" }).click();
        await expect(page.locator('[data-hci-region="planning-radius-label"]').filter({ hasText: "Luar · 10,2 km" })).toBeVisible();
        expect(routeCalls()).toBe(0);
        expect(errors).toEqual([]);
    });
}

test("clearing destination removes the old reach estimate immediately", async ({ page }) => {
    const routeCalls = await openReachForm(page, "jakarta");
    const panel = page.locator(".onboarding-form-panel");
    await expect(panel).toContainText("Perkiraan jangkauan");
    await page.getByRole("button", { name: "Belum tahu tujuan", exact: true }).click();
    await expect(panel).not.toContainText("Perkiraan jangkauan 5,1–10,2 km");
    await expect(panel.locator('[data-hci-region="onboarding-reach-estimate"]')).toContainText("Pilih tujuan untuk melihat jangkauan");
    expect(routeCalls()).toBe(0);
});

test("estimated reach keeps saved map and list selection equivalent", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && /layers\.onboarding|Source.*onboarding/.test(message.text())) errors.push(message.text()); });
    const routeCalls = await openReachForm(page, "jakarta");
    await expect(page.locator(".onboarding-form-panel")).toContainText("Perkiraan jangkauan");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page.getByRole("button", { name: "Konfirmasi dan simpan", exact: true }).click();
    await expect(page.locator(".onboarding-form-panel")).toHaveCount(0);
    const separator = page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" });
    await separator.press("End");
    const card = page.locator('[data-hci-region="zone-list"]').getByRole("button", { name: /Kecamatan A/ });
    await expect(card).toContainText("Dalam perkiraan jangkauan");
    await card.click();
    await expect(page.getByRole("region", { name: "Data Kecamatan A" })).toBeVisible();
    await separator.press("Home");
    await page.locator(".maplibregl-marker button").filter({ hasText: "Kecamatan B" }).click();
    await expect(page.getByRole("region", { name: "Data Kecamatan B" })).toBeVisible();
    await expect(page.locator('[data-hci-region="onboarding-preview"]')).toContainText("Perkiraan jangkauan");
    expect(routeCalls()).toBe(0);
    expect(errors).toEqual([]);
});
