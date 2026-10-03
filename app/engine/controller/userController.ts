import { createClient, setRememberPreference } from "../lib/client";

export async function requestPasswordReset(email: string, origin: string) {
    const redirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/login?mode=reset")}`;
    return createClient().auth.resetPasswordForEmail(email, { redirectTo });
}

export async function loginWithGoogle(origin: string, next = "/map") {
    const callback = new URL("/auth/callback", origin);
    callback.searchParams.set("next", next);
    return createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString() } });
}

export async function logoutUser() {
    const { error } = await createClient().auth.signOut();
    if (error) throw new Error(`Logout failed: ${error.message}`);
    setRememberPreference(true);
}
