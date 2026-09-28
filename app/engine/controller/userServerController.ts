import "server-only";
import { createClient } from "../lib/server";

export async function getAuthenticatedClaims() {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    return error ? null : data?.claims ?? null;
}

export async function registerUser(email: string, password: string, name: string) {
    const supabase = await createClient();
    return supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
    });
}

export async function loginUser(email: string, password: string) {
    const supabase = await createClient();
    return supabase.auth.signInWithPassword({ email, password });
}
