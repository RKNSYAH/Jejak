import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/auth";
import { stubZones } from "./fixtures/map";

const originalWeights = { career: 0.5, education: 0, housing: 0.15, cost_of_living: 0.05, commute: 0.2, environment: 0.1 };

async function startReview(page: Page) {
    await stubZones(page);
    await page.route((url) => url.pathname === "/api/lf05", (route) => route.fulfill({ json: { profile: {
        hard_constraints: { goal: "work", destination_cities: ["Jakarta Selatan"],
            monthly_budget: { amount: 8_000_000, currency: "IDR", period: "month" },
            housing_budget: { amount: 4_000_000, currency: "IDR", period: "month" }, commute_minutes: 45 },
        soft_preferences: { housing_types: ["kos"], transport_mode: "motorcycle", destination: { name: "Jakarta Selatan", precision: "city" } },
        priority_weights: originalWeights, inferred_fields: ["goal", "priorities", "housing_budget"],
        clarification_questions: [], requires_confirmation: true, confirmed: false,
        taxonomy_version: "2026-09", contract_version: "lf05-v2", writes_performed: false,
        decision_trace: {}, runtime_usage: null,
    } } }));
    await page.route((url) => url.pathname === "/api/onboarding/preview", (route) => route.fulfill({ json: {
        cities: [{ city_id: "jakarta-selatan", city_name: "Kota Administrasi Jakarta Selatan", district_count: 2,
            center: [106.81, -6.245], is_sample: true }],
        areas: ["a", "b"].map((id, index) => ({
            zone_id: `jakarta-selatan-${id}`, zone_name: `Kecamatan ${id.toUpperCase()}`,
            city_id: "jakarta-selatan", city_name: "Kota Administrasi Jakarta Selatan", is_sample: true,
            center: index ? [106.82, -6.24] : [106.8, -6.25], campuses: [], transit_stop_count: 0,
            living_cost: { value: 3_000_000, source: "Biaya kota", source_url: "https://example.test/cost", limitations: null, is_sample: true },
            facts: [
                { metric: "median_monthly_rent_idr", value: index ? 3_000_000 : 1_500_000, unit: "IDR",
                    source: "Survei hunian", source_url: "https://example.test/rent", period_end: "2026-09-30",
                    evidence_type: "derived", limitations: null, is_sample: true, dimension_key: "housing_type", dimension_value: "kos" },
                { metric: "company_count", value: index ? 100 : 1, unit: "company", source: "Direktori perusahaan",
                    source_url: "https://example.test/companies", period_end: "2026-09-30", evidence_type: "observed", limitations: null, is_sample: true },
            ],
        })), destinations: [],
    } }));
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill("Saya pindah ke Jakarta Selatan untuk bekerja, naik motor.");
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(page.getByRole("heading", { name: /Atur prioritasmu/ })).toBeVisible();
}

