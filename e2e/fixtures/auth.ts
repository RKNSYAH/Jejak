import { test as base, type BrowserContext } from "@playwright/test";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function authenticateContext(context: BrowserContext, baseURL: string, expired = false, email = "map-user@example.test") {
    let cookies: { name: string; value: string; options: CookieOptions }[] = [];
    const supabase = createServerClient("http://127.0.0.1:3101", "e2e-publishable-key", {
        cookies: {
            getAll: () => [],
            setAll: (values) => { cookies = values; },
        },
    });
    const { data, error } = await supabase.auth.signInWithPassword({
        email: expired ? "expired@example.test" : email,
        password: "map-test-password",
    });
    if (error) throw error;
    await context.setExtraHTTPHeaders({ "X-Jejak-User-Id": data.user!.id });
    await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: baseURL, sameSite: "Lax" })));
    return data.user!.id;
}

export const test = base.extend({
    page: async ({ page, baseURL }, providePage) => {
        await page.request.delete("http://127.0.0.1:3101/rest/v1/onboarding_drafts", {
            headers: { apikey: "e2e-local-service-role", authorization: "Bearer e2e-local-service-role" },
        });
        const userId = await authenticateContext(page.context(), baseURL!);
        for (const kind of ["form", "story"]) {
            await page.request.delete(`${baseURL}/api/user/onboarding-drafts?kind=${kind}`, {
                headers: { "X-Jejak-User-Id": userId },
            });
        }
        await page.request.delete(`${baseURL}/api/user/relocation-profile`, {
            headers: { "X-Jejak-User-Id": userId },
        });
        await providePage(page);
    },
});
