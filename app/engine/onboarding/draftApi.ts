import { accountFetch, type AccountScope } from "../lib/accountIdentity";
import { isRecord } from "../lib/zoneGeometry";
import type { OnboardingDraftKind } from "./types";

const pendingWrites = new Map<string, Promise<void>>();

export async function fetchOnboardingDraft(account: AccountScope, kind: OnboardingDraftKind): Promise<{ draft: unknown; updatedAt: string } | null> {
    const { response, result } = await accountFetch(account, `/api/user/onboarding-drafts?kind=${kind}`, {
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok || !isRecord(result) || result.user_id !== account.userId) throw new Error("Draft load failed");
    if (result.saved === null) return null;
    if (!isRecord(result.saved) || typeof result.saved.updated_at !== "string") throw new Error("Invalid saved draft");
    return { draft: result.saved.draft, updatedAt: result.saved.updated_at };
}

export async function persistOnboardingDraft(account: AccountScope, kind: OnboardingDraftKind, draft: unknown): Promise<void> {
    const key = `${account.userId}:${kind}`;
    const previous = pendingWrites.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
        const { response } = await accountFetch(account, "/api/user/onboarding-drafts", {
            method: "PUT", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind, draft }), signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) throw new Error("Draft save failed");
    });
    pendingWrites.set(key, current);
    try { await current; }
    finally { if (pendingWrites.get(key) === current) pendingWrites.delete(key); }
}

export async function removeOnboardingDraft(account: AccountScope, kind: OnboardingDraftKind): Promise<void> {
    const { response } = await accountFetch(account, `/api/user/onboarding-drafts?kind=${kind}`, {
        method: "DELETE", signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Draft delete failed");
}
