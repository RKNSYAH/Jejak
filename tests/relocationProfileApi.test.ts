import assert from "node:assert/strict";
import { test } from "node:test";
import { saveRelocationProfile } from "../app/engine/lib/relocationProfileApi";
import { buildFormRelocationProfile } from "../app/engine/lib/relocationProfile";
import { defaultAnswers } from "../app/engine/onboarding/demoData";

const profile = {
    id: "42", profile_name: "primary", revision: 1,
    profile: buildFormRelocationProfile(defaultAnswers),
    confirmed_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
};

test("profile client returns only a valid server-saved profile", async (context) => {
    context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
        assert.equal(url, "/api/user/relocation-profile");
        assert.equal(init.method, "POST");
        assert.deepEqual(JSON.parse(String(init.body)), { form_answers: defaultAnswers });
        return Response.json({ profile }, { status: 201 });
    });
    assert.deepEqual(await saveRelocationProfile({ form_answers: defaultAnswers }), profile);
});

test("profile client refuses malformed, failed and unauthenticated saves", async (context) => {
    let response = new Response("not JSON", { status: 502 });
    context.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(saveRelocationProfile({}), /Profil belum tersimpan/);
    response = Response.json({ profile: { ...profile, profile: { ...profile.profile, hard_constraints: {} } } }, { status: 201 });
    await assert.rejects(saveRelocationProfile({}), /Profil belum tersimpan/);
    response = Response.json({ error: "Konfirmasi semua kesimpulan sebelum menyimpan profil." }, { status: 400 });
    await assert.rejects(saveRelocationProfile({}), /Konfirmasi semua kesimpulan/);
    response = new Response(null, { status: 401 });
    await assert.rejects(saveRelocationProfile({}), /Masuk kembali/);
});

test("profile client explains connection failures in Indonesian without reporting success", async (context) => {
    context.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
    await assert.rejects(saveRelocationProfile({}), /Profil belum tersimpan\. Periksa koneksimu/);
});
