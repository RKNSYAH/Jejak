import "server-only";
import { createAdminClient } from "../lib/admin";
import type { OnboardingDraftKind } from "../onboarding/types";

export async function getOnboardingDraft(userId: string, kind: OnboardingDraftKind): Promise<{ draft: unknown; updated_at: string } | null> {
    const { data, error } = await createAdminClient().from("onboarding_drafts")
        .select("draft, updated_at").eq("user_id", userId).eq("kind", kind).maybeSingle();
    if (error) throw error;
    return data ? { draft: data.draft, updated_at: data.updated_at } : null;
}

export async function saveOnboardingDraft(userId: string, kind: OnboardingDraftKind, draft: unknown): Promise<void> {
    const { error } = await createAdminClient().from("onboarding_drafts")
        .upsert({ user_id: userId, kind, draft, updated_at: new Date().toISOString() }, { onConflict: "user_id,kind" });
    if (error) throw error;
}

export async function deleteOnboardingDraft(userId: string, kind: OnboardingDraftKind): Promise<void> {
    const { error } = await createAdminClient().from("onboarding_drafts")
        .delete().eq("user_id", userId).eq("kind", kind);
    if (error) throw error;
}
