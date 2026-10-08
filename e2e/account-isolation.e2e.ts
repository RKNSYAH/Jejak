import { expect, type Page } from "@playwright/test";
import { test, authenticateContext } from "./fixtures/auth";
import { stubZones } from "./fixtures/map";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import { buildFormRelocationProfile } from "../app/engine/lib/relocationProfile";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const headers = (id: string) => ({ "X-Jejak-User-Id": id });

async function broadcastSession(page: Page, event: "TOKEN_REFRESHED" | "SIGNED_OUT" | "SIGNED_IN") {
    const cookie = (await page.context().cookies()).find((cookie) => cookie.name.startsWith("sb-") && !cookie.name.endsWith("code-verifier"))!;
    const session = JSON.parse(Buffer.from(cookie.value.slice("base64-".length), "base64url").toString());
    if (event === "SIGNED_OUT") await page.context().clearCookies();
    await page.evaluate(({ name, session, event }) => {
        const channel = new BroadcastChannel(name.split(".")[0]);
        channel.postMessage({ event, session: event === "SIGNED_OUT" ? null : session });
        channel.close();
    }, { name: cookie.name, session, event });
}

test("expiry keeps A's owned form/story drafts but B cannot restore them", async ({ context, page, baseURL }) => {
    await stubZones(page);
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill("Private relocation plan A");
    await page.getByRole("button", { name: "Isi formulir", exact: true }).click();
    await page.getByLabel("Pekerjaan", { exact: true }).fill("Private engineer A");
    const readDrafts = () => page.evaluate((id) => ({
        form: JSON.parse(sessionStorage.getItem(`jejak:relocation-form:v2:${id}`)!),
        story: JSON.parse(sessionStorage.getItem(`jejak:relocation-onboarding:v2:${id}`)!),
    }), userA);
    await expect.poll(async () => (await readDrafts()).form?.draft.answers.occupation).toBe("Private engineer A");
    expect((await readDrafts()).story.draft.story).toBe("Private relocation plan A");
    await broadcastSession(page, "TOKEN_REFRESHED");
    await expect(page.getByLabel("Pekerjaan", { exact: true })).toHaveValue("Private engineer A");
    await context.clearCookies();
    await page.goto("/map");
    await expect(page).toHaveURL(/\/login\?/);
    await authenticateContext(context, baseURL!, false, "other-user@example.test");
    await page.goto("/map?onboarding=demo");
    await expect(page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" })).toHaveValue("");
    await page.getByRole("button", { name: "Isi formulir", exact: true }).click();
    await expect(page.getByLabel("Pekerjaan", { exact: true })).not.toHaveValue("Private engineer A");
    expect((await readDrafts()).form.ownerId).toBe(userA);
    await authenticateContext(context, baseURL!);
    await page.goto("/map");
    await expect(page.getByLabel("Pekerjaan", { exact: true })).toHaveValue("Private engineer A");
});

test("legacy unowned drafts are discarded rather than claimed by a signed-in user", async ({ page }) => {
    await stubZones(page);
    await page.addInitScript(() => {
        sessionStorage.setItem("jejak:relocation-form:v1", JSON.stringify({ version: 1, status: "active", step: 1, answers: {} }));
        sessionStorage.setItem("jejak:relocation-onboarding", JSON.stringify({ step: 1, story: "Someone else's private story" }));
    });
    await page.goto("/map?onboarding=demo");
    await expect(page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" })).toHaveValue("");
    expect(await page.evaluate(() => [sessionStorage.getItem("jejak:relocation-form:v1"), sessionStorage.getItem("jejak:relocation-onboarding")])).toEqual([null, null]);
});

test("another tab's login replaces a dirty A editor and stale A operations cannot modify B", async ({ context, page, baseURL }) => {
    const saved = await page.request.post("/api/user/relocation-profile", { data: { form_answers: initialFormAnswers } });
    expect(saved.status()).toBe(201);
    await page.goto("/user");
    await page.getByRole("button", { name: "Ubah Batas sewa", exact: true }).click();
    await page.locator("#housing-budget").fill("1234567");
    const otherTab = await context.newPage();
    await otherTab.goto("/");
    // Real signed B session plus the same SDK broadcast emitted by browser sign-in.
    await authenticateContext(context, baseURL!, false, "other-user@example.test");
    await broadcastSession(otherTab, "SIGNED_IN");
    await expect(page.getByRole("heading", { name: "Belum ada profil relokasi", exact: true })).toBeVisible();
    await expect(page.locator("#housing-budget")).toHaveCount(0);
    for (const method of ["GET", "POST", "DELETE"]) {
        const response = await page.request.fetch("/api/user/relocation-profile", {
            method, headers: headers(userA), ...(method === "POST" ? { data: { form_answers: initialFormAnswers } } : {}),
        });
        expect(response.status()).toBe(409);
        expect((await response.json()).code).toBe("ACCOUNT_CHANGED");
    }
    const deleted = await page.request.delete("/api/user", { headers: headers(userA) });
    expect(deleted.status()).toBe(409);
    const refinement = await page.request.post("/api/relocation-profile-interpretation", { headers: headers(userA), data: {
        mode: "refinement", draft: buildFormRelocationProfile(initialFormAnswers), base_revision: 1, language: "id",
    } });
    expect(refinement.status()).toBe(409);
    expect((await refinement.json()).code).toBe("ACCOUNT_CHANGED");
    const current = await page.request.get("/api/user/relocation-profile", { headers: headers(userB) });
    expect(await current.json()).toEqual({ user_id: userB, profile: null });
    expect(await page.evaluate((id) => localStorage.getItem(`jejak:relocation-profile:v1:${id}`), userA)).toBeNull();
});

test("mounted map exits on sign-out and keeps its owned drafts for same-account resume", async ({ page }) => {
    await stubZones(page);
    await page.goto("/map?onboarding=demo");
    await page.getByRole("textbox", { name: "Ceritakan rencana pindahmu" }).fill("Resume my own story");
    await expect.poll(() => page.evaluate((id) => JSON.parse(sessionStorage.getItem(`jejak:relocation-onboarding:v2:${id}`)!).draft.story, userA)).toBe("Resume my own story");
    await broadcastSession(page, "SIGNED_OUT");
    await expect(page).toHaveURL(/\/login\?/);
    await expect(page.locator('[data-hci-region="map"]')).toHaveCount(0);
    expect(await page.evaluate((id) => JSON.parse(sessionStorage.getItem(`jejak:relocation-onboarding:v2:${id}`)!).ownerId, userA)).toBe(userA);
});

test("a delayed A profile read cannot fill B's map or cache after a cross-tab switch", async ({ context, page, baseURL }) => {
    await stubZones(page);
    let requested!: () => void;
    const started = new Promise<void>((resolve) => { requested = resolve; });
    let release!: () => void;
    const delayed = new Promise<void>((resolve) => { release = resolve; });
    const profileA = {
        id: "late-a", profile_name: "primary", revision: 1,
        profile: buildFormRelocationProfile(initialFormAnswers),
        confirmed_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
    };
    await page.route((url) => url.pathname === "/api/user/relocation-profile", async (route) => {
        if (route.request().headers()["x-jejak-user-id"] === userA) {
            requested();
            await delayed;
            await route.fulfill({ json: { user_id: userA, profile: profileA } }).catch(() => undefined);
        } else await route.fulfill({ json: { user_id: userB, profile: null } });
    });
    await page.goto("/map");
    await started;
    const otherTab = await context.newPage();
    await otherTab.goto("/");
    await authenticateContext(context, baseURL!, false, "other-user@example.test");
    await broadcastSession(otherTab, "SIGNED_IN");
    await expect(page.getByRole("complementary", { name: "Pengingat profil" })).toBeVisible();
    release();
    await expect.poll(() => page.evaluate((id) => JSON.parse(localStorage.getItem(`jejak:relocation-profile:v1:${id}`) ?? "null")?.profile, userB)).toBeNull();
    expect(await page.evaluate((id) => localStorage.getItem(`jejak:relocation-profile:v1:${id}`), userA)).toBeNull();
});

test("server-detected account switch reloads a dirty editor even before the auth broadcast", async ({ context, page, baseURL }) => {
    expect((await page.request.post("/api/user/relocation-profile", { data: { form_answers: initialFormAnswers } })).status()).toBe(201);
    await page.goto("/user");
    await page.getByRole("button", { name: "Ubah Batas sewa", exact: true }).click();
    await page.locator("#housing-budget").fill("1234567");
    await authenticateContext(context, baseURL!, false, "other-user@example.test");
    // Context-wide fixture headers override browser fetch headers. Let the stale
    // page send its own A identity while its cookies now belong to B.
    await context.setExtraHTTPHeaders({});
    const refused = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/relocation-profile-interpretation");
    await page.getByRole("button", { name: "Simpan dan hitung ulang", exact: true }).click();
    const response = await refused;
    expect(response.request().headers()["x-jejak-user-id"]).toBe(userA);
    expect(response.status()).toBe(409);
    expect((await response.json()).code).toBe("ACCOUNT_CHANGED");
    await expect(page.getByRole("heading", { name: "Belum ada profil relokasi", exact: true })).toBeVisible();
    expect((await (await page.request.get("/api/user/relocation-profile", { headers: headers(userB) })).json()).profile).toBeNull();
    expect(await page.evaluate((id) => localStorage.getItem(`jejak:relocation-profile:v1:${id}`), userA)).toBeNull();
});
