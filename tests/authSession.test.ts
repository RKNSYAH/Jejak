import assert from "node:assert/strict";
import { test } from "node:test";
import { authCookieOptions, browserAuthCookie } from "../app/engine/lib/authSession";

test("remembered sessions keep Supabase's cookie lifetime", () => {
    const options = { path: "/", sameSite: "lax" as const, maxAge: 34560000 };
    assert.equal(authCookieOptions(options, false), options);
});

test("session-only cookies omit expiry across browser and server refreshes", () => {
    const options = { path: "/", maxAge: 34560000, expires: new Date("2027-01-01T00:00:00Z") };
    assert.deepEqual(authCookieOptions(options, true), { path: "/" });
    assert.equal(options.maxAge, 34560000);
    assert.equal(authCookieOptions({ path: "/", maxAge: 0 }, true).maxAge, 0);
});

test("browser auth cookies follow the preference while deletion still works", () => {
    const options = { path: "/", sameSite: "lax" as const, maxAge: 34560000 };
    assert.match(browserAuthCookie("sb-auth", "token", options, false), /Max-Age=34560000/);
    assert.doesNotMatch(browserAuthCookie("sb-auth", "token", options, true), /Max-Age|Expires/);
    assert.match(browserAuthCookie("sb-auth", "", { ...options, maxAge: 0 }, true), /Max-Age=0/);
});
