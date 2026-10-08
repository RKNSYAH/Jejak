import { isRecord } from "../lib/zoneGeometry";
import { draftKeys, FORM_DRAFT_KEY, STORY_DRAFT_KEY } from "./types";

type DraftKind = "form" | "story";
type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function readOnboardingDraft(userId: string, kind: DraftKind, storage: DraftStorage = sessionStorage): unknown {
    // Legacy drafts have no provable owner. Never adopt them for the next account.
    storage.removeItem(FORM_DRAFT_KEY);
    storage.removeItem(STORY_DRAFT_KEY);
    const key = draftKeys(userId)[kind];
    const raw = storage.getItem(key);
    if (!raw) return null;
    let saved: unknown;
    try { saved = JSON.parse(raw); }
    catch { storage.removeItem(key); return null; }
    return isRecord(saved) && saved.ownerId === userId ? saved.draft : null;
}

export function writeOnboardingDraft(userId: string, kind: DraftKind, draft: unknown, storage: DraftStorage = sessionStorage) {
    storage.setItem(draftKeys(userId)[kind], JSON.stringify({ ownerId: userId, draft }));
}

export function clearOnboardingDrafts(userId: string, storage: DraftStorage = sessionStorage) {
    try {
        for (const key of [...Object.values(draftKeys(userId)), FORM_DRAFT_KEY, STORY_DRAFT_KEY]) storage.removeItem(key);
    } catch { /* Logout/deletion must work even when browser storage is unavailable. */ }
}
