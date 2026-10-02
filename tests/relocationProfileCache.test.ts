import assert from "node:assert/strict";
import { test } from "node:test";
import { clearRelocationProfileCache, isStoredRelocationProfile, readRelocationProfileCache, writeRelocationProfileCache } from "../app/engine/lib/relocationProfileCache";
import type { StoredRelocationProfile } from "../app/engine/lib/relocationProfile";

function memoryStorage() {
    const values = new Map<string, string>();
    return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
    };
}

const profile: StoredRelocationProfile = {
    id: "saved-profile", profile_name: "primary", revision: 1,
    confirmed_at: "2026-09-30T00:00:00Z", updated_at: "2026-09-30T00:00:00Z",
    profile: {
        schema_version: "relocation-profile-v1", hard_constraints: { goal: "work" }, soft_preferences: {},
        priority_weights: { career: 1 }, taxonomy_version: "2026-09", contract_version: "lf05-v2",
    },
};

test("cache distinguishes unknown from a confirmed missing profile", () => {
    const storage = memoryStorage();
    assert.equal(readRelocationProfileCache("user-a", storage), undefined);
    writeRelocationProfileCache("user-a", null, storage);
    assert.equal(readRelocationProfileCache("user-a", storage), null);
});

test("saved profiles survive another cache read and remain scoped to their user", () => {
    const storage = memoryStorage();
    writeRelocationProfileCache("user-a", profile, storage);
    assert.deepEqual(readRelocationProfileCache("user-a", storage), profile);
    assert.equal(readRelocationProfileCache("user-b", storage), undefined);
    storage.setItem("jejak:relocation-profile:v1:user-b", storage.getItem("jejak:relocation-profile:v1:user-a")!);
    assert.equal(readRelocationProfileCache("user-b", storage), undefined);
});

test("saving replaces an incomplete cache and logout clears only that user's entry", () => {
    const storage = memoryStorage();
    writeRelocationProfileCache("user-a", null, storage);
    writeRelocationProfileCache("user-b", profile, storage);
    writeRelocationProfileCache("user-a", profile, storage);
    assert.deepEqual(readRelocationProfileCache("user-a", storage), profile);
    clearRelocationProfileCache("user-a", storage);
    assert.equal(readRelocationProfileCache("user-a", storage), undefined);
    assert.deepEqual(readRelocationProfileCache("user-b", storage), profile);
});

test("corrupt, obsolete, and invalid cached profiles are treated as cache misses", () => {
    const storage = memoryStorage();
    for (const value of ["{", "null", JSON.stringify({ version: 2, userId: "user-a", profile }),
        JSON.stringify({ version: 1, userId: "user-a", profile: {} })]) {
        storage.setItem("jejak:relocation-profile:v1:user-a", value);
        assert.equal(readRelocationProfileCache("user-a", storage), undefined);
    }
    assert.equal(isStoredRelocationProfile({ ...profile, revision: 0 }), false);
    assert.equal(isStoredRelocationProfile({ ...profile, profile: { ...profile.profile, hard_constraints: {} } }), false);
    assert.equal(isStoredRelocationProfile({ ...profile, profile: { ...profile.profile, soft_preferences: { goal: "work" }, hard_constraints: {} } }), true);
    assert.equal(isStoredRelocationProfile({ ...profile, profile: { ...profile.profile, soft_preferences: { goal: "study" } } }), false);
    assert.equal(isStoredRelocationProfile({ ...profile, profile: { ...profile.profile, priority_weights: { career: "1" } } }), false);
});

test("blocked browser storage does not prevent cache operations or sign-out", () => {
    const storage = {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
        removeItem: () => { throw new Error("blocked"); },
    };
    assert.equal(readRelocationProfileCache("user-a", storage), undefined);
    assert.doesNotThrow(() => writeRelocationProfileCache("user-a", profile, storage));
    assert.doesNotThrow(() => clearRelocationProfileCache("user-a", storage));
});
