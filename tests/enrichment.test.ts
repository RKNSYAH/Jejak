import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceRow, checkClaimValue, dedupHash, publishedConfidence, type EvidenceRow } from "../app/engine/enrichment/acceptance";
import { addressQueries, createNominatimGeocoder, GeocodeBudgetError, GeocoderUnavailableError, type GeocodeCache, type GeocodeResult } from "../app/engine/enrichment/geocoder";
import { parseLF01Output, type LF01Candidate } from "../app/engine/enrichment/lf01Contract";
import { resolveLocality, type LocalityTier } from "../app/engine/enrichment/locality";
import { runEnrichment, type EnrichmentDeps, type EnrichmentJob, type RunStatus } from "../app/engine/enrichment/pipeline";
import { evidenceScope, evidenceTypeForClaim, scopeEvidenceTypes, snapshotScope, type EvidenceType } from "../app/engine/enrichment/scopes";
import { buildSnapshot, type SnapshotDraft, type StoredEvidence } from "../app/engine/enrichment/snapshot";
import { isPublicSnapshot } from "../app/engine/enrichment/snapshotContract";
import { mergeLocatedEvidence, toEvidenceClusters } from "../app/engine/enrichment/clusters";
import { approxEvidenceLabel } from "../app/engine/enrichment/labels";
import { LangflowError, LANGFLOW_FLOWS } from "../app/engine/lib/langflow";

const runId = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-09-28T00:00:00.000Z");
const sector = "software_and_it_services";

type Overrides = { id?: string; claim?: object; location?: object; source?: object; subject?: object; processing?: object };

function candidate({ id = "ev-1", claim = {}, location = {}, source = {}, subject = {}, processing = {} }: Overrides = {}) {
    return {
        evidence_id: id,
        run_id: runId,
        source: {
            url: `https://careers.example.co.id/jobs/${id}`, canonical_url: `https://careers.example.co.id/jobs/${id}`,
            source_type: "builtin_unified_web_search", publisher: "careers.example.co.id",
            retrieved_at: "2026-09-27T00:00:00Z", published_at: null, content_hash: `sha256-${"A".repeat(64)}`, ...source,
        },
        subject: { entity_type: "organization", raw_name: "Example Indonesia", organization_id: null, registered_domain: "example.co.id", ...subject },
        claim: {
            claim_type: "vacancy", raw_text: "Example is hiring.", normalized_value: { title: "Software Engineer" },
            unit: null, temporal_status: "current", scope: null, ...claim,
        },
        location: { raw_address: "Jl. Pancoran Raya 1", building_name: null, precision: "street", latitude: null, longitude: null, zone_id: null, ...location },
        processing: { extraction_method: "deterministic_jsonld", model_id: null, prompt_version: "lf01-v2", extractor_confidence: 0.9, ...processing },
        validation_status: "candidate",
        zone_eligible: false,
        requires_geocoding: true,
    };
}

function lf01Output(candidates: unknown[], extra: object = {}) {
    return {
        contract_version: "lf01-v2", run_id: runId, evidence_candidates: candidates, unresolved_pages: [], rejected_urls: [],
        source_coverage: { queries: [], pages_retrieved: 4, sources_monitored: 3, coverage: "partial" },
        incomplete_evidence_categories: [], errors: [], status: "candidates_ready", writes_performed: false, ...extra,
    };
}

function parsed(overrides: Overrides = {}): LF01Candidate {
    return parseLF01Output(lf01Output([candidate(overrides)]), runId).candidates[0];
}

const jakarta = (latitude: number, longitude: number, precision: GeocodeResult["precision"]): GeocodeResult => ({
    latitude, longitude, precision, countryCode: "id", placeNames: ["Jakarta Selatan"], state: null, provinceCode: "ID-JK",
});

test("scope identities are canonical, sector-scoped for work, and hash deterministically", () => {
    const opening = evidenceScope("active_opening", sector);
    assert.equal(opening.scopeKey, "active_opening|sector=software_and_it_services");
    assert.match(opening.scopeHash, /^[0-9a-f]{64}$/);
    assert.deepEqual(evidenceScope("active_opening", sector), opening);
    assert.equal(evidenceScope("kos_listing", sector).scopeKey, "kos_listing");
    assert.equal(snapshotScope("career", sector).scopeKey, "career|sector=software_and_it_services");
    assert.equal(snapshotScope("housing", sector).scopeKey, "housing|types=apartment,house,kos");

    assert.equal(evidenceTypeForClaim("vacancy", null), "active_opening");
    assert.equal(evidenceTypeForClaim("office_location", null), "office_presence");
    assert.equal(evidenceTypeForClaim("headcount", "office"), "local_employment");
    // A company-wide total is never local employment evidence.
    assert.equal(evidenceTypeForClaim("headcount", "global"), null);
    assert.equal(evidenceTypeForClaim("kos_rent_summary", null), null);
});

