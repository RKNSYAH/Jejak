import assert from "node:assert/strict";
import { test } from "node:test";
import { spyOn } from "bun:test";
import * as server from "../app/engine/lib/server";
import { GET as zones } from "../app/api/zones/route";
import { GET as heatmap } from "../app/api/heatmap/route";
import { GET as intelligence } from "../app/api/zones/[zoneId]/intelligence/route";
import { GET as evidence } from "../app/api/zones/[zoneId]/evidence/route";
import { GET as clusters } from "../app/api/evidence/clusters/route";
import { GET as runStatus } from "../app/api/enrichment-runs/[runId]/route";
import { getJson } from "../app/engine/lib/zoneApi";

const userId = "11111111-1111-4111-8111-111111111111";
const request = (path: string) => new Request(`http://localhost${path}`);
const zone = { params: Promise.resolve({ zoneId: "unknown-region" }) };
const run = { params: Promise.resolve({ runId: userId }) };

test("map APIs reject missing, invalid and failed sessions before data access", async (context) => {
    let queries = 0;
    let claims: { sub: string } | null = null;
    let authError: Error | null = null;
    let throws = false;
    const client = {
        auth: { getClaims: async () => {
            if (throws) throw new Error("Auth unavailable");
            return { data: { claims }, error: authError };
        } },
        rpc: async () => { queries += 1; throw new Error("Data must not be queried"); },
    };
    const session = spyOn(server, "createClient").mockResolvedValue(client as unknown as Awaited<ReturnType<typeof server.createClient>>);
    context.mock.method(globalThis, "fetch", async () => { throw new Error("Network must not be called"); });
    const handlers = [
        () => zones(request("/api/zones")),
        () => heatmap(request("/api/heatmap?zone_id=unknown-region&category=housing")),
        () => intelligence(request("/api/zones/unknown-region/intelligence"), zone),
        () => evidence(request("/api/zones/unknown-region/evidence?scope=career"), zone),
        () => clusters(request("/api/evidence/clusters?city_id=jakarta-selatan&scope=career")),
        () => runStatus(request(`/api/enrichment-runs/${userId}`), run),
    ];
    try {
        for (const state of ["missing", "invalid", "error", "throws"]) {
            claims = state === "missing" ? null : { sub: state === "invalid" ? "invalid-id" : userId };
            authError = state === "error" ? new Error("Invalid token") : null;
            throws = state === "throws";
            for (const handler of handlers) {
                const response = await handler();
                assert.equal(response.status, 403, state);
                assert.equal(response.headers.get("Cache-Control"), "no-store");
                assert.equal(response.headers.get("Location"), null);
                assert.equal((await response.json()).code, "SIGN_IN_REQUIRED");
            }
        }
        assert.equal(queries, 0);
    } finally {
        session.mockRestore();
    }
});

test("authenticated map requests retain successful responses and genuine 404s", async () => {
    const calls: string[] = [];
    const client = {
        auth: { getClaims: async () => ({ data: { claims: { sub: userId } }, error: null }) },
        rpc: async (name: string) => { calls.push(name); return { data: [], error: null }; },
    };
    const session = spyOn(server, "createClient").mockResolvedValue(client as unknown as Awaited<ReturnType<typeof server.createClient>>);
    try {
        const list = await zones(request("/api/zones"));
        assert.equal(list.status, 200);
        assert.deepEqual(await list.json(), { is_sample: false, zones: [] });
        assert.equal((await heatmap(request("/api/heatmap?zone_id=unknown-region&category=housing"))).status, 200);
        assert.equal((await intelligence(request("/api/zones/unknown-region/intelligence"), zone)).status, 404);
        assert.deepEqual(calls, ["get_map_regions", "get_map_cells", "get_map_region"]);
    } finally {
        session.mockRestore();
    }
});

test("map API auth failures redirect to login with context, but other failures do not", async (context) => {
    const original = Object.getOwnPropertyDescriptor(globalThis, "window");
    const redirects: string[] = [];
    Object.defineProperty(globalThis, "window", { configurable: true, value: { location: {
        pathname: "/map", search: "?zone=coblong&study=P01", hash: "#details",
        replace: (path: string) => redirects.push(path),
    } } });
    let status = 403;
    context.mock.method(globalThis, "fetch", async () => Response.json({ error: "Request denied" }, { status }));
    try {
        for (status of [403, 401, 404, 503]) {
            await assert.rejects(getJson("/api/zones", new AbortController().signal), /Request denied/);
        }
        assert.equal(redirects.length, 2);
        for (const path of redirects) {
            assert.equal(new URL(path, "http://localhost").searchParams.get("next"), "/map?zone=coblong&study=P01#details");
        }
    } finally {
        if (original) Object.defineProperty(globalThis, "window", original);
        else Reflect.deleteProperty(globalThis, "window");
    }
});
