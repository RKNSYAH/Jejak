import "server-only";
import { createClient } from "../lib/server";

export async function getAuthenticatedClaims() {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    return error ? null : data?.claims ?? null;
}

export async function getAuthenticatedUserId() {
    const claims = await getAuthenticatedClaims();
    const userId = claims?.sub;
    return typeof userId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)
        ? userId
        : null;
}

export async function registerUser(email: string, password: string, name: string, emailRedirectTo: string) {
    const supabase = await createClient();
    return supabase.auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo },
    });
}

export async function loginUser(email: string, password: string) {
    const supabase = await createClient();
    return supabase.auth.signInWithPassword({ email, password });
}
