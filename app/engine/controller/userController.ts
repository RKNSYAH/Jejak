import { createClient, setRememberPreference } from "../lib/client";

export async function registerUser(email: string, password: string, name: string, emailRedirectTo?: string) {
    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
        email,
        password: password,
        options: {
            data: {
                name
            },
            ...(emailRedirectTo ? { emailRedirectTo } : {}),
        }
    });
    return { data, error };
}

export async function loginUser(email: string, password: string) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    return { data, error };
}

export async function requestPasswordReset(email: string, origin: string) {
    const supabase = createClient();
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/login?mode=reset")}`;
    return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}

export async function updatePassword(password: string) {
    const supabase = createClient();
    return supabase.auth.updateUser({ password });
}

export async function loginWithGoogle(origin: string, next = "/map") {
    const supabase = createClient();
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("next", next);
    return supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
    });
}

export async function getAuthenticatedUser() {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();

    return user;
}

export async function logoutUser() {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
        throw new Error(`Logout failed: ${error.message}`);
    }

    setRememberPreference(true);
    return true;
}
