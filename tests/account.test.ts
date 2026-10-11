import assert from "node:assert/strict";
import { test } from "node:test";
import { DELETE } from "../app/api/user/route";
import { deleteAccount } from "../app/engine/controller/userServerController";

test("account deletion requires sign-in and deletes only the signed-in auth user", async (context) => {
    assert.equal((await DELETE(new Request("http://localhost/api/user", { method: "DELETE" }))).status, 401);
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
    const userId = "11111111-1111-4111-8111-111111111111";
    let status = 200;
    const calls: { url: URL; method?: string }[] = [];
    context.mock.method(globalThis, "fetch", async (request: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: new URL(String(request)), method: init?.method });
        return Response.json(status === 200 ? { id: userId } : { msg: "boom" }, { status });
    });
    try {
        await deleteAccount(userId);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].method, "DELETE");
        assert.equal(calls[0].url.pathname, `/auth/v1/admin/users/${userId}`);
        status = 500;
        await assert.rejects(deleteAccount(userId));
    } finally {
        if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
        if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    }
});
