import assert from "node:assert/strict";
import { test } from "node:test";
import { spyOn } from "bun:test";
import * as auth from "../app/engine/controller/userServerController";
import { GET, POST, DELETE } from "../app/api/user/relocation-profile/route";
import { DELETE as deleteAccount } from "../app/api/user/route";
import { EXPECTED_USER_HEADER } from "../app/engine/lib/accountIdentity";
import { draftKeys, FORM_DRAFT_KEY, STORY_DRAFT_KEY } from "../app/engine/onboarding/types";
import { readOnboardingDraft, writeOnboardingDraft, clearOnboardingDrafts } from "../app/engine/onboarding/draftStorage";
import { defaultAnswers } from "../app/engine/onboarding/demoData";

test("both onboarding drafts stay owned across expiry and another login; legacy drafts are discarded", () => {
    const values = new Map<string, string>();
    const storage = {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
    };
    storage.setItem(FORM_DRAFT_KEY, JSON.stringify({ answers: "unowned form" }));
    storage.setItem(STORY_DRAFT_KEY, JSON.stringify({ story: "unowned story" }));
    for (const kind of ["form", "story"] as const) {
        const draft = { privatePlan: `${kind} for A` };
        writeOnboardingDraft("A", kind, draft, storage);
        assert.equal(readOnboardingDraft("B", kind, storage), null);
        assert.deepEqual(readOnboardingDraft("A", kind, storage), draft);
        storage.setItem(draftKeys("B")[kind], storage.getItem(draftKeys("A")[kind])!);
        assert.equal(readOnboardingDraft("B", kind, storage), null, "check owner even if a draft is under the wrong key");
        writeOnboardingDraft("B", kind, { privatePlan: `${kind} for B` }, storage);
    }
    assert.equal(storage.getItem(FORM_DRAFT_KEY), null);
    assert.equal(storage.getItem(STORY_DRAFT_KEY), null);
    clearOnboardingDrafts("A", storage);
    for (const kind of ["form", "story"] as const) {
        assert.equal(readOnboardingDraft("A", kind, storage), null);
        assert.deepEqual(readOnboardingDraft("B", kind, storage), { privatePlan: `${kind} for B` });
    }
});

test("profile reads/saves/deletes and account deletion reject stale or absent expected owners before data access", async (context) => {
    const authMock = spyOn(auth, "getAuthenticatedUserId").mockResolvedValue("B");
    let dataCalls = 0;
    context.mock.method(globalThis, "fetch", async () => { dataCalls++; throw new Error("Must not access data"); });
    try {
        for (const expected of ["A", null]) {
            const headers = { "Content-Type": "application/json", ...(expected ? { [EXPECTED_USER_HEADER]: expected } : {}) };
            for (const [method, handler] of [["GET", GET], ["POST", POST], ["DELETE", DELETE], ["DELETE", deleteAccount]] as const) {
                const response = await handler(new Request("http://localhost/api/user/relocation-profile", {
                    method, headers, ...(method === "POST" ? { body: JSON.stringify({ form_answers: defaultAnswers, base_revision: null }) } : {}),
                }));
                assert.equal(response.status, 409);
                assert.equal((await response.json()).code, "ACCOUNT_CHANGED");
            }
        }
        assert.equal(dataCalls, 0);
    } finally { authMock.mockRestore(); }
});
