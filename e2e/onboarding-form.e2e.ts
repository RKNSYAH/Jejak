import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/auth";
import { stubZones } from "./fixtures/map";

async function startForm(page: Page, savedProfile: Record<string, unknown> | null = null, beforeOpen?: () => Promise<void>) {
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => route.request().method() === "GET"
        ? route.fulfill({ json: { profile: savedProfile } }) : route.fallback());
    await stubZones(page);
    await beforeOpen?.();
    await page.goto("/map?onboarding=demo");
    await page.getByRole("button", { name: "Isi formulir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Apa yang membawamu pindah?" })).toBeVisible();
}

test("explicit demo entry also works for an account with a confirmed profile", async ({ page }) => {
    await startForm(page, { id: "saved-profile", profile_name: "primary", revision: 1, confirmed_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
        profile: { schema_version: "relocation-profile-v1", hard_constraints: { goal: "work" }, soft_preferences: {}, priority_weights: { career: 1 }, taxonomy_version: "2026-09", contract_version: "lf05-v2" } });
    await expect(page.getByRole("heading", { name: "Apa yang membawamu pindah?" })).toBeVisible();
});

test("preview card stays compact across steps and keeps the district disclosure usable", async ({ page }, testInfo) => {
    await startForm(page);
    const preview = page.locator('[data-hci-region="onboarding-preview"]');
    const mobile = testInfo.project.name === "mobile";
    await expect(preview).toContainText("Jakarta Selatan");

    for (let step = 1; step <= 4; step++) {
        if (step > 1) await page.getByRole("button", { name: "Lanjut", exact: true }).click();
        await expect(page.locator(".onboarding-form-panel")).toContainText(`Langkah ${step} dari 4`);
        const bounds = await preview.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.height).toBeLessThanOrEqual(mobile ? 90 : step === 1 ? 76 : 180);
        expect(bounds!.y).toBeGreaterThanOrEqual(0);
        expect(await preview.evaluate((card) => {
            const outer = card.getBoundingClientRect();
            return Array.from(card.querySelectorAll("p, button, span")).every((element) => {
                const inner = element.getBoundingClientRect();
                return inner.width === 0 || inner.height === 0 || (inner.left >= outer.left && inner.right <= outer.right + 1
                    && inner.top >= outer.top && inner.bottom <= outer.bottom + 1);
            });
        })).toBe(true);

        if (!mobile) {
            const toggle = preview.getByRole("button", { name: "Lihat daftar kecamatan", exact: true });
            const toggleBounds = await toggle.boundingBox();
            expect(toggleBounds!.height).toBeGreaterThanOrEqual(44);
            expect(toggleBounds!.y).toBeLessThan(bounds!.y + 24);
            if (step === 2 || step === 4) {
                const matchingKey = await preview.getByText("Sewa dan biaya sesuai", { exact: true }).boundingBox();
                const otherKey = await preview.getByText("Data kurang / di luar batas", { exact: true }).boundingBox();
                expect(Math.abs(matchingKey!.y - otherKey!.y)).toBeLessThanOrEqual(1);
            }
            await toggle.focus();
            await toggle.press("Enter");
            const close = preview.getByRole("button", { name: "Tutup daftar kecamatan", exact: true });
            await expect(close).toHaveAttribute("aria-expanded", "true");
            await expect(preview.getByRole("list", { name: "Kecamatan dalam pratinjau" })).toBeVisible();
            await close.press("Enter");
            await expect(toggle).toHaveAttribute("aria-expanded", "false");
        }
        await page.screenshot({ path: testInfo.outputPath(`compact-preview-step-${step}.png`) });
    }
});

