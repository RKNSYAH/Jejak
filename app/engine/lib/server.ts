import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { authCookieOptions, SESSION_ONLY_COOKIE } from "./authSession";

export async function createClient() {
    const cookieStore = await cookies();
    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookies) {
                    try {
                        const sessionOnly = cookieStore.get(SESSION_ONLY_COOKIE)?.value === "1";
                        cookies.forEach(({name, value, options}) => {
                            cookieStore.set(name, value, authCookieOptions(options, sessionOnly));
                        });
                    } catch (error) {
                        console.error("Error setting cookies:", error);
                    }
                }
            }
        }
    );

}
