import "server-only";
import { createAdminClient } from "../lib/admin";
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

export async function deleteAccount(userId: string): Promise<void> {
    const { error } = await createAdminClient().auth.admin.deleteUser(userId);
    if (error) throw error;
}

export type AccountSummary ={ name: string; planName: string | null };

function displayName(value: unknown): string | null {
    if (typeof value !== "string" || !value.trim()) return null;
    return value.trim()
        .replace(/([a-z\d])([A-Z])/g, "$1 $2")
        .replace(/[._-]+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("id-ID"));
}

export async function getAccountSummary(): Promise<AccountSummary | null> {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = error ? null : data?.claims;
    if (!claims) return null;

    const metadata = claims.user_metadata ?? {};
    const email = typeof claims.email === "string" ? claims.email.split("@")[0] : null;
    const firstLast = [metadata.given_name, metadata.family_name]
        .filter((value): value is string => typeof value === "string" && !!value.trim()).join(" ");
    const name = [metadata.full_name, metadata.display_name, firstLast, metadata.name, email]
        .map(displayName).find((value): value is string => !!value) ?? "Akun";

    const subscription = await supabase.rpc("get_my_subscription").maybeSingle<{ plan_name: string }>();
    return { name, planName: subscription.error ? null : subscription.data?.plan_name ?? "Gratis" };
}