test("form uses database-shaped evidence, saves a map-picked destination, and keeps map/list selection aligned", async ({ page }, testInfo) => {
    const liveCalls: string[] = [];
    const errors: string[] = [];
    const viewport = page.viewportSize();
    const mobile = (viewport?.width ?? 1280) < 768;
    page.on("request", (request) => { if (/\/api\/(zones|geometry|heatmap|lf05)/.test(request.url())) liveCalls.push(request.url()); });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && /layers\.onboarding|Source.*onboarding/.test(message.text())) errors.push(message.text()); });
    await startForm(page);
    await page.screenshot({ path: testInfo.outputPath("step-1.png") });
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Berapa batas yang realistis?" })).toBeVisible();
    const preview = page.locator('[data-hci-region="onboarding-preview"]');
    await expect(preview).toContainText("1 kecamatan memenuhi batas");
    await page.getByText("Lihat daftar kecamatan dan batasnya", { exact: true }).click();
    const districtList = page.getByRole("list", { name: "Kecamatan dalam pratinjau" });
    await expect(districtList).toContainText("Kecamatan A");
    const districtA = districtList.getByRole("button", { name: /Kecamatan A/ });
    await districtA.click();
    await expect(districtA).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("1.000.000");
    await expect(preview).toContainText("0 kecamatan memenuhi batas");
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("2.500.000");
    await expect(preview).toContainText("1 kecamatan memenuhi batas");
    await page.screenshot({ path: testInfo.outputPath("step-2.png") });

    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Seberapa jauh perjalanan yang nyaman?" })).toBeVisible();
    await page.getByRole("button", { name: "Pilih titik di peta", exact: true }).click();
    await page.mouse.click(mobile ? (viewport?.width ?? 412) - 4 : 150, mobile ? 60 : 180);
    await expect(page.getByText("Titik pilihanmu di peta")).toBeVisible();
    await expect(preview).toContainText("belum tersedia tanpa graf rute");
    await expect(districtList.getByRole("button", { name: /Kecamatan A/ })).toContainText("Estimasi rute belum tersedia");
    await page.getByRole("radio", { name: "Motor", exact: true }).check();
    await page.screenshot({ path: testInfo.outputPath("step-3.png") });
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Apa yang paling penting untukmu?" })).toBeVisible();
    const career = page.getByRole("slider", { name: "Karier", exact: true });
    await career.fill("65");
    await expect(career).toHaveValue("65");
    expect(await page.locator('input[type="range"]').evaluateAll((inputs) => inputs.reduce((sum, input) => sum + Number((input as HTMLInputElement).value), 0))).toBe(100);
    await page.screenshot({ path: testInfo.outputPath("step-4.png") });
    const saveResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/user/relocation-profile" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Konfirmasi dan simpan", exact: true }).click();
    const response = await saveResponse;
    expect(response.status()).toBe(201);
    const { profile: saved } = await response.json();
    expect(saved.profile.hard_constraints.goal).toBe("work");
    expect(saved.profile.hard_constraints.housing_budget.amount).toBe(2500000);
    expect(saved.profile.soft_preferences.transport_mode).toBe("motorcycle");
    expect(saved.profile.soft_preferences.career_stage).toBeNull();
    expect(saved.profile.soft_preferences.extras).toEqual([]);
    expect(saved.profile.soft_preferences.destination).toEqual({
        name: "Titik pilihanmu", precision: "point",
        longitude: expect.any(Number), latitude: expect.any(Number),
    });
    const backend = await page.request.get("/api/user/relocation-profile");
    expect((await backend.json()).profile).toEqual(saved);
    await expect(page.locator(".onboarding-form-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sesuaikan rencana" })).toHaveCount(1);
    await expect(page.locator('[data-hci-region="profile-save-feedback"]')).toContainText("Profil tersimpan di akunmu");
    expect(liveCalls).toEqual([]);
    expect(errors).toEqual([]);

    await page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" }).press("End");
    await expect(page.getByRole("heading", { name: "Kecamatan dalam pratinjau" })).toBeVisible();
    await expect(page.locator('[data-hci-region="zone-list"]')).toContainText("Kecamatan A");
    const separator = page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" });
    const resultCard = page.locator('[data-hci-region="zone-list"]').getByRole("button", { name: /Kecamatan A/ });
    await resultCard.click();
    const detail = page.getByRole("region", { name: "Data Kecamatan A" });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Survei hunian fixture");
    if (!mobile) {
        await separator.press("Home");
        const marker = page.locator(".maplibregl-marker button").filter({ hasText: "Kecamatan A" });
        await marker.click();
        await expect(detail).toContainText("Median sewa / bulan");
    }
    await page.reload();
    await expect(page.locator(".onboarding-form-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sesuaikan rencana" })).toHaveCount(1);
    await page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" }).press("End");
    await page.getByRole("button", { name: "Sesuaikan rencana" }).click();
    await expect(page.getByRole("heading", { name: "Apa yang paling penting untukmu?" })).toBeVisible();
});

