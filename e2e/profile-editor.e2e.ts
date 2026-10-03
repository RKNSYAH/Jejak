import { expect } from "@playwright/test";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import type { StoredRelocationProfile } from "../app/engine/lib/relocationProfile";
import { test } from "./fixtures/auth";
import { stubZones } from "./fixtures/map";

const userId = "11111111-1111-4111-8111-111111111111";
const cacheKey = `jejak:relocation-profile:v1:${userId}`;
const updatedRent = 2_000_000;

async function seedProfile(page: import("@playwright/test").Page) {
    const response = await page.request.post("/api/user/relocation-profile", {
        data: { form_answers: {
            ...initialFormAnswers,
            goal: "work",
            city: "jakarta-selatan",
            monthlyBudget: 6_000_000,
            maximumRent: 4_000_000,
            transport: "transit",
            weights: { opportunity: 50, affordability: 30, mobility: 20, environment: 0 },
        } },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).profile as StoredRelocationProfile;
}

async function openEditor(page: import("@playwright/test").Page) {
    await stubZones(page);
    const saved = await seedProfile(page);
    await page.goto("/user");
    await expect(page.getByRole("heading", { name: "Jejakmu bisa berubah", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true })).toBeDisabled();
    return saved;
}

function field(page: import("@playwright/test").Page, id: string) {
    return page.locator(`[data-profile-field="${id}"]`);
}

async function editField(page: import("@playwright/test").Page, id: string, value: string) {
    const row = field(page, id);
    const edit = row.getByRole("button", { name: /^Ubah/ });
    if (await edit.count()) await edit.click();
    await page.locator(`#${id}`).fill(value);
}

async function currentValue(page: import("@playwright/test").Page, id: string) {
    const row = field(page, id);
    const edit = row.getByRole("button", { name: /^Ubah/ });
    if (await edit.count()) await edit.click();
    return page.locator(`#${id}`);
}

async function latestProfile(page: import("@playwright/test").Page) {
    return (await (await page.request.get("/api/user/relocation-profile")).json()).profile as StoredRelocationProfile;
}

test("profile editor keeps exact action and headings, uses two columns on desktop and one on mobile without overflow", async ({ page }, testInfo) => {
    await openEditor(page);
    await expect(page.getByRole("button", { name: "Profil relokasi", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { name: "Tujuan", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Batas keras", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Perjalanan", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Prioritas", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true })).toBeVisible();

    const purpose = await page.getByRole("heading", { name: "Tujuan", exact: true }).boundingBox();
    const limits = await page.getByRole("heading", { name: "Batas keras", exact: true }).boundingBox();
    expect(purpose).not.toBeNull();
    expect(limits).not.toBeNull();
    if (page.viewportSize()!.width >= 768) {
        expect(Math.abs(purpose!.y - limits!.y)).toBeLessThan(8);
        expect(Math.abs(purpose!.x - limits!.x)).toBeGreaterThan(150);
    } else {
        expect(limits!.y).toBeGreaterThan(purpose!.y + 20);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("profile-editor.png"), fullPage: true });
});

test("user header groups the back link beside the logo and uses the map account cluster", async ({ page }) => {
    await openEditor(page);
    const brandCluster = page.locator('[data-hci-region="user-brand-cluster"]');
    const logo = brandCluster.getByRole("link", { name: "JEJAK", exact: true });
    const back = brandCluster.getByRole("link", { name: "Kembali ke peta", exact: true });
    await expect(logo).toHaveAttribute("href", "/");
    await expect(back).toHaveAttribute("href", "/map");
    const logoBox = (await logo.boundingBox())!;
    const backBox = (await back.boundingBox())!;
    expect(backBox.x).toBeGreaterThanOrEqual(logoBox.x + logoBox.width);
    expect(Math.abs((logoBox.y + logoBox.height / 2) - (backBox.y + backBox.height / 2))).toBeLessThan(2);
    const account = page.locator('[data-hci-region="account-cluster"]');
    await expect(account.getByRole("button", { name: "Area tersimpan", exact: true })).toHaveAttribute("aria-disabled", "true");
    const profileControl = account.getByRole("button", { name: /Profil .*paket Gratis/ });
    await expect(profileControl).toHaveAttribute("aria-pressed", "true");
    await expect(profileControl).toHaveClass(/bg-primary/);
    await profileControl.click();
    await expect(page.getByRole("heading", { name: "Akun, paket, dan datamu", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Akun", exact: true })).toHaveAttribute("aria-current", "page");
});

test("account settings show real data, section navigation, and unavailable actions", async ({ page }, testInfo) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Akun", exact: true }).click();
    const settings = page.locator('[data-hci-region="user-settings"]');
    await expect(settings.getByText("map-user@example.test", { exact: true })).toBeVisible();
    await expect(settings.getByRole("heading", { name: "Gratis", exact: true })).toBeVisible();
    await expect(settings.getByRole("link", { name: "Lihat semua paket", exact: true })).toHaveAttribute("href", "/pricing");
    await expect(page.getByRole("button", { name: /Skenario/ })).toBeDisabled();
    await expect(settings.getByRole("button", { name: "Unduh dataku", exact: true })).toBeDisabled();
    const firstSection = await page.locator("#settings-account").boundingBox();
    const firstNavItem = await page.getByRole("button", { name: "Profil relokasi", exact: true }).boundingBox();
    if (page.viewportSize()!.width >= 768) expect(Math.abs(firstNavItem!.y - firstSection!.y)).toBeLessThan(12);
    else expect(firstNavItem!.y).toBeLessThan(firstSection!.y);
    await settings.getByText("Hapus akun", { exact: true }).click();
    await expect(settings.getByText("Penghapusan akun mandiri belum tersedia. Data akunmu tidak akan dihapus dari sini.", { exact: true })).toBeVisible();
    await expect(settings.getByRole("link", { name: /Privasi/ })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath("account-settings.png"), fullPage: true });
    await page.getByRole("button", { name: "Paket dan tagihan", exact: true }).click();
    await expect(page.locator("#settings-plan")).toBeFocused();
    await expect(page.getByRole("button", { name: "Paket dan tagihan", exact: true })).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Privasi dan data", exact: true }).click();
    await expect(page.locator("#settings-privacy")).toBeFocused();
    await expect(settings.getByText("Tersimpan", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Profil relokasi", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Jejakmu bisa berubah", exact: true })).toBeVisible();
});

test("user settings fit narrow phones and tablet widths without page overflow", async ({ page }) => {
    await openEditor(page);
    await page.getByRole("button", { name: "Akun", exact: true }).click();
    for (const width of [320, 360, 390, 768]) {
        await page.setViewportSize({ width, height: 850 });
        await expect(page.getByRole("heading", { name: "Akun, paket, dan datamu", exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `page overflow at ${width}px`).toBe(true);
        const back = (await page.getByRole("link", { name: "Kembali ke peta", exact: true }).boundingBox())!;
        expect(back.x).toBeGreaterThanOrEqual(0);
        expect(back.x + back.width).toBeLessThanOrEqual(width);
    }
});

test("editing rent then cancel restores saved value", async ({ page }) => {
    const initial = await openEditor(page);
    await editField(page, "housing-budget", String(updatedRent));
    await expect(page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
    await expect(await currentValue(page, "housing-budget")).toHaveValue("4000000");
    expect((await latestProfile(page)).revision).toBe(initial.revision);
});

test("invalid budget never reaches LF-05 and priority sliders support keyboard edits", async ({ page }) => {
    const initial = await openEditor(page);
    let calls = 0;
    page.on("request", (request) => { if (new URL(request.url()).pathname === "/api/lf05") calls += 1; });
    await field(page, "housing-budget").getByRole("button", { name: /Ubah/ }).click();
    await page.locator("#housing-budget").fill("-1");
    await expect(page.locator("#housing-budget")).toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true }).click();
    expect(calls).toBe(0);
    expect((await latestProfile(page)).revision).toBe(initial.revision);
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
    const slider = page.getByRole("slider", { name: "Karier", exact: true });
    await slider.focus();
    await slider.press("ArrowRight");
    await expect(slider).toHaveValue("51");
    const percentages = await page.locator('output[for^="priority-"]').allTextContents();
    expect(percentages.reduce((total, value) => total + Number.parseInt(value), 0)).toBe(100);
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
    await expect(slider).toHaveValue("50");
});

test("declining unsaved navigation keeps draft and account access remains available", async ({ page }) => {
    const initial = await openEditor(page);
    await editField(page, "housing-budget", String(updatedRent));
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Kembali ke peta", exact: true }).click();
    await expect(page).toHaveURL(/\/user$/);
    await expect(page.locator("#housing-budget")).toHaveValue(String(updatedRent));
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.locator('[data-hci-region="brand-logo"]').click();
    await expect(page).toHaveURL(/\/user$/);
    await page.getByRole("button", { name: "Akun", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Akun, paket, dan datamu", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Keluar dari akun", exact: true })).toBeVisible();
    await expect(page.locator('[data-hci-region="settings-profile-draft"]')).toContainText("Perubahan profilmu belum disimpan.");
    page.once("dialog", (dialog) => dialog.dismiss());
    await page.getByRole("link", { name: "Lihat semua paket", exact: true }).click();
    await expect(page).toHaveURL(/\/user$/);
    await page.getByRole("button", { name: "Kembali ke profil", exact: true }).click();
    await expect(page.locator("#housing-budget")).toHaveValue(String(updatedRent));
    expect((await latestProfile(page)).revision).toBe(initial.revision);
    await page.getByRole("button", { name: "Batalkan", exact: true }).click();
});

test("clarifications block persistence until answers and inferred changes are confirmed", async ({ page }) => {
    const initial = await openEditor(page);
    const question = "Berapa batas sewa barumu per bulan?";
    let calls = 0;
    await page.route((url) => url.pathname === "/api/lf05", async (route) => {
        const body = route.request().postDataJSON();
        calls += 1;
        if (calls === 2) expect(body.clarification_answers).toEqual([{ question, answer: "Rp2 juta" }]);
        await route.fulfill({ json: { profile: {
            hard_constraints: calls === 1 ? initial.profile.hard_constraints : {
                ...initial.profile.hard_constraints, housing_budget: { amount: updatedRent, currency: "IDR", period: "month" },
            },
            soft_preferences: initial.profile.soft_preferences, priority_weights: initial.profile.priority_weights,
            inferred_fields: calls === 1 ? [] : ["housing_budget"], clarification_questions: calls === 1 ? [question] : [],
            requires_confirmation: true, confirmed: false, writes_performed: false,
            taxonomy_version: "2026-09", contract_version: "lf05-v2", decision_trace: {}, runtime_usage: null,
        } } });
    });
    await page.getByRole("button", { name: "Tulis ulang", exact: true }).click();
    await page.locator("#profile-story").fill("Turunkan batas sewanya.");
    await page.getByRole("button", { name: "Selesai", exact: true }).click();
    await page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Tinjau perubahan dari Jejak", exact: true });
    await expect(review).toBeVisible();
    await expect(review.getByRole("button", { name: "Tinjau jawaban", exact: true })).toBeDisabled();
    expect((await latestProfile(page)).revision).toBe(initial.revision);
    await review.getByLabel(question, { exact: true }).fill("Rp2 juta");
    await review.getByRole("button", { name: "Tinjau jawaban", exact: true }).click();
    await expect(review.getByText(question, { exact: true })).toHaveCount(0);
    await review.getByRole("checkbox").check();
    await review.getByRole("button", { name: "Konfirmasi dan simpan", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /Profil tersimpan.*hitungan kecamatan diperbarui/ })).toBeVisible();
    const saved = await latestProfile(page);
    expect(saved.revision).toBe(initial.revision + 1);
    expect(saved.profile.hard_constraints.housing_budget).toEqual({ amount: updatedRent, currency: "IDR", period: "month" });
});

test("rent edit passes through real LF-05 refinement and RPC, reconciles explicit value, and caches new revision", async ({ page }) => {
    const initial = await openEditor(page);
    await editField(page, "housing-budget", String(updatedRent));
    await page.getByRole("slider", { name: "Karier", exact: true }).press("ArrowRight");
    const refinement = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/lf05");
    const saving = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/user/relocation-profile" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true }).click();
    const lf05 = await refinement;
    const save = await saving;
    expect(lf05.status()).toBe(200);
    expect(lf05.request().postDataJSON()).toMatchObject({ mode: "refinement", base_revision: initial.revision });
    expect(save.status()).toBe(201);
    const stored = (await save.json()).profile;
    expect(stored.revision).toBe(initial.revision + 1);
    expect((stored.profile.hard_constraints.housing_budget as { amount: number }).amount).toBe(updatedRent);
    expect(stored.profile.priority_weights.career).toBe(0.51);
    expect(stored.profile.soft_preferences.occupation).toBe(initial.profile.soft_preferences.occupation);
    expect(stored.profile.soft_preferences.departure_time).toBe(initial.profile.soft_preferences.departure_time);
    expect((await latestProfile(page))).toEqual(stored);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).profile, cacheKey)).toEqual(stored);
});

