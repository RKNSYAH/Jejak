import type { CookieOptions } from "@supabase/ssr";

export const SESSION_ONLY_COOKIE = "jejak-session-only";

export function authCookieOptions(options: CookieOptions, sessionOnly: boolean): CookieOptions {
    if (!sessionOnly || options.maxAge === 0) return options;
    const result = { ...options };
    delete result.maxAge;
    delete result.expires;
    return result;
}

export function browserAuthCookie(name: string, value: string, options: CookieOptions, sessionOnly: boolean): string {
    const settings = authCookieOptions(options, sessionOnly);
    const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`, `Path=${settings.path ?? "/"}`];
    if (settings.maxAge !== undefined) parts.push(`Max-Age=${settings.maxAge}`);
    if (settings.expires) parts.push(`Expires=${settings.expires.toUTCString()}`);
    if (settings.domain) parts.push(`Domain=${settings.domain}`);
    if (settings.sameSite) parts.push(`SameSite=${settings.sameSite === true ? "Strict" : settings.sameSite}`);
    if (settings.secure) parts.push("Secure");
    return parts.join("; ");
}