test("costs stay outside the collapsed list and removed optional questions are absent", async ({ page }) => {
    await startForm(page);
    await expect(page.getByRole("group", { name: "Pengalaman kerja" })).toHaveCount(0);
    await expect(page.locator('[name="experience"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    const costs = page.locator('[data-hci-region="onboarding-cost-estimate"]');
    await expect(costs.getByRole("heading", { name: "Perkiraan biaya bulanan" })).toBeVisible();
    await expect(costs).toContainText("sekitar Rp3.000.000");
    await expect(page.locator('[data-hci-region="onboarding-accessible-results"]')).not.toHaveAttribute("open", "");
    const district = costs.getByRole("combobox", { name: "Kecamatan untuk dibandingkan" });
    await district.selectOption("jakarta-selatan-a");
    await expect(costs).toContainText("sekitar Rp4.500.000");
    await expect(costs).not.toContainText("Batas belum terverifikasi");
    await expect(costs).not.toContainText("Sewa di atas batasmu");
    await district.selectOption("jakarta-selatan-b");
    await expect(costs).toContainText("sekitar Rp6.000.000");
    await expect(costs).toContainText("Sewa di atas batasmu");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(district).toHaveValue("jakarta-selatan-b");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(costs).toContainText("sekitar Rp6.000.000");
    await expect(page.locator('[name="extras"]')).toHaveCount(0);
    await expect(page.getByText("Internet stabil", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Dekat layanan kesehatan", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Lingkungan tenang", { exact: true })).toHaveCount(0);
});

test("late boundaries and form resizing preserve the selected district and camera", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Use an empty local-style basemap so camera checks do not depend on tile availability.
    await page.route("https://tiles.openfreemap.org/**", (route) => {
        if (new URL(route.request().url()).pathname === "/planet") return route.fulfill({ json: {
            tilejson: "2.2.0", minzoom: 0, maxzoom: 14, tiles: ["https://tiles.openfreemap.org/camera-fixture/{z}/{x}/{y}.pbf"],
        } });
        return route.fulfill({ contentType: "application/x-protobuf", body: Buffer.alloc(0) });
    });
    let releaseBoundaries!: () => void;
    const held = new Promise<void>((resolve) => { releaseBoundaries = resolve; });
    let geometryRequests = 0;
    try {
        await startForm(page, null, async () => {
            await page.route((url) => url.pathname === "/api/onboarding/geometry", async (route) => {
                geometryRequests++;
                await held;
                await route.fallback();
            });
        });
        await expect.poll(() => geometryRequests).toBe(1);
        await page.getByRole("button", { name: "Lanjut", exact: true }).click();
        const district = page.getByRole("combobox", { name: "Kecamatan untuk dibandingkan" });
        await district.selectOption("jakarta-selatan-a");
        const marker = page.locator(".maplibregl-marker").filter({ hasText: "Kecamatan A" });
        await expect(marker).toBeAttached();
        const before = await marker.getAttribute("style");
        const response = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/onboarding/geometry");
        releaseBoundaries();
        await response;
        await expect(page.locator('[data-hci-region="onboarding-preview"]')).not.toContainText("Memuat batas kecamatan");
        await expect(district).toHaveValue("jakarta-selatan-a");
        await expect(marker).toHaveAttribute("style", before!);
        await page.getByRole("button", { name: "Lanjut", exact: true }).click();
        await expect(marker).toHaveAttribute("style", before!);
        await expect(district).toHaveValue("jakarta-selatan-a");
        expect(geometryRequests).toBe(1);
        await page.getByRole("button", { name: "Kembali", exact: true }).click();
        await page.getByRole("button", { name: "Kembali", exact: true }).click();
        await page.getByLabel("Kota tujuan", { exact: true }).selectOption("bandung-kota");
        await page.getByRole("button", { name: "Lanjut", exact: true }).click();
        await expect(district).toHaveValue("");
        await expect(district).toContainText("Kecamatan Bandung");
        await expect(district).not.toContainText("Kecamatan A");
    } finally {
        releaseBoundaries();
    }
});

test("failed form save keeps inputs and allows a real backend retry", async ({ page }) => {
    await startForm(page);
    await page.getByLabel("Pekerjaan", { exact: true }).fill("Data analyst");
    for (let step = 1; step < 4; step++) await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    let attempts = 0;
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        attempts++;
        if (attempts === 1) return route.fulfill({ status: 503, json: { error: "Profil belum tersimpan. Coba lagi." } });
        expect(route.request().postDataJSON().form_answers.occupation).toBe("Data analyst");
        return route.fallback();
    });
    const save = page.getByRole("button", { name: "Konfirmasi dan simpan", exact: true });
    await save.click();
    await expect(page.locator(".onboarding-form-panel").getByRole("alert")).toContainText("Profil belum tersimpan");
    await expect(page.locator(".onboarding-form-panel")).toBeVisible();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.locator(".onboarding-form-panel")).toHaveCount(0);
    expect(attempts).toBe(2);
    const backend = (await (await page.request.get("/api/user/relocation-profile")).json()).profile;
    expect(backend.profile.soft_preferences.occupation).toBe("Data analyst");
    await page.unrouteAll({ behavior: "wait" });
    await stubZones(page);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Cari kecamatan" })).toBeVisible();
    await expect(page.locator('[data-hci-region="profile-completion-banner"]')).toHaveCount(0);
});