test("LF-01 output needs the lf01-v2 envelope and skips malformed candidates individually", () => {
    const result = parseLF01Output(lf01Output([
        candidate(),
        candidate({ id: "ev-http", source: { url: "http://insecure.example", canonical_url: "http://insecure.example" } }),
        candidate(),
        candidate({ id: "ev-empty", claim: { normalized_value: " " } }),
    ], { errors: ["passage_selection_required:https://example.test/page"] }), runId);
    assert.equal(result.candidates.length, 1);
    assert.deepEqual(result.skipped.map((item) => item.reason), ["missing_https_url", "duplicate_evidence_id", "missing_value"]);
    assert.equal(result.candidates[0].contentHash, "a".repeat(64));
    assert.deepEqual(result.errors, ["passage_selection_required"]);
    assert.equal(result.sourcesMonitored, 3);

    for (const bad of [
        { ...lf01Output([]), contract_version: "lf01-v1" },
        { ...lf01Output([]), run_id: "another-run" },
        { ...lf01Output([]), writes_performed: true },
        { ...lf01Output([]), evidence_candidates: {} },
    ]) assert.throws(() => parseLF01Output(bad, runId), /INVALID_LF01_OUTPUT/);
});

test("acceptance checks value shapes and hashes claims independent of key order", () => {
    assert.equal(checkClaimValue(parsed(), "active_opening"), null);
    assert.equal(checkClaimValue(parsed({ claim: { temporal_status: "expired" } }), "active_opening"), "expired_vacancy");
    const listing = (monthly: unknown) => parsed({ claim: { claim_type: "kos_rent", normalized_value: { listing_name: "Kos A", monthly_rent_idr: monthly } } });
    assert.equal(checkClaimValue(listing(1_500_000), "kos_listing"), null);
    assert.equal(checkClaimValue(listing(1_500), "kos_listing"), "invalid_listing_value");
    assert.equal(checkClaimValue(listing("1.5jt"), "kos_listing"), "invalid_listing_value");
    const headcount = (value: object) => parsed({ claim: { claim_type: "headcount", scope: "office", normalized_value: value } });
    assert.equal(checkClaimValue(headcount({ minimum: 50, maximum: 100, basis: "range" }), "local_employment"), null);
    assert.equal(checkClaimValue(headcount({ minimum: 100, maximum: 50, basis: "range" }), "local_employment"), "invalid_headcount_value");

    assert.equal(dedupHash("kos_listing", "https://a.test", { b: 1, a: 2 }), dedupHash("kos_listing", "https://a.test", { a: 2, b: 1 }));
    assert.notEqual(dedupHash("kos_listing", "https://a.test", { a: 1 }), dedupHash("house_listing", "https://a.test", { a: 1 }));
});

test("published confidence favors first-party, precise, fresh, corroborated evidence", () => {
    const firstParty = parsed();
    const unknownSite = parsed({ source: { canonical_url: "https://aggregator.test/job" }, subject: { registered_domain: null } });
    assert.ok(publishedConfidence(firstParty, "street", false, now) > publishedConfidence(unknownSite, "street", false, now));
    const snippet = parsed({ source: { canonical_url: "https://id.linkedin.com/jobs/view/1", source_type: "search_snippet" }, subject: { registered_domain: null } });
    assert.ok(publishedConfidence(snippet, "street", false, now) < publishedConfidence(unknownSite, "street", false, now));
    assert.ok(publishedConfidence(firstParty, "street", false, now) > publishedConfidence(firstParty, "city", false, now));
    assert.ok(publishedConfidence(firstParty, "street", true, now) > publishedConfidence(firstParty, "street", false, now));
    const stale = parsed({ source: { published_at: "2026-06-01T00:00:00Z" } });
    assert.ok(publishedConfidence(stale, "street", false, now) < publishedConfidence(firstParty, "street", false, now));

    const row = buildEvidenceRow({ candidate: firstParty, type: "active_opening", latitude: -6.25, longitude: 106.84,
        precision: "street", tier: "zone", confidence: 0.8, runId, sector: null });
    assert.equal(row.validation_status, "accepted");
    assert.equal(row.is_sample, false);
    assert.equal(row.entity_name, "Example Indonesia");
    // Provenance only; page excerpts are not stored.
    assert.equal(JSON.stringify(row.source).includes("Example is hiring."), false);
});

