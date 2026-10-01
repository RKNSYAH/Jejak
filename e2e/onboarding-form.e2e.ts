import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures/auth";
import { stubZones } from "./fixtures/map";

async function startForm(page: Page, savedProfile: Record<string, unknown> | null = null) {
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => route.fulfill({ json: { profile: savedProfile } }));
    await stubZones(page);
    await page.goto("/map?onboarding=demo");
    await page.getByRole("button", { name: "Isi formulir", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Apa yang membawamu pindah?" })).toBeVisible();
}

test("explicit demo entry also works for an account with a confirmed profile", async ({ page }) => {
    await startForm(page, { id: "saved-profile", profile_name: "primary", revision: 1, confirmed_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z",
        profile: { schema_version: "relocation-profile-v1", hard_constraints: { goal: "work" }, soft_preferences: {}, priority_weights: { career: 1 }, taxonomy_version: "2026-09", contract_version: "lf05-v2" } });
    await expect(page.getByRole("heading", { name: "Apa yang membawamu pindah?" })).toBeVisible();
});

test("form updates sample recommendations and completes without live ranking or LF-05", async ({ page }, testInfo) => {
    const liveCalls: string[] = [];
    const errors: string[] = [];
    page.on("request", (request) => { if (/\/api\/(zones|geometry|heatmap|lf05)/.test(request.url())) liveCalls.push(request.url()); });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error" && /layers\.onboarding|Source.*onboarding/.test(message.text())) errors.push(message.text()); });
    await startForm(page);
    await page.screenshot({ path: testInfo.outputPath("step-1.png") });
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Berapa batas yang realistis?" })).toBeVisible();
    const preview = page.locator('[data-hci-region="onboarding-preview"]');
    await expect(preview).toContainText("8");
    await expect(page.locator(".maplibregl-marker").filter({ hasText: "Setiabudi" })).toHaveCount(1);
    await page.getByRole("radio", { name: /Sembunyikan/ }).check();
    await expect(page.locator(".maplibregl-marker").filter({ hasText: "Setiabudi" })).toHaveCount(0);
    await page.getByRole("radio", { name: /Tampilkan dengan tanda/ }).check();
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("1.500.000");
    await expect(preview).toContainText("2");
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("2.500.000");
    await expect(preview).toContainText("8");
    await page.screenshot({ path: testInfo.outputPath("step-2.png") });

    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Seberapa jauh perjalanan yang nyaman?" })).toBeVisible();
    await page.getByRole("button", { name: "Pilih Kuningan", exact: true }).click();
    await page.getByRole("button", { name: "Cari kawasan", exact: true }).click();
    await page.getByRole("searchbox", { name: "Cari kawasan tujuan" }).fill("Simatupang");
    await page.getByRole("list", { name: "Kawasan tujuan contoh" }).getByRole("button", { name: "TB Simatupang" }).click();
    await expect(preview).toContainText("TB Simatupang");
    await page.getByRole("radio", { name: "Motor", exact: true }).check();
    await page.screenshot({ path: testInfo.outputPath("step-3.png") });
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Apa yang paling penting untukmu?" })).toBeVisible();
    const career = page.getByRole("slider", { name: "Karier", exact: true });
    await career.fill("65");
    await expect(career).toHaveValue("65");
    expect(await page.locator('input[type="range"]').evaluateAll((inputs) => inputs.reduce((sum, input) => sum + Number((input as HTMLInputElement).value), 0))).toBe(100);
    await page.screenshot({ path: testInfo.outputPath("step-4.png") });
    await page.getByRole("button", { name: "Selesai, buka peta", exact: true }).click();
    await expect(page.locator(".onboarding-form-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ubah preferensi contoh" })).toHaveCount(1);
    await expect(preview).toContainText("Data contoh");
    expect(liveCalls).toEqual([]);
    expect(errors).toEqual([]);

    await page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" }).press("End");
    await expect(page.getByRole("heading", { name: "Rekomendasi contoh untukmu" })).toBeVisible();
    const results = page.locator('[data-hci-region="zone-list"]');
    await expect(results).toContainText("Sewa Rp");
    await page.reload();
    await expect(page.locator(".onboarding-form-panel")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ubah preferensi contoh" })).toHaveCount(1);
    await page.getByRole("separator", { name: "Ubah tinggi daftar kecamatan" }).press("End");
    await page.getByRole("button", { name: "Ubah preferensi contoh" }).click();
    await expect(page.getByRole("slider", { name: "Karier", exact: true })).toHaveValue("65");
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

test("invalid budgets block navigation and unsupported cities show an honest preview", async ({ page }) => {
    await startForm(page);
    await page.getByRole("radio", { name: "Bandung", exact: true }).check();
    await expect(page.locator('[data-hci-region="onboarding-preview"]')).toContainText("belum tersedia untuk kota ini");
    await expect(page.locator(".maplibregl-marker")).toHaveCount(0);
    await page.getByRole("radio", { name: "Jakarta Selatan", exact: true }).check();
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("7.000.000");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(page.getByText("Batas sewa tidak boleh melebihi anggaran hidup.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Berapa batas yang realistis?" })).toBeVisible();
    await page.getByLabel("Batas sewa per bulan", { exact: true }).fill("1.000.000");
    await expect(page.locator('[data-hci-region="onboarding-preview"]')).toContainText("Belum ada kecamatan yang cocok");
    await page.getByText("Lihat daftar kecamatan dan batasnya", { exact: true }).click();
    await expect(page.getByRole("list", { name: "Kecamatan dalam pratinjau" })).toContainText("melebihi batas");
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
