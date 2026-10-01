import "server-only";
import { createAdminClient } from "../lib/admin";
import { createClient } from "../lib/server";
import {
    RELOCATION_PROFILE_NAME,
    type PersistedRelocationProfile,
    type StoredRelocationProfile,
} from "../lib/relocationProfile";

export async function getSavedRelocationProfile(userId: string): Promise<StoredRelocationProfile | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from("relocation_profiles")
        .select("id, profile_name, revision, profile, confirmed_at, updated_at")
        .eq("user_id", userId)
        .eq("profile_name", RELOCATION_PROFILE_NAME)
        .eq("confirmed", true)
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return {
        id: String(data.id),
        profile_name: data.profile_name,
        revision: data.revision,
        profile: data.profile as PersistedRelocationProfile,
        confirmed_at: data.confirmed_at,
        updated_at: data.updated_at,
    };
}

export async function saveConfirmedRelocationProfile(
    userId: string,
    profile: PersistedRelocationProfile,
): Promise<StoredRelocationProfile> {
    const { data, error } = await createAdminClient().rpc("save_confirmed_relocation_profile", {
        p_user_id: userId,
        p_profile_name: RELOCATION_PROFILE_NAME,
        p_profile: profile,
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row || typeof row.id !== "string" && typeof row.id !== "number") {
        throw new Error("Profile save returned no revision");
    }

    return {
        id: String(row.id),
        profile_name: RELOCATION_PROFILE_NAME,
        revision: Number(row.revision),
        profile,
        confirmed_at: row.confirmed_at,
        updated_at: row.updated_at,
    };
}