test("locality never promotes a city-level address into the zone", () => {
    const base = { statedPrecision: "street" as const, geocode: jakarta(-6.25, 106.84, "street"), boundaryTier: "zone" as LocalityTier, cityName: "Jakarta Selatan", zoneRegion: null };
    assert.deepEqual(resolveLocality(base), { precision: "street", tier: "zone" });
    assert.deepEqual(resolveLocality({ ...base, statedPrecision: "city" }), { precision: "city", tier: "city" });
    assert.deepEqual(resolveLocality({ ...base, statedPrecision: "unknown", geocode: jakarta(-6.25, 106.84, "district") }), { precision: "district", tier: "zone" });
    assert.deepEqual(resolveLocality({ ...base, statedPrecision: "unknown", geocode: jakarta(-6.25, 106.84, "unknown") }), { reason: "imprecise_location" });
    assert.deepEqual(resolveLocality({ ...base, geocode: { ...base.geocode, countryCode: "sg" } }), { reason: "outside_indonesia" });
    // A city-only fallback query caps precision, so a building claim can't land in the zone through it.
    assert.deepEqual(resolveLocality({ ...base, statedPrecision: "building", geocode: jakarta(-6.25, 106.84, "city"), capPrecision: "city" }), { precision: "city", tier: "city" });
    // A posting placed by its company's office is at most district-level.
    assert.deepEqual(resolveLocality({ ...base, statedPrecision: "building", geocode: jakarta(-6.25, 106.84, "building"), capPrecision: "district" }), { precision: "district", tier: "zone" });

    // Without a covering boundary, fall back to the geocoder's own place names; Jakarta
    // results carry the province only as an ISO 3166-2 code.
    const fallback = { ...base, boundaryTier: null, zoneRegion: "ID-JK" };
    assert.equal((resolveLocality({ ...fallback, geocode: { ...base.geocode, placeNames: ["Kota Administrasi Jakarta Selatan"] } }) as { tier: string }).tier, "city");
    assert.equal((resolveLocality({ ...fallback, geocode: { ...base.geocode, placeNames: ["Jakarta Timur"] } }) as { tier: string }).tier, "region");
    assert.equal((resolveLocality({ ...fallback, geocode: { ...base.geocode, placeNames: ["Bandung"], state: "Jawa Barat", provinceCode: "ID-JB" } }) as { tier: string }).tier, "national");
});

function stored(type: EvidenceType, tier: LocalityTier, entity: string, value: unknown, extra: Partial<StoredEvidence> = {}): StoredEvidence {
    return {
        evidence_type: type, entity_name: entity, value, canonical_url: `https://${entity.toLowerCase().replace(/\s+/g, "")}.test/page`,
        latitude: -6.25, longitude: 106.84, locality_tier: tier, confidence: 0.7,
        retrieved_at: "2026-09-27T00:00:00Z", refresh_after: "2026-10-18T00:00:00Z", expires_at: "2026-10-27T00:00:00Z", ...extra,
    };
}

test("career snapshots count zone evidence only and gate employment on three contributors", () => {
    const headcount = (entity: string) => stored("local_employment", "zone", entity, { minimum: 10, maximum: 20, basis: "range" });
    const evidence = {
        office_presence: [stored("office_presence", "zone", "Org A", "Pancoran"), stored("office_presence", "city", "Org B", "Tebet")],
        active_opening: [stored("active_opening", "zone", "Org A", { title: "Engineer" })],
        local_employment: [headcount("Org A"), headcount("Org C")],
        salary_observation: [stored("salary_observation", "zone", "Org A", { minimum: 8_000_000, maximum: 12_000_000, currency: "IDR", period: "month" })],
    };
    const minimums = { office_presence: 15, active_opening: 25, salary_observation: 5, local_employment: 25 };
    const draft = buildSnapshot({ scope: "career", cityName: "Jakarta Selatan", evidence, minimums, now }) as SnapshotDraft;
    assert.equal(draft.snapshot.observed_office_count, 1);
    assert.equal(draft.snapshot.opening_count, 1);
    assert.deepEqual(draft.snapshot.estimated_employment, { status: "unavailable" });
    assert.deepEqual(draft.snapshot.salary_idr, { minimum: 8_000_000, maximum: 12_000_000, status: "observed" });
    assert.equal(draft.coverage, "partial");
    // Counts are never stated as exact totals.
    assert.ok((draft.snapshot.limitations as string[]).includes("approx. 1 more observation found elsewhere in or beyond Jakarta Selatan is not counted for this zone."));
    assert.equal(draft.refreshAfter, "2026-10-18T00:00:00.000Z");

    const three = buildSnapshot({ scope: "career", cityName: "Jakarta Selatan", now, minimums,
        evidence: { ...evidence, local_employment: [...evidence.local_employment, headcount("Org D")] } }) as SnapshotDraft;
    assert.deepEqual(three.snapshot.estimated_employment, { minimum: 30, maximum: 60, status: "estimated", method_version: "local-headcount-v1" });
    assert.ok(three.contributorCount >= 3);

    assert.equal(buildSnapshot({ scope: "housing", cityName: "Jakarta Selatan", evidence: {}, minimums: {}, now }), null);
    assert.equal(isPublicSnapshot({ opening_count: 1, companies: ["Org A"] }), false);
    assert.equal(isPublicSnapshot({ monthly_rent_idr: { status: "unavailable", minimum: 1 } }), false);
});

