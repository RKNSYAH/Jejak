import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";


export async function proxy(req: NextRequest) {
    // let response = NextResponse.next({request: req});
    // const supabase = createServerClient(
    //     process.env.NEXT_PUBLIC_SUPABASE_URL!,
    //     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    //     {
    //         cookies: {
    //             getAll() {
    //                 return req.cookies.getAll();
    //             },
    //             setAll(cookiesToSet, headers) {
    //                 cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
    //                 response = NextResponse.next({ request: req });
    //                 cookiesToSet.forEach(({ name, value, options }) =>
    //                     response.cookies.set(name, value, options)
    //                 );
    //                 Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    //             },
    //         },
    //     }
    // );

    // await supabase.auth.getClaims();
    // return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico|maplibre/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json)$).*)"],
};