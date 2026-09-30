import { createBrowserClient } from "@supabase/ssr";
import { browserAuthCookie, SESSION_ONLY_COOKIE } from "./authSession";

export function setRememberPreference(remember: boolean) {
    document.cookie = remember
        ? `${SESSION_ONLY_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`
        : `${SESSION_ONLY_COOKIE}=1; Path=/; SameSite=Lax`;
}

function getBrowserCookies() {
    return document.cookie.split(/;\s*/).filter((cookie) => cookie.includes("=")).map((cookie) => {
        const separator = cookie.indexOf("=");
        const name = cookie.slice(0, separator);
        const value = cookie.slice(separator + 1);
        try {
            return { name: decodeURIComponent(name), value: decodeURIComponent(value) };
        } catch {
            return { name, value };
        }
    });
}

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: getBrowserCookies,
                setAll(cookies) {
                    const sessionOnly = getBrowserCookies().some(({ name, value }) => name === SESSION_ONLY_COOKIE && value === "1");
                    for (const { name, value, options } of cookies) {
                        document.cookie = browserAuthCookie(name, value, options, sessionOnly);
                    }
                },
            },
        },
    );
}