test("story review keeps the map live, resets inferred weights, picks a destination and saves edited priorities", async ({ page }, testInfo) => {
    let analyses = 0;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/lf05") analyses++; });
    await startReview(page);
    const panel = page.locator('[data-hci-region="relocation-onboarding-step-3"]');
    const ranking = page.getByRole("list", { name: "Peringkat teratas" });
    await expect(panel).toHaveJSProperty("open", true);
    expect(await panel.evaluate((element) => element.matches(":modal"))).toBe(false);
    await expect(panel.locator('[data-hci-region="story-review-profile"]')).toContainText("Sewa ≤ Rp4 jt");
    if (testInfo.project.name === "desktop") await expect(panel.getByRole("slider", { name: "Lingkungan", exact: true })).toBeInViewport();
    await expect(ranking.locator("li").first()).toContainText("Kecamatan B");
    await expect(page.locator('[data-hci-region="onboarding-preview"]')).toContainText("Data contoh");
    await page.screenshot({ path: testInfo.outputPath("story-review-initial.png") });
    const affordability = panel.getByRole("slider", { name: "Keterjangkauan", exact: true });
    await affordability.fill("90");
    await expect(affordability).toHaveValue("90");
    await expect(ranking.locator("li").first()).toContainText("Kecamatan A");
    expect(await panel.getByRole("slider").evaluateAll((inputs) => inputs.reduce((sum, input) => sum + Number((input as HTMLInputElement).value), 0))).toBe(100);
    await expect(panel.getByRole("button", { name: "Benar", exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Atur ulang dari ceritaku" }).click();
    await expect(affordability).toHaveValue("20");
    await expect(ranking.locator("li").first()).toContainText("Kecamatan B");
    await expect(panel.getByRole("button", { name: "Benar", exact: true })).toBeVisible();
    await affordability.fill("90");
    await page.screenshot({ path: testInfo.outputPath("story-review.png") });
    await panel.getByRole("button", { name: "Ubah profil", exact: true }).click();
    await expect(panel.locator('[data-hci-region="story-review-details"]')).toHaveAttribute("open", "");
    await expect(panel.locator('[data-hci-region="story-review-details"] summary')).toBeFocused();

    const save = panel.getByRole("button", { name: "Selesai, buka peta", exact: true });
    await panel.getByRole("button", { name: "Pilih di peta", exact: true }).click();
    await expect(save).toBeDisabled();
    await page.locator(".maplibregl-canvas").click({ position: { x: 150, y: testInfo.project.name === "mobile" ? 170 : 180 } });
    await expect(panel.locator('[data-hci-region="story-review-profile"]')).toContainText("Titik pilihanmu");
    await expect(save).toBeEnabled();
    const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem("jejak:relocation-onboarding")!));
    expect(draft.proposal.soft_preferences.destination).toEqual({ name: "Titik pilihanmu", precision: "point", ...draft.mapPoint });
    expect(draft.proposal.priority_weights.housing / draft.proposal.priority_weights.cost_of_living).toBeCloseTo(3);
    expect(analyses).toBe(1);

    let saves = 0;
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        saves++;
        expect(route.request().postDataJSON().proposal.priority_weights).toEqual(draft.proposal.priority_weights);
        expect(route.request().postDataJSON().confirmed_fields).toContain("goal");
        expect(route.request().postDataJSON().confirmed_fields).not.toContain("priorities");
        return saves === 1 ? route.fulfill({ status: 503, json: { error: "Profil belum tersimpan. Coba lagi." } }) : route.fallback();
    });
    await save.click();
    await expect(panel.getByRole("alert")).toContainText("Profil belum tersimpan");
    await save.click();
    await expect(panel).toHaveCount(0);
    const saved = (await (await page.request.get("/api/user/relocation-profile")).json()).profile;
    expect(saved.profile.priority_weights).toEqual(draft.proposal.priority_weights);
    expect(saved.profile.soft_preferences.destination).toEqual(draft.proposal.soft_preferences.destination);
    expect(saves).toBe(2);
});

test("mobile story review keeps navigation reachable and collapses to reveal the map", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile");
    await startReview(page);
    const panel = page.locator('[data-hci-region="relocation-onboarding-step-3"]');
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 640, height: 360 }]) {
        await page.setViewportSize(viewport);
        const bounds = (await panel.boundingBox())!;
        const save = (await panel.getByRole("button", { name: "Selesai, buka peta", exact: true }).boundingBox())!;
        expect(bounds.y).toBeGreaterThan(0);
        expect(save.height).toBeGreaterThanOrEqual(44);
        expect(save.y + save.height).toBeLessThanOrEqual(viewport.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Perkecil prioritas untuk melihat peta" }).click();
    await expect(page.getByRole("button", { name: "Buka prioritas" })).toHaveAttribute("aria-expanded", "false");
    await expect(panel.getByRole("button", { name: "Selesai, buka peta" })).toBeHidden();
    await page.getByRole("button", { name: "Buka prioritas" }).press("Enter");
    await expect(panel.getByRole("button", { name: "Selesai, buka peta" })).toBeVisible();
    const career = panel.getByRole("slider", { name: "Karier", exact: true });
    await career.focus();
    await career.press("ArrowRight");
    await expect(career).toHaveValue("51");
    await panel.getByRole("button", { name: "Kembali", exact: true }).click();
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await expect(panel.getByRole("slider", { name: "Karier", exact: true })).toHaveValue("51");
});