test("the geocoder is cache-first, bounded per run, and biased to the zone", async () => {
    const entries = new Map<string, GeocodeResult | null>();
    const cache: GeocodeCache = {
        async get(hash) { return entries.has(hash) ? { result: entries.get(hash) ?? null } : null; },
        async put(hash, _query, result) { entries.set(hash, result); },
    };
    const urls: string[] = [];
    const agents: (string | null)[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
        urls.push(String(input));
        agents.push(new Headers(init?.headers).get("user-agent"));
        return String(input).includes("nowhere")
            ? Response.json([])
            : Response.json([{ lat: "-6.25", lon: "106.84", addresstype: "road",
                address: { city: "Jakarta Selatan", state: "Daerah Khusus Ibukota Jakarta", country_code: "id" } }]);
    }) as typeof fetch;
    const geocoder = createNominatimGeocoder({ userAgent: "Jejak-test/1.0 (test@example.test)", cache, fetchImpl,
        spacingMs: 0, maxLookups: 2, viewbox: [106.8, -6.3, 106.9, -6.2] });

    const first = await geocoder.geocode("Jl. Pancoran Raya 1");
    assert.equal(first?.precision, "street");
    assert.equal(first?.placeNames[0], "Jakarta Selatan");
    assert.equal(await geocoder.geocode("  jl.   Pancoran Raya 1 "), first);
    assert.equal(await geocoder.geocode("nowhere at all"), null);
    assert.equal(urls.length, 2);
    assert.match(urls[0], /viewbox=106.8%2C-6.3%2C106.9%2C-6.2/);
    assert.equal(agents[0], "Jejak-test/1.0 (test@example.test)");
    await assert.rejects(geocoder.geocode("third new address"), GeocodeBudgetError);

    // A later run reuses cached hits and misses without calling the provider.
    const again = createNominatimGeocoder({ userAgent: "ua", cache, fetchImpl, spacingMs: 0, maxLookups: 0, viewbox: [106.8, -6.3, 106.9, -6.2] });
    assert.equal((await again.geocode("Jl. Pancoran Raya 1"))?.latitude, -6.25);
    assert.equal(await again.geocode("nowhere at all"), null);

    const limited = createNominatimGeocoder({ userAgent: "ua", cache, spacingMs: 0,
        fetchImpl: (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch });
    await assert.rejects(limited.geocode("rate limited"), GeocoderUnavailableError);
});

const runs = [{ id: 11, evidenceType: "active_opening" as const, sourceBudget: 3 }, { id: 12, evidenceType: "office_presence" as const, sourceBudget: 3 }];

type Call = { stage?: string[]; upsert?: [number, EvidenceRow[]]; publish?: SnapshotDraft; complete?: [number, RunStatus, Record<string, unknown>, string | null] };

function careerJob(runs: EnrichmentJob["runs"]): EnrichmentJob {
    return {
        jobId: runId,
        requestedAt: now.toISOString(),
        scope: "career",
        sectorId: sector,
        zone: { regionId: 7, code: "pancoran", name: "Pancoran", cityName: "Jakarta Selatan", boundingBox: [106.82, -6.27, 106.86, -6.22] },
        runs,
        scopeTypes: scopeEvidenceTypes.career.map((evidenceType) => ({
            evidenceType, scopeHash: evidenceScope(evidenceType, sector).scopeHash,
            minimumRequiredCount: evidenceType === "salary_observation" ? 5 : evidenceType === "office_presence" ? 15 : 25,
        })),
    };
}

