import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions, SESSION_ONLY_COOKIE } from "./app/engine/lib/authSession";
import { loginPath } from "./app/engine/lib/authDestination";


export async function proxy(req: NextRequest) {
    let response = NextResponse.next({request: req});
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
                    response = NextResponse.next({ request: req });
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