test("back, refresh, story switching, and skip preserve the form draft", async ({ page }) => {
    await startForm(page);
    await page.getByLabel("Pekerjaan", { exact: true }).fill("Data analyst");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("1.800.000");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Berapa batas yang realistis?" })).toBeVisible();
    await expect(page.getByLabel("Batas sewa per bulan", { exact: true })).toHaveValue("1.800.000");
    await page.getByRole("button", { name: "Kembali", exact: true }).click();
    await expect(page.getByLabel("Pekerjaan", { exact: true })).toHaveValue("Data analyst");
    await page.getByRole("button", { name: /Lebih mudah bercerita/ }).click();
    await expect(page.getByRole("heading", { name: "Ceritakan rencana pindahmu" })).toBeVisible();
    await page.getByRole("button", { name: "Isi formulir", exact: true }).click();
    await expect(page.getByLabel("Pekerjaan", { exact: true })).toHaveValue("Data analyst");
    await page.getByRole("button", { name: "Lewati", exact: true }).click();
    await expect(page.getByRole("searchbox", { name: "Cari kecamatan" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Cari kecamatan" })).toBeVisible();
    await page.getByRole("button", { name: "Lengkapi profil", exact: true }).click();
    await page.getByRole("button", { name: "Isi formulir", exact: true }).click();
    await expect(page.getByLabel("Pekerjaan", { exact: true })).toHaveValue("Data analyst");
});

test("city changes update live data and invalid budgets block navigation", async ({ page }) => {
    await startForm(page);
    const city = page.getByLabel("Kota tujuan", { exact: true });
    await city.selectOption("bandung-kota");
    await expect(page.locator('[data-hci-region="onboarding-preview"]')).toContainText("Kota Bandung");
    await page.getByText("Lihat daftar kecamatan dan batasnya", { exact: true }).click();
    const districts = page.getByRole("list", { name: "Kecamatan dalam pratinjau" });
    await expect(districts).toContainText("Kecamatan Bandung");
    await expect(districts).not.toContainText("Kecamatan A");
    await city.selectOption("unsure");
    await expect(page.locator('[data-hci-region="onboarding-preview"]')).toContainText("Pilih salah satu kota yang didukung");
    await city.selectOption("jakarta-selatan");
    await page.getByText("Lihat daftar kecamatan dan batasnya", { exact: true }).click();
    await expect(page.getByRole("list", { name: "Kecamatan dalam pratinjau" })).toContainText("Kecamatan A");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("7.000.000");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(page.getByText("Batas sewa tidak boleh melebihi anggaran hidup.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Berapa batas yang realistis?" })).toBeVisible();
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("1.000.000");
    await expect(page.locator('[data-hci-region="onboarding-preview"]')).toContainText("0 kecamatan memenuhi batas");
    const districtList = page.getByRole("list", { name: "Kecamatan dalam pratinjau" });
    if (!await districtList.isVisible()) await page.getByText("Lihat daftar kecamatan dan batasnya", { exact: true }).click();
    await expect(districtList).toContainText("Sewa di atas batasmu");
});

test("mobile sheet reflows with usable fixed navigation and keyboard controls", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile");
    await startForm(page);
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 640, height: 360 }]) {
        await page.setViewportSize(viewport);
        const panel = await page.locator(".onboarding-form-panel").boundingBox();
        const next = await page.getByRole("button", { name: "Lanjut", exact: true }).boundingBox();
        expect(panel).not.toBeNull();
        expect(next).not.toBeNull();
        expect(next!.height).toBeGreaterThanOrEqual(44);
        expect(next!.y + next!.height).toBeLessThanOrEqual(viewport.height);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        await expect(page.getByRole("button", { name: "Kembali", exact: true })).toBeVisible();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("mobile-budget.png") });
    await page.getByRole("radio", { name: /Sembunyikan/ }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: /Tampilkan dengan tanda/ })).toBeChecked();
});