function fakeDeps(options: {
    flows: Record<string, (input: unknown) => unknown>;
    places: Record<string, GeocodeResult | null>;
    tiers: (LocalityTier | null)[];
}) {
    const calls: Call[] = [];
    const flowInputs: Record<string, unknown> = {};
    const saved = new Map<EvidenceType, EvidenceRow[]>();
    const deps: EnrichmentDeps = {
        now: () => now,
        async runFlow(flowId, input) {
            flowInputs[flowId] = input;
            const handler = options.flows[flowId];
            if (!handler) throw new Error(`unexpected flow ${flowId}`);
            return handler(input);
        },
        geocoder: {
            // Unknown queries are simply not found, as several address variants may be tried.
            async geocode(query) {
                return options.places[query] ?? null;
            },
        },
        db: {
            async markRunStage(_ids, stage) { calls.push({ stage: [stage] }); },
            async classifyPoints(_region, points) { return new Map(points.map((point) => [point.point_index, options.tiers[point.point_index] ?? null])); },
            // Accepted rows become readable evidence for the snapshot step.
            async upsertEvidence(id, rows) {
                calls.push({ upsert: [id, rows] });
                const type = runs.find((run) => run.id === id)!.evidenceType;
                saved.set(type, [...(saved.get(type) ?? []), ...rows]);
                return rows.length;
            },
            async getAcceptedEvidence(_region, evidenceType) {
                return (saved.get(evidenceType) ?? []).map((row) => ({
                    evidence_type: evidenceType, entity_name: row.entity_name, value: row.value, canonical_url: row.canonical_url,
                    latitude: row.latitude, longitude: row.longitude, locality_tier: row.locality_tier, confidence: row.confidence,
                    retrieved_at: row.retrieved_at, refresh_after: "2026-10-01T00:00:00Z", expires_at: "2026-10-03T00:00:00Z",
                }));
            },
            async publishSnapshot(_region, _identity, draft) { calls.push({ publish: draft }); return 99; },
            async completeRun(id, status, output, code) { calls.push({ complete: [id, status, output, code] }); },
        },
    };
    return { deps, calls, flowInputs };
}

test("pipeline accepts located, on-sector claims, publishes a snapshot, and completes each run", async () => {
    const { deps, calls, flowInputs } = fakeDeps({
        flows: {
            [LANGFLOW_FLOWS.lf01]: () => lf01Output([
                candidate({ id: "ev-1" }),
                candidate({ id: "ev-2", claim: { claim_type: "office_location", normalized_value: "Menara Example" },
                    location: { raw_address: "Jl. Sudirman, Jakarta Selatan", building_name: "Menara Example", precision: "building" } }),
                candidate({ id: "ev-3", claim: { normalized_value: { title: "Payments Analyst" } } }),
                candidate({ id: "ev-4", claim: { claim_type: "kos_rent_summary", normalized_value: { area_name: "Pancoran" } } }),
                candidate({ id: "ev-5", claim: { normalized_value: { title: "Remote Engineer" } }, location: { raw_address: "Bandung", precision: "city" } }),
                candidate({ id: "ev-6", claim: { normalized_value: { title: "No address" } }, location: { raw_address: null } }),
                candidate({ id: "ev-7", claim: { claim_type: "salary", normalized_value: "Rp10 juta" } }),
            ]),
            [LANGFLOW_FLOWS.lf02]: () => ({
                contract_version: "lf02-v2", run_id: runId, resolved_candidates: [], writes_performed: false, status: "partial",
                unresolved_candidates: [
                    { evidence_id: "ev-1", classification: { sector: { label: sector, method: "exact_taxonomy", confidence: 1 } } },
                    { evidence_id: "ev-3", classification: { sector: { label: "financial_technology", method: "jev_choice", confidence: 0.9 } } },
                ],
            }),
        },
        places: {
            "Jl. Pancoran Raya 1": jakarta(-6.25, 106.84, "street"),
            "Menara Example, Jl. Sudirman, Jakarta Selatan": jakarta(-6.21, 106.82, "building"),
            "Bandung": { latitude: -6.91, longitude: 107.61, precision: "city", countryCode: "id", placeNames: ["Bandung"], state: "Jawa Barat" },
            "Pancoran, Jakarta Selatan": jakarta(-6.25, 106.84, "district"),
        },
        tiers: ["zone", "city", null],
    });

    const outcome = await runEnrichment(deps, careerJob(runs));
    assert.equal(outcome.status, "completed");
    // The posting with no address (ev-6) borrows Example Indonesia's office.
    assert.deepEqual(outcome.accepted, { active_opening: 3, office_presence: 1 });
    assert.deepEqual(outcome.rejected, { rent_summary_not_ingested: 1, not_requested: 1, sector_mismatch: 1 });
    assert.equal(outcome.snapshotId, 99);

    const lf01Input = flowInputs[LANGFLOW_FLOWS.lf01] as Record<string, unknown>;
    assert.deepEqual(lf01Input.missing_evidence, ["active_openings", "company_presence"]);
    assert.equal(lf01Input.maximum_sources, 6);
    assert.equal(lf01Input.run_id, runId);
    assert.deepEqual(lf01Input.target_sectors, [sector]);
    assert.deepEqual(calls.filter((call) => call.stage).map((call) => call.stage![0]), ["lf01", "lf02", "geocoding", "ingesting"]);

    const openings = calls.find((call) => call.upsert?.[0] === 11)!.upsert![1];
    // The Bandung posting keeps its own city: it never borrows the Jakarta office.
    assert.deepEqual(openings.map((row) => [row.locality_tier, row.geographic_precision, row.source.location_basis]), [
        ["zone", "street", "stated_address"], ["national", "city", "stated_address"], ["city", "district", "company_office"],
    ]);
    const snapshot = calls.find((call) => call.publish)!.publish!;
    assert.equal(snapshot.snapshot.opening_count, 1);
    assert.equal(snapshot.snapshot.observed_office_count, 0);
    assert.equal(isPublicSnapshot(snapshot.snapshot), true);

    const completions = calls.filter((call) => call.complete).map((call) => call.complete!);
    assert.deepEqual(completions.map(([id, status, , code]) => [id, status, code]), [[11, "completed", null], [12, "completed", null]]);
    assert.equal(completions[0][2].accepted, 3);
    assert.equal(completions[0][2].lf02_status, "classified");
});

