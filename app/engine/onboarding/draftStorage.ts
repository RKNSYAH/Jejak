import { isRecord } from "../lib/zoneGeometry";
import { draftKeys, FORM_DRAFT_KEY, STORY_DRAFT_KEY } from "./types";

type DraftKind = "form" | "story";
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserStorage(): DraftStorage {
    // ponytail: drafts persist across visits on this browser; add server sync if cross-device recovery is required.
    try { return localStorage; }
    catch { return sessionStorage; }
}

export function readOnboardingDraft(userId: string, kind: DraftKind, storage?: DraftStorage): unknown {
    return readOnboardingDraftRecord(userId, kind, storage)?.draft ?? null;
}

export function readOnboardingDraftRecord(userId: string, kind: DraftKind, storage?: DraftStorage): { draft: unknown; updatedAt: string | null } | null {
    const target = storage ?? browserStorage();
    // Legacy drafts have no provable owner. Never adopt them for the next account.
    target.removeItem(FORM_DRAFT_KEY);
    target.removeItem(STORY_DRAFT_KEY);
    if (!storage) {
        try {
            sessionStorage.removeItem(FORM_DRAFT_KEY);
            sessionStorage.removeItem(STORY_DRAFT_KEY);
        } catch { /* Browser storage can be disabled. */ }
    }
    const key = draftKeys(userId)[kind];
    let raw = target.getItem(key);
    if (!raw && !storage) {
        try { raw = sessionStorage.getItem(key); } catch { /* Browser storage can be disabled. */ }
    }
    if (!raw) return null;
    let saved: unknown;
    try { saved = JSON.parse(raw); }
    catch { target.removeItem(key); return null; }
    return isRecord(saved) && saved.ownerId === userId
        ? { draft: saved.draft, updatedAt: typeof saved.updatedAt === "string" ? saved.updatedAt : null }
        : null;
}

export function writeOnboardingDraft(userId: string, kind: DraftKind, draft: unknown, storage: DraftStorage = browserStorage()) {
    storage.setItem(draftKeys(userId)[kind], JSON.stringify({ ownerId: userId, updatedAt: new Date().toISOString(), draft }));
}

export function clearOnboardingDraft(userId: string, kind: DraftKind, storage?: DraftStorage) {
    try {
        const targets = [storage ?? browserStorage()];
        if (!storage) {
            try { if (!targets.includes(sessionStorage)) targets.push(sessionStorage); } catch { /* Browser storage can be disabled. */ }
        }
        for (const target of targets) target.removeItem(draftKeys(userId)[kind]);
    }
    catch { /* Draft cleanup must not block onboarding when browser storage is unavailable. */ }
}

export function clearOnboardingDrafts(userId: string, storage?: DraftStorage) {
    try {
        const targets = [storage ?? browserStorage()];
        if (!storage) {
            try { if (!targets.includes(sessionStorage)) targets.push(sessionStorage); } catch { /* Browser storage can be disabled. */ }
        }
        for (const target of targets) {
            for (const key of [...Object.values(draftKeys(userId)), FORM_DRAFT_KEY, STORY_DRAFT_KEY]) target.removeItem(key);
        }
    } catch { /* Logout/deletion must work even when browser storage is unavailable. */ }
}
