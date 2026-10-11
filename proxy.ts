import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, SESSION_ONLY_COOKIE } from "./app/engine/lib/authSession";
import { loginPath } from "./app/engine/lib/authDestination";

export function buildContentSecurityPolicy(nonce: string, env: Record<string, string | undefined> = process.env): string {
    let supabaseOrigin: string | null = null;
    try {
        const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
        if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) supabaseOrigin = url.origin;
    } catch { /* A missing Supabase URL should not produce an invalid CSP. */ }

    const realtimeOrigin = supabaseOrigin?.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
    const isDevelopment = env.NODE_ENV === "development";
    return [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://va.vercel-scripts.com${isDevelopment ? " 'unsafe-eval'" : ""}`,
        "script-src-attr 'none'",
        // MapLibre positions map controls and markers with runtime inline styles.
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data: https://tiles.openfreemap.org https://klokantech.github.io",
        `connect-src 'self' https://tiles.openfreemap.org https://klokantech.github.io${supabaseOrigin ? ` ${supabaseOrigin}` : ""}${realtimeOrigin ? ` ${realtimeOrigin}` : ""}`,
        "font-src 'self' data:",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "frame-src 'none'",
        ...(!isDevelopment ? ["upgrade-insecure-requests"] : []),
    ].join("; ");
}

export async function proxy(req: NextRequest) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = buildContentSecurityPolicy(nonce);
    const nextResponse = () => {
        const headers = new Headers(req.headers);
        headers.set("x-nonce", nonce);
        headers.set("Content-Security-Policy", csp);
        const result = NextResponse.next({ request: { headers } });
        result.headers.set("Content-Security-Policy", csp);
        return result;
    };
    let response = nextResponse();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return req.cookies.getAll();
                },
                setAll(cookiesToSet, headers) {
                    const sessionOnly = req.cookies.get(SESSION_ONLY_COOKIE)?.value === "1";
                    cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
                    response = nextResponse();
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, authCookieOptions(options, sessionOnly))
                    );
                    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
                },
            },
        }
    );

    const result = await supabase.auth.getClaims().catch(() => null);
    const claims = result?.error ? null : result?.data?.claims;
    if (!claims && req.nextUrl.pathname === "/map") {
        const redirect = NextResponse.redirect(new URL(loginPath(`${req.nextUrl.pathname}${req.nextUrl.search}`), req.url));
        redirect.headers.set("Content-Security-Policy", csp);
        response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
        for (const header of ["cache-control", "expires", "pragma"]) {
            const value = response.headers.get(header);
            if (value) redirect.headers.set(header, value);
        }
        redirect.headers.set("Cache-Control", "no-store");
        return redirect;
    }
    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|maplibre/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)"],
};
