import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeCachedFacts, type CachedFactRow } from "../app/engine/enrichment/cachedFacts";
import { evidenceScope, type EvidenceType } from "../app/engine/enrichment/scopes";
import type { RegionFact } from "../app/engine/types";
import { getZoneMapData } from "../app/engine/lib/zoneApi";
import { getOnboardingData } from "../app/engine/lib/onboardingApi";

const sector = "software_and_it_services";
const now = Date.parse("2026-10-04T00:00:00Z");
const fact = (metric: string, value: number): RegionFact => ({
    metric, value, unit: "IDR", source: "Static source", period_end: "2025-12-31",
    evidence_type: "derived", limitations: "Static limitation", is_sample: false,
});
function cached(type: EvidenceType, value: unknown, overrides: Partial<CachedFactRow> = {}): CachedFactRow {
    return {
        region_id: 1, evidence_type: type, scope_hash: evidenceScope(type, sector).scopeHash,
        dedup_hash: JSON.stringify(value), value, locality_tier: "zone",
        validation_status: "accepted", is_sample: false, retrieved_at: "2026-10-02T00:00:00Z",
        refresh_after: "2026-10-06T00:00:00Z", expires_at: "2026-10-09T00:00:00Z", ...overrides,
    };
}

test("cached rents override only the corresponding housing type, using actual medians", () => {
    const staticFacts = [fact("median_monthly_rent_idr", 9_000_000), fact("median_monthly_rent_idr:apartment", 8_000_000),
        fact("population", 42), fact("average_monthly_wage_idr", 6_000_000)];
    const rows = [1_000_000, 1_200_000, 4_000_000].map((monthly_rent_idr) => cached("kos_listing", { monthly_rent_idr }));
    const merged = mergeCachedFacts(staticFacts, rows, sector, now);
    const rent = merged.find((item) => item.metric === "median_monthly_rent_idr")!;
    assert.equal(rent.value, 1_200_000, "median, not midpoint of min/max");
    assert.equal(rent.dimension_value, "kos");
    assert.equal(rent.sample_size, 3);
    assert.equal(rent.is_sample, false);
    assert.equal(rent.freshness, "fresh");
    assert.equal(rent.period_end, null, "retrieval is not an observation period");
    assert.equal(rent.retrieved_at, "2026-10-02T00:00:00Z");
    for (const original of staticFacts.slice(1)) assert.ok(merged.includes(original));
    assert.ok(!JSON.stringify(merged).includes("Organization A"));
    assert.equal(mergeCachedFacts(staticFacts, [], sector, now), staticFacts);
});

test("cache fallback rejects expired, unaccepted, sample, nonlocal, and wrong-scope evidence", () => {
    const base = [fact("median_monthly_rent_idr", 2_000_000)];
    const listing = { monthly_rent_idr: 1_000_000 };
    const unusable = [
        cached("kos_listing", listing, { expires_at: "2026-10-04T00:00:00Z" }),
        cached("kos_listing", listing, { validation_status: "candidate" }),
        cached("kos_listing", listing, { is_sample: true }),
        cached("kos_listing", listing, { locality_tier: "city" }),
        cached("kos_listing", listing, { scope_hash: "another-scope" }),
        cached("kos_listing", { monthly_rent_idr: "Rp1jt" }),
    ];
    assert.equal(mergeCachedFacts(base, unusable, sector, now), base);
    const stale = cached("kos_listing", listing, { refresh_after: "2026-10-03T00:00:00Z" });
    const rent = mergeCachedFacts(base, [stale], sector, now)[0];
    assert.equal(rent.value, 1_000_000);
    assert.equal(rent.freshness, "stale", "refresh due remains usable until expiry");
});

test("cache respects separate house/apartment medians and deduplicates repeated evidence", () => {
    const kos = { ...fact("median_monthly_rent_idr:legacy", 3_000_000), dimension_key: "housing_type" as const, dimension_value: "kos" };
    const row = cached("kos_listing", { monthly_rent_idr: 1_000_000 });
    const merged = mergeCachedFacts([kos], [row, row,
        cached("apartment_listing", { monthly_rent_idr: 4_000_000 }),
        cached("apartment_listing", { monthly_rent_idr: 6_000_000 }),
        cached("house_listing", { monthly_rent_idr: 8_000_000 })], sector, now);
    assert.deepEqual(merged.map((item) => [item.dimension_value, item.value]), [["kos", 1_000_000], ["apartment", 5_000_000], ["house", 8_000_000]]);
    assert.equal(merged[0].sample_size, 1);
});

test("opening cache complements static statistics; offices require boundary binning and salaries remain ranges", () => {
    const base = [fact("company_count", 100), fact("employment_rate", 0.7), fact("average_monthly_wage_idr", 6_000_000)];
    const rows = [cached("office_presence", "Office A"), cached("office_presence", "Office B"),
        cached("active_opening", { title: "Engineer" }),
        cached("salary_observation", { minimum: 8_000_000, maximum: 12_000_000 })];
    const merged = mergeCachedFacts(base, rows, sector, now);
    assert.ok(merged.includes(base[0]), "run-scoped offices must not assign a company count to the searched district");
    assert.deepEqual(merged.find((item) => item.metric === "opening_count")?.sector_ids, [sector]);
    assert.equal(merged.find((item) => item.metric === "opening_count")?.approximate, true);
    assert.ok(merged.includes(base[1]));
    assert.ok(merged.includes(base[2]), "observed salary range is not an average wage");
    assert.equal(mergeCachedFacts(base, [cached("office_presence", "Other", { scope_hash: evidenceScope("office_presence", "telecommunications").scopeHash })], sector, now), base);
});

test("map and onboarding API readers retain cache provenance and reject malformed scoring metadata", async (context) => {
    let facts: unknown[] = mergeCachedFacts([], [cached("kos_listing", { monthly_rent_idr: 1_000_000 })], sector, now);
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => String(input).includes("/api/onboarding/")
        ? Response.json({ cities: [{ city_id: "jakarta-selatan", city_name: "Jakarta Selatan", district_count: 1, center: null, is_sample: false }],
            areas: [{ zone_id: "a", zone_name: "a", city_id: "jakarta-selatan", city_name: "Jakarta Selatan", is_sample: false,
                center: null, facts, campuses: [], transit_stop_count: 0, living_cost: null }], destinations: [] })
        : Response.json({ details: { facts, places: [], is_sample: false }, geometry: null, geometry_error: null }));
    const signal = new AbortController().signal;
    assert.equal((await getOnboardingData("jakarta-selatan", signal)).areas[0].facts[0].freshness, "fresh");
    assert.equal((await getZoneMapData("a", signal)).details.facts[0].sample_size, 1);
    const valid = facts[0] as RegionFact;
    for (const metadata of [{ sector_ids: "software_and_it_services" }, { freshness: "expired" }, { sample_size: -1 }, { geographic_level: "city" }]) {
        facts = [{ ...valid, ...metadata }];
        await assert.rejects(getOnboardingData("jakarta-selatan", signal), /Data onboarding belum valid/);
        await assert.rejects(getZoneMapData("a", signal), /Invalid region data/);
    }
});