test("narrative inference asks for review; dismissing review does not leave save disabled", async ({ page }) => {
    await openEditor(page);
    await page.route((url) => url.pathname === "/api/lf05", (route) => route.fulfill({ json: { profile: {
        hard_constraints: { goal: "work", destination_cities: ["jakarta-selatan"], monthly_budget: { amount: 6_000_000, currency: "IDR", period: "month" },
            housing_budget: { amount: 4_000_000, currency: "IDR", period: "month" }, commute_minutes: 45, deal_breakers: [] },
        soft_preferences: { transport_mode: "transit", destination: null, housing_types: ["kos"], over_budget: "mark" },
        priority_weights: { career: 0.5, housing: 0.15, cost_of_living: 0.15, commute: 0.2, education: 0, environment: 0 },
        inferred_fields: ["commute_minutes"], clarification_questions: [], requires_confirmation: true, confirmed: false, writes_performed: false,
        taxonomy_version: "2026-09", contract_version: "lf05-v2", decision_trace: {}, runtime_usage: null,
    } } }));
    await page.getByRole("button", { name: "Tulis ulang", exact: true }).click();
    await page.getByRole("textbox", { name: "Catatan rencana" }).fill("Saya ingin waktu perjalanan maksimal 45 menit.");
    await page.getByRole("button", { name: "Selesai", exact: true }).click();
    await page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Tinjau perubahan dari Jejak", exact: true });
    await expect(review.getByRole("heading", { name: "Tinjau perubahan dari Jejak", exact: true })).toBeVisible();
    await expect(review).toContainText("Disimpulkan dari catatanmu");
    await expect(review.getByRole("button", { name: "Konfirmasi dan simpan", exact: true })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(review).toBeHidden();
    await expect(page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true }).click();
    await expect(review).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(review).toBeHidden();
    await expect(page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true })).toBeEnabled();
});

