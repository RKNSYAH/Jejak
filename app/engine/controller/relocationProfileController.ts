import "server-only";
import { createAdminClient } from "../lib/admin";
import { createClient } from "../lib/server";
import {
    RELOCATION_PROFILE_NAME,
    type PersistedRelocationProfile,
    type StoredRelocationProfile,
} from "../lib/relocationProfile";
import { isStoredRelocationProfile } from "../lib/relocationProfileCache";

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
    const stored = { ...data, id: String(data.id), revision: Number(data.revision) };
    // Legacy profiles with a valid goal remain readable; incomplete ones need setup.
    return isStoredRelocationProfile(stored) ? stored : null;
}

export async function deleteRelocationProfile(userId: string): Promise<void> {
    const { error } = await createAdminClient().from("relocation_profiles")
        .delete().eq("user_id", userId).eq("profile_name", RELOCATION_PROFILE_NAME);
    if (error) throw error;
}

export async function saveConfirmedRelocationProfile(
    userId: string,
    profile: PersistedRelocationProfile,
): Promise<StoredRelocationProfile> {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("save_confirmed_relocation_profile", {
        p_user_id: userId,
        p_profile_name: RELOCATION_PROFILE_NAME,
        p_profile: profile,
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (!row || typeof row.id !== "string" && typeof row.id !== "number") {
        throw new Error("Profile save returned no revision");
    }

    // Read the actual inserted row, not an echo of the submitted profile.
    const { data: saved, error: readError } = await supabase.from("relocation_profiles")
        .select("id, profile_name, revision, profile, confirmed_at, updated_at")
        .eq("id", row.id).eq("user_id", userId).eq("confirmed", true).single();
    if (readError) throw readError;
    const stored = saved ? { ...saved, id: String(saved.id), revision: Number(saved.revision) } : null;
    if (!isStoredRelocationProfile(stored)) throw new Error("Saved profile could not be verified");
    return stored;
}
