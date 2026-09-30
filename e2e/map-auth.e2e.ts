import { expect, test } from "@playwright/test";
import { authenticateContext } from "./fixtures/auth";

test("signed-out map navigation goes to login before mounting the map", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => {
        if (/\/api\/(zones|geometry|heatmap|evidence)/.test(request.url())) requests.push(request.url());
    });
    await page.goto("/map?zone=coblong&study=P01");
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/map?zone=coblong&study=P01");
    await expect(page.getByRole("textbox", { name: "Email" })).toBeVisible();
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    expect(requests).toEqual([]);
});

test("anonymous map API requests return forbidden JSON", async ({ request }) => {
    for (const path of [
        "/api/zones", "/api/geometry?zone_id=unknown-region",
        "/api/heatmap?zone_id=unknown-region&category=housing",
        "/api/zones/unknown-region/intelligence", "/api/zones/unknown-region/evidence?scope=career",
        "/api/evidence/clusters?city_id=jakarta-selatan&scope=career",
        "/api/enrichment-runs/11111111-1111-4111-8111-111111111111",
    ]) {
        const response = await request.get(path);
        expect(response.status(), path).toBe(403);
        expect(response.headers()["content-type"]).toContain("application/json");
        expect(response.headers()["cache-control"]).toBe("no-store");
        expect(response.headers().location).toBeUndefined();
        expect((await response.json()).code).toBe("SIGN_IN_REQUIRED");
    }
    const response = await request.post("/api/zones/unknown-region/enrich", { data: { scope: "career" } });
    expect(response.status()).toBe(403);
});

test("a tampered signed-in cookie cannot open the map or its API", async ({ context, page, baseURL }) => {
    await authenticateContext(context, baseURL!);
    const cookie = (await context.cookies()).find((cookie) => cookie.name.startsWith("sb-"))!;
    const session = JSON.parse(Buffer.from(cookie.value.slice("base64-".length), "base64url").toString());
    const [header, payload, signature] = session.access_token.split(".");
    session.access_token = `${header}.${payload}.${signature[0] === "x" ? "y" : "x"}${signature.slice(1)}`;
    await context.addCookies([{ ...cookie, value: `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}` }]);
    expect((await context.request.get("/api/zones")).status()).toBe(403);
    await page.goto("/map");
    await expect(page).toHaveURL(/\/login\?/);
});

test("authenticated callers receive data responses and genuine missing-region 404s", async ({ context, baseURL }) => {
    await authenticateContext(context, baseURL!);
    expect((await context.request.get("/api/zones")).status()).toBe(200);
    expect((await context.request.get("/api/geometry?zone_id=unknown-region")).status()).toBe(404);
    expect((await context.request.get("/api/zones/unknown-region/intelligence")).status()).toBe(404);
});

test("login returns the user to their original map URL", async ({ page }) => {
    await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { is_sample: false, zones: [] } }));
    const next = "/map?zone=coblong&study=P01";
    await page.goto(`/login?${new URLSearchParams({ next })}`);
    await page.getByRole("textbox", { name: "Email" }).fill("map-user@example.test");
    await page.getByLabel("Kata sandi", { exact: true }).fill("map-test-password");
    await page.locator("form").getByRole("button", { name: "Masuk", exact: true }).click();
    await expect(page).toHaveURL(`http://localhost:3100${next}`);
    await expect(page.getByRole("searchbox")).toBeVisible();
});

test("an expired refreshable session stays on the map and receives refreshed cookies", async ({ context, page, baseURL }) => {
    await authenticateContext(context, baseURL!, true);
    const before = (await context.cookies()).find((cookie) => cookie.name.startsWith("sb-"))!.value;
    await page.route((url) => url.pathname === "/api/zones", (route) => route.fulfill({ json: { is_sample: false, zones: [] } }));
    const response = await page.goto("/map?study=refresh");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("searchbox")).toBeVisible();
    await expect(page).toHaveURL(/\/map\?study=refresh$/);
    const after = (await context.cookies()).find((cookie) => cookie.name.startsWith("sb-"))!.value;
    expect(after).not.toBe(before);
});

test("a map API auth failure navigates to login with query and fragment context", async ({ context, page, baseURL }) => {
    await authenticateContext(context, baseURL!);
    await page.route((url) => url.pathname === "/api/zones", async (route) => {
        await context.clearCookies();
        await route.fulfill({ status: 403, json: { error: "Sign in to access the map", code: "SIGN_IN_REQUIRED" } });
    });
    await page.goto("/map?zone=coblong#details", { waitUntil: "commit" });
    await expect(page).toHaveURL(/\/login\?/);
    expect(new URL(page.url()).searchParams.get("next")).toBe("/map?zone=coblong#details");
});