test("an LF-01 failure fails every run and publishes nothing", async () => {
    const { deps, calls } = fakeDeps({
        flows: { [LANGFLOW_FLOWS.lf01]: () => { throw new LangflowError("timeout", "slow"); } },
        places: {},
        tiers: [],
    });
    const outcome = await runEnrichment(deps, careerJob(runs));
    assert.equal(outcome.status, "failed");
    assert.equal(outcome.errorCode, "langflow_timeout");
    assert.equal(calls.some((call) => call.upsert || call.publish), false);
    assert.deepEqual(calls.filter((call) => call.complete).map((call) => call.complete!.slice(0, 2)), [[11, "failed"], [12, "failed"]]);
});

test("LF-02 failures and incomplete LF-01 coverage keep accepted evidence but mark runs partial", async () => {
    const { deps, calls } = fakeDeps({
        flows: {
            [LANGFLOW_FLOWS.lf01]: () => lf01Output([candidate()], { status: "partial", incomplete_evidence_categories: ["company_presence"] }),
            [LANGFLOW_FLOWS.lf02]: () => { throw new LangflowError("unreachable", "down"); },
        },
        places: { "Jl. Pancoran Raya 1": jakarta(-6.25, 106.84, "street") },
        tiers: ["zone"],
    });
    const outcome = await runEnrichment(deps, careerJob(runs));
    assert.equal(outcome.status, "partial");
    assert.deepEqual(outcome.accepted, { active_opening: 1, office_presence: 0 });
    const completions = calls.filter((call) => call.complete).map((call) => call.complete!);
    assert.deepEqual(completions.map(([id, status]) => [id, status]), [[11, "partial"], [12, "partial"]]);
    assert.equal(completions[0][2].lf02_status, "failed:langflow_unreachable");
});

test("noisy Indonesian office addresses get the query forms that resolved live", () => {
    const queries = (building: string | null, address: string | null) => addressQueries(building, address).map(({ query, cap }) => `${query} [${cap ?? "-"}]`);
    assert.deepEqual(queries("Menara Caraka", "Menara Caraka Lantai 12B, JI. Mega Kuningan Barat Blok E.4.7 No.1 RT.5/RW.2, Kawasan Mega Kuningan, Kelurahan Kuningan Timur, Kecamatan Setiabudi, Jakarta Selatan 12950"), [
        "Menara Caraka, Jakarta Selatan [-]",
        "Kuningan Timur, Setiabudi, Jakarta Selatan [neighborhood]",
        "Setiabudi, Jakarta Selatan [district]",
        "Jalan Mega Kuningan Barat, Jakarta Selatan [street]",
        "Mega Kuningan, Jakarta Selatan [neighborhood]",
        "Menara Caraka, JI. Mega Kuningan Barat, Mega Kuningan, Kuningan Timur, Setiabudi, Jakarta Selatan [-]",
        "Jakarta Selatan [city]",
    ]);
    assert.deepEqual(queries("Satrio Tower", "Satrio Tower Floor 26 Unit C-D Jl. Prof. Dr. Satrio Kav. C4 - Mega Kuningan Jakarta - 12950"), [
        "Satrio Tower, Jakarta [-]",
        "Jalan Prof. Dr. Satrio, Jakarta [street]",
        "Satrio Tower Jl. Prof. Dr. Satrio, Mega Kuningan Jakarta [-]",
        "Jakarta [city]",
    ]);
    assert.equal(queries("District 8", "District 8 Lantai 38, SCBD, Jalan Senopati RT.000 RW.000 Senayan Kebayoran Baru Jakarta Selatan")[0], "District 8, Jakarta Selatan [-]");
    assert.equal(queries("Gedung ILP Centre", "Gedung ILP Centre L4-00B Jl. Raya Pasar Minggu No.39A Jakarta Selatan 12780")[1], "Jalan Raya Pasar Minggu, Jakarta Selatan [street]");
    assert.deepEqual(queries(null, "Jakarta Selatan"), ["Jakarta Selatan [-]"]);
    assert.deepEqual(queries(null, null), []);
});

