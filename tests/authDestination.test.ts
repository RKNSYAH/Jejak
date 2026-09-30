import assert from "node:assert/strict";
import { test } from "node:test";
import { authDestination, loginPath, signupDestination } from "../app/engine/lib/authDestination";

test("auth destinations preserve supported map and account context", () => {
    assert.equal(authDestination("/map?zone=coblong#details"), "/map?zone=coblong#details");
    assert.equal(authDestination("/user"), "/user");
    assert.equal(signupDestination("/map?zone=coblong"), "/map?zone=coblong&welcome=1");
    assert.equal(signupDestination("/user"), "/user");
});

test("auth destinations reject external redirects and auth-page loops", () => {
    for (const value of [null, "", "https://attacker.example", "//attacker.example", "/\\attacker.example", "/map\\attacker.example", "/login", "/auth/callback", "/map%2f..", "/user/../login"]) {
        assert.equal(authDestination(value), "/map", String(value));
    }
});

test("login links safely preserve map queries and fragments", () => {
    const url = new URL(loginPath("/map?zone=coblong&study=P01#details"), "http://localhost");
    assert.equal(url.pathname, "/login");
    assert.equal(url.searchParams.get("next"), "/map?zone=coblong&study=P01#details");
    assert.equal(new URL(loginPath("//attacker.example"), "http://localhost").searchParams.get("next"), "/map");
});
