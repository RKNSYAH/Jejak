import { test as base, type BrowserContext } from "@playwright/test";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function authenticateContext(context: BrowserContext, baseURL: string, expired = false) {
    let cookies: { name: string; value: string; options: CookieOptions }[] = [];
    const supabase = createServerClient("http://127.0.0.1:3101", "e2e-publishable-key", {
        cookies: {
            getAll: () => [],
            setAll: (values) => { cookies = values; },
        },
    });
    const { error } = await supabase.auth.signInWithPassword({
        email: expired ? "expired@example.test" : "map-user@example.test",
        password: "map-test-password",
    });
    if (error) throw error;
    await context.addCookies(cookies.map(({ name, value }) => ({ name, value, url: baseURL, sameSite: "Lax" })));
}

export const test = base.extend({
    page: async ({ page, baseURL }, providePage) => {
        await authenticateContext(page.context(), baseURL!);
        await providePage(page);
    },
});