test("pipeline falls back to a cleaned address and names non-local headcounts", async () => {
    const office = candidate({ id: "ev-office", claim: { claim_type: "office_location", normalized_value: "Satrio Tower" },
        location: { raw_address: "Satrio Tower Floor 26 Unit C-D Jl. Prof. Dr. Satrio Kav. C4, Kuningan, Setiabudi, Jakarta Selatan", building_name: "Satrio Tower", precision: "building" } });
    const headcount = candidate({ id: "ev-headcount", claim: { claim_type: "headcount", scope: "national", normalized_value: { minimum: 500, maximum: 500, basis: "exact" } },
        location: { raw_address: null, precision: "unknown" } });
    const { deps } = fakeDeps({
        flows: {
            [LANGFLOW_FLOWS.lf01]: () => lf01Output([office, headcount]),
            [LANGFLOW_FLOWS.lf02]: () => ({ contract_version: "lf02-v2", run_id: runId, resolved_candidates: [], unresolved_candidates: [], writes_performed: false }),
        },
        places: {
            "Satrio Tower, Jakarta Selatan": null,
            "Jalan Prof. Dr. Satrio, Jakarta Selatan": jakarta(-6.224, 106.826, "street"),
        },
        tiers: ["city"],
    });
    const outcome = await runEnrichment(deps, careerJob(runs));
    assert.deepEqual(outcome.accepted, { active_opening: 0, office_presence: 1 });
    assert.deepEqual(outcome.rejected, { non_local_headcount: 1 });
});

test("postings without a precise location borrow their company's office at district precision", async () => {
    const posting = (id: string, company: string, address: string | null) => candidate({
        id, subject: { raw_name: company, registered_domain: null },
        source: { canonical_url: `https://glints.com/id/opportunities/jobs/${id}/0f0e0d0c-1111-4222-8333-444455556666` },
        claim: { normalized_value: { title: `Engineer ${id}`, work_arrangement: "unspecified" } },
        location: { raw_address: address, precision: address ? "city" : "unknown" },
    });
    const office = (id: string, company: string, building: string | null, address: string) => candidate({
        id, subject: { raw_name: company, registered_domain: null },
        source: { canonical_url: `https://${id}.example.co.id/contact` },
        claim: { claim_type: "office_location", normalized_value: address },
        location: { raw_address: address, building_name: building, precision: building ? "building" : "street" },
    });
    let officeRequest: Record<string, unknown> | null = null;
    const { deps, calls } = fakeDeps({
        flows: {
            [LANGFLOW_FLOWS.lf01]: (input) => {
                const request = input as Record<string, unknown>;
                if (request.company_names) {
                    officeRequest = request;
                    return { ...lf01Output([{ ...office("beta-office", "PT Beta Digital Indonesia", null, "Jl. Pancoran Raya 1, Jakarta Selatan"), run_id: `${runId}-offices` }]), run_id: `${runId}-offices` };
                }
                return lf01Output([
                    posting("alpha-job", "Alpha Teknologi", "Jakarta Selatan"),
                    office("alpha-office", "PT. Alpha Teknologi", "Menara Caraka", "Menara Caraka Lantai 12B, Kelurahan Kuningan Timur, Jakarta Selatan"),
                    posting("beta-job", "Beta Digital", null),
                ]);
            },
            [LANGFLOW_FLOWS.lf02]: () => ({ contract_version: "lf02-v2", run_id: runId, resolved_candidates: [], unresolved_candidates: [], writes_performed: false }),
        },
        places: {
            "Menara Caraka, Jakarta Selatan": jakarta(-6.226, 106.825, "building"),
            "Jalan Pancoran Raya 1, Jakarta Selatan": jakarta(-6.25, 106.84, "street"),
        },
        tiers: ["zone", "city", "zone", "zone"],
    });

    const outcome = await runEnrichment(deps, careerJob(runs));
    // Only the company with no office in the first pass is looked up.
    assert.deepEqual((officeRequest as Record<string, unknown> | null)?.company_names, ["Beta Digital"]);
    assert.deepEqual((officeRequest as Record<string, unknown> | null)?.missing_evidence, ["company_presence"]);
    assert.deepEqual(outcome.accepted, { active_opening: 2, office_presence: 2 });

    const postings = calls.find((call) => call.upsert?.[0] === 11)!.upsert![1];
    assert.deepEqual(postings.map((row) => [row.entity_name, row.geographic_precision, row.source.location_basis]), [
        ["Alpha Teknologi", "district", "company_office"],
        ["Beta Digital", "district", "company_office"],
    ]);
    assert.equal(postings[1].source.office_source_url, "https://beta-office.example.co.id/contact");
    const offices = calls.find((call) => call.upsert?.[0] === 12)!.upsert![1];
    assert.deepEqual(offices.map((row) => [row.entity_name, row.geographic_precision, row.source.location_basis]), [
        ["PT. Alpha Teknologi", "building", "stated_address"],
        ["PT Beta Digital Indonesia", "street", "stated_address"],
    ]);
    const report = calls.find((call) => call.complete)!.complete![2];
    assert.deepEqual(report.company_lookup, { companies: 1, status: "ok", offices_found: 1 });
});