test("failed save retries against real storage without losing edited rent", async ({ page }) => {
    const initial = await openEditor(page);
    let attempts = 0;
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        attempts += 1;
        return attempts === 1 ? route.fulfill({ status: 503, json: { error: "Profil belum tersimpan. Coba lagi." } }) : route.fallback();
    });
    await editField(page, "housing-budget", String(updatedRent));
    const saveButton = page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true });
    await saveButton.click();
    await expect(page.getByRole("alert").filter({ hasText: "Profil belum tersimpan" })).toBeVisible();
    await expect(await currentValue(page, "housing-budget")).toHaveValue(String(updatedRent));
    await saveButton.click();
    await expect(page.getByRole("status").filter({ hasText: /Profil tersimpan.*hitungan kecamatan diperbarui/ })).toBeVisible();
    expect(attempts).toBe(2);
    const saved = await latestProfile(page);
    expect(saved.revision).toBe(initial.revision + 1);
    expect((saved.profile.hard_constraints.housing_budget as { amount: number }).amount).toBe(updatedRent);
});

test("stale revision keeps draft", async ({ page }) => {
    const initial = await openEditor(page);
    await editField(page, "housing-budget", String(updatedRent));
    const competing = await page.request.post("/api/user/relocation-profile", { data: { form_answers: {
        ...initialFormAnswers, goal: "work", city: "jakarta-selatan", monthlyBudget: 6_000_000, maximumRent: 3_800_000,
        transport: "transit", weights: { opportunity: 50, affordability: 30, mobility: 20, environment: 0 },
    } } });
    expect(competing.status()).toBe(201);
    await page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Profil berubah sejak terakhir dimuat" })).toBeVisible();
    await expect(await currentValue(page, "housing-budget")).toHaveValue(String(updatedRent));
    expect((await latestProfile(page)).revision).toBe(initial.revision + 1);
});

