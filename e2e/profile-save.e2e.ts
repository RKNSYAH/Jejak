import { expect } from "@playwright/test";
import { test } from "./fixtures/auth";

test("saving confirmed onboarding replaces the incomplete cache and hides the reminder on refresh", async ({ page }) => {
    const cacheKey = "jejak:relocation-profile:v1:11111111-1111-4111-8111-111111111111";
    const profile = {
        id: "saved-profile", profile_name: "primary", revision: 1,
        confirmed_at: "2026-09-30T00:00:00Z", updated_at: "2026-09-30T00:00:00Z",
        profile: { schema_version: "relocation-profile-v1", hard_constraints: {}, soft_preferences: { goal: "work" },
            priority_weights: { career: 1 }, taxonomy_version: "2026-09", contract_version: "lf05-v2" },
    };
    let getCalls = 0;
    await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { is_sample: false, zones: [] } }));
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => {
        if (route.request().method() === "POST") return route.fulfill({ status: 201, json: { profile } });
        getCalls++;
        return route.fulfill({ json: { profile: null } });
    });
    await page.route((url) => url.pathname === "/api/lf05", (route) => route.fulfill({ json: { profile: {
        hard_constraints: {}, soft_preferences: { goal: "work" }, priority_weights: { career: 1 },
        inferred_fields: [], clarification_questions: [], requires_confirmation: true, confirmed: false,
        taxonomy_version: "2026-09", contract_version: "lf05-v2", writes_performed: false,
        decision_trace: {}, runtime_usage: null,
    } } }));
    await page.goto("/map");
    const banner = page.locator('[data-hci-region="profile-completion-banner"]');
    await banner.getByRole("button", { name: "Complete profile", exact: true }).click();
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill("Saya pindah ke Jakarta untuk bekerja.");
    await page.getByRole("button", { name: "Baca rencanaku" }).click();
    await page.getByRole("button", { name: "Tinjau rencanamu" }).click();
    await page.getByRole("button", { name: "Simpan dan selesaikan" }).click();
    await expect(page.getByRole("searchbox", { name: "Cari zona yang didukung" })).toBeVisible();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).profile, cacheKey)).toEqual(profile);
    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Cari zona yang didukung" })).toBeVisible();
    await expect(banner).toHaveCount(0);
    expect(getCalls).toBe(1);
});
