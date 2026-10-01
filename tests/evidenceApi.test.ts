import { test } from "node:test";
import assert from "node:assert/strict";
import { getEvidenceClusters, getZoneEvidence } from "../app/engine/lib/evidenceApi";

const response = {
    zone_id: "pancoran",
    scope: "career",
    freshness: "fresh",
    snapshot: {
        data: {
            opening_count: 1, observed_office_count: 0, sources_monitored: 5, coverage: "partial", confidence: 0.694,
            salary_idr: { status: "unavailable" }, as_of: "2026-09-28",
            limitations: ["approx. 5 more observations found elsewhere in or beyond Jakarta Selatan are not counted for this zone."],
        },
        coverage: "partial", confidence: 0.694, evidence_count: 5, generated_at: "2026-09-28T08:10:00Z",
        refresh_after: "2026-09-29T08:10:00Z", expires_at: "2026-10-01T08:10:00Z", is_stale: false, is_expired: false,
    },
    refresh: {
        status: "idle", stage: null, retry_at: null,
        runs: [{
            run_id: "2d5ed129-073f-4393-95d0-92d429c7bfcc", evidence_type: "active_opening", status: "partial", stage: "partial",
            requested_at: "2026-09-28T08:07:00Z", started_at: "2026-09-28T08:07:01Z", completed_at: "2026-09-28T08:10:00Z",
            retry_at: null, accepted: 1, rejected: { sector_mismatch: 1 }, incomplete_categories: ["salary"],
            snapshot_published: true, error_code: null,
        }],
    },
};

test("zone evidence client requests the public route and accepts aggregate-only snapshots", async (context) => {
    let requested = "";
    let body: unknown = response;
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
        requested = String(input);
        return Response.json(body);
    });
    const signal = new AbortController().signal;

    const evidence = await getZoneEvidence("pancoran", "career", signal);
    assert.equal(requested, "/api/zones/pancoran/evidence?scope=career");
    assert.equal(evidence.snapshot?.data.opening_count, 1);
    assert.equal(evidence.refresh.runs[0].accepted, 1);

    body = { ...response, snapshot: null, freshness: "missing" };
    assert.equal((await getZoneEvidence("pancoran", "career", signal)).snapshot, null);

    // Company-level detail must never reach the browser through a snapshot.
    body = { ...response, snapshot: { ...response.snapshot, data: { ...response.snapshot.data, companies: ["PT Contoh"] } } };
    await assert.rejects(getZoneEvidence("pancoran", "career", signal), /Invalid evidence snapshot/);
    body = { ...response, zone_id: "setiabudi" };
    await assert.rejects(getZoneEvidence("pancoran", "career", signal), /Invalid evidence response/);
    body = { ...response, refresh: { ...response.refresh, status: "sleeping" } };
    await assert.rejects(getZoneEvidence("pancoran", "career", signal), /Invalid evidence response/);
});

test("evidence clusters client requests city counts and rejects malformed clusters", async (context) => {
    const clusters = {
        city_id: "jakarta-selatan", scope: "career",
        clusters: [{ zone_id: "setiabudi", zone_name: "Setiabudi", centroid: [106.83, -6.22],
            counts: { office_presence: { count: 3, organizations: 3 } }, labels: ["sekitar 3 kantor"], latest_retrieved_at: "2026-09-28T09:00:00Z" }],
    };
    let requested = "";
    let body: unknown = clusters;
    context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
        requested = String(input);
        return Response.json(body);
    });
    const signal = new AbortController().signal;
    const result = await getEvidenceClusters("jakarta-selatan", "career", signal);
    assert.equal(requested, "/api/evidence/clusters?city_id=jakarta-selatan&scope=career");
    assert.deepEqual(result.clusters[0].labels, ["sekitar 3 kantor"]);

    body = { ...clusters, clusters: [{ ...clusters.clusters[0], centroid: [500, -6.22] }] };
    await assert.rejects(getEvidenceClusters("jakarta-selatan", "career", signal), /Invalid evidence clusters/);
    body = { ...clusters, city_id: "jakarta-pusat" };
    await assert.rejects(getEvidenceClusters("jakarta-selatan", "career", signal), /Invalid evidence clusters/);
});
