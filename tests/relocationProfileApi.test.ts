import assert from "node:assert/strict";
import { test } from "node:test";
import { saveRelocationProfile } from "../app/engine/lib/relocationProfileApi";
import { buildFormRelocationProfile } from "../app/engine/lib/relocationProfile";
import { defaultAnswers } from "../app/engine/onboarding/demoData";
import { EXPECTED_USER_HEADER } from "../app/engine/lib/accountIdentity";

const userId = "11111111-1111-4111-8111-111111111111";
const account = { userId, signal: new AbortController().signal, invalidate: () => undefined };

const profile = {
    id: "42", profile_name: "primary", revision: 1,
    profile: buildFormRelocationProfile(defaultAnswers),
    confirmed_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
};

test("profile client returns only a valid server-saved profile", async (context) => {
    context.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
        assert.equal(url, "/api/user/relocation-profile");
        assert.equal(init.method, "POST");
        assert.equal(new Headers(init.headers).get(EXPECTED_USER_HEADER), userId);
        assert.deepEqual(JSON.parse(String(init.body)), { form_answers: defaultAnswers, base_revision: null });
        return Response.json({ user_id: userId, profile }, { status: 201 });
    });
    assert.deepEqual(await saveRelocationProfile({ form_answers: defaultAnswers, base_revision: null }, account), profile);
});

test("profile client refuses malformed, failed and unauthenticated saves", async (context) => {
    let response = new Response("not JSON", { status: 502 });
    context.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(saveRelocationProfile({}, account), /Profil belum tersimpan/);
    response = Response.json({ user_id: userId, profile: { ...profile, profile: { ...profile.profile, hard_constraints: {} } } }, { status: 201 });
    await assert.rejects(saveRelocationProfile({}, account), /Profil belum tersimpan/);
    response = Response.json({ error: "Konfirmasi semua kesimpulan sebelum menyimpan profil." }, { status: 400 });
    await assert.rejects(saveRelocationProfile({}, account), /Konfirmasi semua kesimpulan/);
    response = new Response(null, { status: 401 });
    await assert.rejects(saveRelocationProfile({}, account), /Masuk kembali/);
});

test("profile client explains connection failures in Indonesian without reporting success", async (context) => {
    context.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
    await assert.rejects(saveRelocationProfile({}, account), /Profil belum tersimpan\. Periksa koneksimu/);
});

test("profile client refuses missing/wrong owners and stale-account conflicts", async (context) => {
    let invalidations = 0;
    const scope = { ...account, invalidate: () => { invalidations++; } };
    let response = Response.json({ profile }, { status: 201 });
    context.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(saveRelocationProfile({}, scope), /Akun berubah/);
    response = Response.json({ user_id: "another-user", profile }, { status: 201 });
    await assert.rejects(saveRelocationProfile({}, scope), /Akun berubah/);
    response = Response.json({ code: "ACCOUNT_CHANGED" }, { status: 409 });
    await assert.rejects(saveRelocationProfile({}, scope), /Akun berubah/);
    assert.equal(invalidations, 3, "invalidate the old page even before an auth broadcast arrives");
});

test("late save responses cannot be applied after account invalidation, even if fetch ignores abort", async (context) => {
    const controller = new AbortController();
    let respond!: (response: Response) => void;
    context.mock.method(globalThis, "fetch", () => new Promise<Response>((resolve) => { respond = resolve; }));
    const saving = saveRelocationProfile({}, { userId, signal: controller.signal, invalidate: () => controller.abort() });
    controller.abort();
    respond(Response.json({ user_id: userId, profile }, { status: 201 }));
    await assert.rejects(saving, /Akun berubah/);
});
