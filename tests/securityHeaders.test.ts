import { test } from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config";
import { buildContentSecurityPolicy } from "../proxy";

test("security headers protect every route", async () => {
    const rules = await nextConfig.headers?.();
    assert.ok(rules);
    const headers = new Map(rules[0].headers?.map(({ key, value }) => [key, value]));
    assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
    assert.equal(headers.get("X-Frame-Options"), "DENY");
    assert.equal(headers.get("Referrer-Policy"), "strict-origin-when-cross-origin");
});

test("production CSP restricts scripts and permits only configured app and map origins", () => {
    const csp = buildContentSecurityPolicy("bm9uY2U=", {
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    });
    const scriptPolicy = csp.split("; ").find((rule) => rule.startsWith("script-src ")) ?? "";
    assert.match(scriptPolicy, /'nonce-bm9uY2U='/);
    assert.match(scriptPolicy, /'strict-dynamic'/);
    assert.doesNotMatch(scriptPolicy, /'unsafe-inline'|'unsafe-eval'/);
    assert.match(csp, /https:\/\/project\.supabase\.co wss:\/\/project\.supabase\.co/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
});