test("recalc retry avoids duplicate revision and map adopts latest server profile while preserving session drafts", async ({ page }) => {
    const initial = await openEditor(page);
    await expect(page.getByRole("heading", { name: "Perubahan kecamatan", exact: true })).toBeVisible();
    await expect(page.getByText(/Tersimpan \(.+\): 2 kecamatan sesuai batas anggaran\./)).toBeVisible();
    let previewOutage = false;
    await page.route((url) => url.pathname === "/api/onboarding/preview", (route) => {
        if (previewOutage) {
            previewOutage = false;
            return route.abort();
        }
        return route.fallback();
    });
    await page.route((url) => url.pathname === "/api/user/relocation-profile", async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        const response = await route.fetch();
        if (response.status() === 201) previewOutage = true;
        await route.fulfill({ response });
    });
    await editField(page, "housing-budget", String(updatedRent));
    await expect(page.getByText(/Draf \(.+\): 1 kecamatan sesuai batas anggaran\./)).toBeVisible();
    await field(page, "over-budget").getByRole("button", { name: /Ubah/ }).click();
    await page.locator("#over-budget").selectOption("hide");
    await page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /Profil tersimpan, tetapi hitungan kecamatan belum berhasil/ })).toBeVisible();
    const stored = await latestProfile(page);
    expect(stored.revision).toBe(initial.revision + 1);
    expect(stored.profile.soft_preferences.over_budget).toBe("hide");
    await page.getByRole("button", { name: "Coba hitung ulang", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Hitungan kecamatan diperbarui." })).toBeVisible();
    expect((await latestProfile(page)).revision).toBe(stored.revision);
    await page.evaluate(({ key, userId: id, answers }) => {
        localStorage.setItem(key, JSON.stringify({ version: 1, userId: id, profile: { revision: 1, profile: { hard_constraints: { housing_budget: { amount: 1 } } } } }));
        sessionStorage.setItem("jejak:relocation-onboarding", JSON.stringify({ story: "draft cerita lama" }));
        sessionStorage.setItem("jejak:relocation-form:v1", JSON.stringify({ version: 1, status: "paused", step: 2, answers: { ...answers, monthlyBudget: 1 } }));
    }, { key: cacheKey, userId, answers: initialFormAnswers });
    await page.getByRole("link", { name: "Lihat di peta", exact: true }).click();
    await expect(page).toHaveURL(/\/map\?profile=updated/);
    await expect(page.getByRole("searchbox", { name: "Cari kecamatan" })).toBeVisible();
    await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).profile.revision, cacheKey)).toBe(stored.revision);
    expect(await page.evaluate(() => sessionStorage.getItem("jejak:relocation-onboarding"))).toContain("draft cerita lama");
    expect(await page.evaluate(() => sessionStorage.getItem("jejak:relocation-form:v1"))).toContain("monthlyBudget");
    const preview = page.locator('[data-hci-region="onboarding-preview"]');
    await expect(preview).toBeVisible();
    // Budget fits, but no route may silently satisfy this profile's commute limit.
    await expect(preview).toContainText("0 kecamatan sesuai data dan estimasi");
    await expect(preview).toContainText("Pilih tujuan untuk melihat jangkauan");
    await expect(page.getByText("Kecamatan B", { exact: true })).toHaveCount(0);
});
