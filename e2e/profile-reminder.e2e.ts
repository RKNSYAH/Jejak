import { expect } from "@playwright/test";
import { test } from "./fixtures/auth";
import { stubZones } from "./fixtures/map";

const userId = "11111111-1111-4111-8111-111111111111";
const cacheKey = `jejak:relocation-profile:v1:${userId}`;
const savedProfile = {
    id: "saved-profile", profile_name: "primary", revision: 1,
    confirmed_at: "2026-09-30T00:00:00Z", updated_at: "2026-09-30T00:00:00Z",
    profile: { schema_version: "relocation-profile-v1", hard_constraints: { goal: "work" }, soft_preferences: {},
        priority_weights: { career: 1 }, taxonomy_version: "2026-09", contract_version: "lf05-v2" },
};

test("incomplete profile banner dismisses until refresh and reuses the cached result", async ({ page }, testInfo) => {
    await stubZones(page);
    let calls = 0;
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => {
        calls++;
        return route.fulfill({ json: { user_id: userId, profile: null } });
    });
    await page.goto("/map");
    const banner = page.getByRole("complementary", { name: "Pengingat profil" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Area belum diurutkan untukmu");
    await expect(banner).toContainText("Ceritakan rencanamu agar Jejak menandai area yang sesuai batas dan prioritasmu.");
    const completeProfile = banner.getByRole("button", { name: "Lengkapi profil", exact: true });
    if (testInfo.project.name === "desktop") await expect(completeProfile).toHaveCSS("background-color", "rgb(0, 106, 216)");
    else await expect(completeProfile).toHaveCSS("color", "rgb(0, 106, 216)");
    for (const button of [completeProfile, banner.getByRole("button", { name: "Tutup pengingat profil" })]) {
        const target = (await button.boundingBox())!;
        expect(target.width).toBeGreaterThanOrEqual(44);
        expect(target.height).toBeGreaterThanOrEqual(44);
    }
    const colors = await banner.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, text: style.color };
    });
    expect(colors).toEqual({ background: "rgb(255, 249, 249)", text: "rgb(33, 41, 124)" });
    const box = (await banner.boundingBox())!;
    if (testInfo.project.name === "desktop") {
        // Wide maps fit the banner beside the search bar, level with it and clear of the account cluster.
        const header = (await page.locator('[data-hci-region="map-header"]').boundingBox())!;
        const cluster = (await page.locator('[data-hci-region="account-cluster"]').boundingBox())!;
        expect(Math.abs(box.y - header.y)).toBeLessThan(1);        expect(box.x).toBeGreaterThanOrEqual(header.x + header.width + 8);
        expect(box.x + box.width).toBeLessThanOrEqual(cluster.x);
    } else {
        const controls = (await page.locator('[data-hci-region="controls"]').boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(controls.y + controls.height);
        expect(Math.abs(box.x - controls.x)).toBeLessThan(1);
        await page.screenshot({ path: testInfo.outputPath("mobile-map.png") });
        expect(box.height).toBeLessThanOrEqual(48);
    }
    await banner.getByRole("button", { name: "Tutup pengingat profil" }).click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(banner).toBeVisible();
    expect(calls).toBe(1);
    await banner.getByRole("button", { name: "Lengkapi profil", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ceritakan rencana pindahmu" })).toBeVisible();
    await expect(banner).toHaveCount(0);
    await page.getByRole("button", { name: /Lewati untuk sekarang/ }).click();
    await expect(banner).toBeVisible();
});

test("confirmed profile stays hidden after refresh without another profile fetch", async ({ page }) => {
    await stubZones(page);
    let calls = 0;
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => {
        calls++;
        return route.fulfill({ json: { user_id: userId, profile: savedProfile } });
    });
    await page.goto("/map?welcome=1");
    await expect(page.getByRole("searchbox", { name: "Cari kecamatan" })).toBeVisible();
    await expect(page.locator('[data-hci-region="profile-completion-banner"]')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Cari kecamatan" })).toBeVisible();
    await expect(page.locator('[data-hci-region="profile-completion-banner"]')).toHaveCount(0);
    expect(calls).toBe(1);
});

test("another user's cache never suppresses this user's reminder", async ({ page }) => {
    await stubZones(page);
    await page.addInitScript(({ profile }) => {
        localStorage.setItem("jejak:relocation-profile:v1:another-user", JSON.stringify({ version: 1, userId: "another-user", profile }));
    }, { profile: savedProfile });
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => route.fulfill({ json: { user_id: userId, profile: null } }));
    await page.goto("/map");
    await expect(page.locator('[data-hci-region="profile-completion-banner"]')).toBeVisible();
});

test("failed profile fetch is not cached or mistaken for incomplete onboarding", async ({ page }) => {
    await stubZones(page);
    let calls = 0;
    await page.route((url) => url.pathname === "/api/user/relocation-profile", (route) => {
        calls++;
        return route.fulfill({ status: 503, json: { error: "Unavailable" } });
    });
    await page.goto("/map");
    await expect(page.getByRole("searchbox", { name: "Cari kecamatan" })).toBeVisible();
    await expect.poll(() => calls).toBe(1);
    await expect(page.locator('[data-hci-region="profile-completion-banner"]')).toHaveCount(0);
    expect(await page.evaluate((key) => localStorage.getItem(key), cacheKey)).toBeNull();
    await page.reload();
    await expect.poll(() => calls).toBe(2);
});

test("logout clears the cache even when entering the account page directly", async ({ page }) => {
    await page.addInitScript(({ key, id, profile }) => {
        if (location.pathname !== "/user") return;
        localStorage.setItem(key, JSON.stringify({ version: 1, userId: id, profile }));
        sessionStorage.setItem(`jejak:relocation-form:v2:${id}`, JSON.stringify({ ownerId: id, draft: {} }));
        sessionStorage.setItem(`jejak:relocation-onboarding:v2:${id}`, JSON.stringify({ ownerId: id, draft: {} }));
        sessionStorage.setItem("jejak:relocation-onboarding:v2:another-user", "keep another user's draft");
    }, { key: cacheKey, id: userId, profile: savedProfile });
    await page.goto("/user");
    await page.getByRole("button", { name: "Akun", exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Keluar dari akun" }).click();
    await expect(page).toHaveURL(/\/login\?status=signed-out/);
    expect(await page.evaluate((key) => localStorage.getItem(key), cacheKey)).toBeNull();
    expect(await page.evaluate((id) => [sessionStorage.getItem(`jejak:relocation-form:v2:${id}`), sessionStorage.getItem(`jejak:relocation-onboarding:v2:${id}`)], userId)).toEqual([null, null]);
    expect(await page.evaluate(() => sessionStorage.getItem("jejak:relocation-onboarding:v2:another-user"))).toBe("keep another user's draft");
});
