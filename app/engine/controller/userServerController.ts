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

export type AccountSummary = { name: string; planName: string | null };

// Signup name (email username as fallback) and current plan; no subscription row means the free tier.
export async function getAccountSummary(): Promise<AccountSummary | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = error ? null : data?.claims;
    if (!claims) return null;

    const metadata = claims.user_metadata ?? {};
    const email = typeof claims.email === "string" ? claims.email.split("@")[0] : null;
    const name = [metadata.name, metadata.full_name, email]
        .find((value): value is string => typeof value === "string" && value.trim() !== "")?.trim() ?? "Akun";

    const subscription = await supabase.rpc("get_my_subscription").maybeSingle<{ plan_name: string }>();
    return { name, planName: subscription.error ? null : subscription.data?.plan_name ?? "Gratis" };
}