test("evidence clusters pivot per district with approximate labels, never exact totals", () => {
    assert.equal(approxEvidenceLabel("active_opening", 1), "sekitar 1 lowongan");
    assert.equal(approxEvidenceLabel("office_presence", 3), "sekitar 3 kantor");
    const point = (lng: number, lat: number) => ({ type: "Point" as const, coordinates: [lng, lat] as [number, number] });
    const clusters = toEvidenceClusters([
        { region_code: "setiabudi", region_name: "Setiabudi", centroid: point(106.83, -6.22), evidence_type: "active_opening", evidence_count: 1, organization_count: 1, latest_retrieved_at: "2026-09-28T08:00:00Z" },
        { region_code: "setiabudi", region_name: "Setiabudi", centroid: point(106.83, -6.22), evidence_type: "office_presence", evidence_count: 3, organization_count: 3, latest_retrieved_at: "2026-09-28T09:00:00Z" },
        { region_code: "pancoran", region_name: "Pancoran", centroid: null, evidence_type: "office_presence", evidence_count: 2, organization_count: 2, latest_retrieved_at: null },
    ], scopeEvidenceTypes.career);
    assert.equal(clusters.length, 1, "a district without a centroid can't be drawn");
    assert.deepEqual(clusters[0].centroid, [106.83, -6.22]);
    assert.deepEqual(clusters[0].labels, ["sekitar 3 kantor", "sekitar 1 lowongan"]);
    assert.deepEqual(clusters[0].counts.office_presence, { count: 3, organizations: 3 });
    assert.equal(clusters[0].latest_retrieved_at, "2026-09-28T09:00:00Z");
});

test("located offices become the district's company count instead of a separate metric", () => {
    const stored = [
        { metric: "company_count", value: 3100, unit: "companies", source: "Sample registry", period_end: "2025-12-31",
            evidence_type: "observed" as const, limitations: null, is_sample: true },
        { metric: "employment_rate", value: 0.7, unit: "ratio", source: "Sample survey", period_end: "2025-12-31",
            evidence_type: "observed" as const, limitations: null, is_sample: true },
    ];
    const cluster = { zone_id: "setiabudi", zone_name: "Setiabudi", centroid: [106.83, -6.22] as [number, number],
        counts: { office_presence: { count: 3, organizations: 2 } }, labels: ["sekitar 3 kantor"], latest_retrieved_at: "2026-09-28T08:09:44Z" };

    const merged = mergeLocatedEvidence(stored, cluster);
    assert.equal(merged.length, 2);
    const companies = merged.find((fact) => fact.metric === "company_count");
    assert.equal(companies?.value, 2);
    assert.equal(companies?.approximate, true);
    assert.equal(companies?.is_sample, false);
    assert.equal(companies?.period_end, "2026-09-28");
    assert.equal(merged.find((fact) => fact.metric === "employment_rate")?.value, 0.7);

    // No located offices: the stored fact stays.
    assert.equal(mergeLocatedEvidence(stored, undefined), stored);
    assert.equal(mergeLocatedEvidence(stored, { ...cluster, counts: { active_opening: { count: 1, organizations: 1 } } }), stored);
});
