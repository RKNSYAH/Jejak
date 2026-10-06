import assert from "node:assert/strict";
import { test } from "node:test";
import { withCachedEvidence } from "../app/engine/controller/cachedEvidenceController";
import { evidenceScope } from "../app/engine/enrichment/scopes";
import type { RegionFact } from "../app/engine/types";

const sector = "software_and_it_services";
const staticFact: RegionFact = { metric: "median_monthly_rent_idr", value: 9_000_000, unit: "IDR",
    source: "Static", period_end: null, evidence_type: "derived", limitations: null, is_sample: false };
const rows = [{ region_code: "a", parent_code: "city", facts: [staticFact] }, { region_code: "b", parent_code: "city", facts: [] }];

test("shared cache routing paginates city evidence, aggregates privately, and retains static fallbacks", async (context) => {
    const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://cache.test";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    context.after(() => {
        if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
        if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    });
    let fail = false;
    const offsets: number[] = [];
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.pathname.endsWith("/regions")) return Response.json([{ id: 1, region_code: "a" }, { id: 2, region_code: "b" }]);
        if (url.pathname.endsWith("/zone_evidence_cache")) {
            if (fail) return Response.json({ message: "Cache unavailable" }, { status: 400 });
            assert.equal(url.searchParams.get("validation_status"), "eq.accepted");
            assert.equal(url.searchParams.get("locality_tier"), "eq.zone");
            assert.equal(url.searchParams.get("is_sample"), "eq.false");
            assert.ok(url.searchParams.get("expires_at")?.startsWith("gt."));
            const offset = Number(url.searchParams.get("offset") ?? 0);
            offsets.push(offset);
            const count = offset === 0 ? 500 : 1;
            return Response.json(Array.from({ length: count }, (_, index) => ({
                region_id: 1, evidence_type: "kos_listing", scope_hash: evidenceScope("kos_listing", sector).scopeHash,
                dedup_hash: String(offset + index), entity_name: "Private listing", value: { monthly_rent_idr: 1_000_000 + offset + index },
                locality_tier: "zone", validation_status: "accepted", is_sample: false, retrieved_at: new Date().toISOString(),
                refresh_after: new Date(Date.now() + 86_400_000).toISOString(), expires_at: new Date(Date.now() + 172_800_000).toISOString(),
            })));
        }
        if (url.pathname.endsWith("/rpc/get_evidence_clusters")) return Response.json([{
            region_code: "b", region_name: "b", centroid: { type: "Point", coordinates: [106.8, -6.2] },
            evidence_type: "office_presence", evidence_count: 3, organization_count: 2, latest_retrieved_at: new Date().toISOString(),
        }]);
        throw new Error(`Unexpected fixture request ${url.pathname}`);
    });
    const result = await withCachedEvidence(rows, sector);
    assert.deepEqual(offsets, [0, 500]);
    assert.equal(result[0].facts[0].sample_size, 501);
    assert.equal(result[0].facts[0].value, 1_000_250);
    assert.equal(result[1].facts[0].value, 2, "neighbour-discovered offices retain boundary-based binning");
    assert.deepEqual(result[1].facts[0].sector_ids, [sector]);
    assert.ok(!JSON.stringify(result).includes("Private listing"));
    fail = true;
    assert.equal(await withCachedEvidence(rows, sector), rows);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.equal(await withCachedEvidence(rows, sector), rows);
});
