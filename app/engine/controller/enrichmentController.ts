import { createAdminClient, isAdminConfigured } from "../lib/admin";
import { isLangflowConfigured, runFlow } from "../lib/langflow";
import { getZoneBoundary } from "../lib/zoneBoundary";
import { getGeometryBounds } from "../lib/zoneGeometry";
import { createNominatimGeocoder, type GeocodeCache, type GeocodeResult } from "../enrichment/geocoder";
import type { LocalityTier } from "../enrichment/locality";
import { runEnrichment, type ClaimedRun, type EnrichmentDb, type EnrichmentJob, type EnrichmentOutcome, type ScopeType } from "../enrichment/pipeline";
import { evidenceScope, scopeEvidenceTypes, snapshotScope, type EnrichmentScope, type EvidenceType } from "../enrichment/scopes";
import type { StoredEvidence } from "../enrichment/snapshot";
import { getZoneRow, supportedSector, toZone } from "./zoneController";

export type EnrichmentErrorCode = "UNKNOWN_ZONE" | "BOUNDARY_REQUIRED";

export class EnrichmentRequestError extends Error {
    code: EnrichmentErrorCode;

    constructor(code: EnrichmentErrorCode, message: string) {
        super(message);
        this.name = "EnrichmentRequestError";
        this.code = code;
    }
}

const GEOCODE_FOUND_DAYS = 90;
const GEOCODE_MISS_DAYS = 7;
// Degrees added around the zone for the geocoder's preferred area (about 5 km).
const VIEWBOX_MARGIN = 0.05;

export function isEnrichmentConfigured(): boolean {
    return isLangflowConfigured() && isAdminConfigured() && !!process.env.JEJAK_GEOCODER_USER_AGENT?.trim();
}

type ClaimRow = {
    status: string;
    run_id: number | null;
    minimum_required_count: number;
    source_budget: number;
    call_lf01: boolean;
    retry_at: string | null;
};

export type ClaimSummary = { evidence_type: EvidenceType; status: string; run_id: string | null; retry_at: string | null };

async function getRegion(zoneId: string) {
    const { data, error } = await createAdminClient().from("regions").select("id").eq("code", zoneId).maybeSingle();
    if (error) throw error;
    return data as { id: number } | null;
}

// Claims one enrichment run per evidence type that needs one. The returned job
// is null when every type is cached, already running, or cooling down.
export async function requestZoneEnrichment(zoneId: string, scope: EnrichmentScope): Promise<{ job: EnrichmentJob | null; claims: ClaimSummary[] }> {
    const row = await getZoneRow(zoneId);
    if (!row) throw new EnrichmentRequestError("UNKNOWN_ZONE", "Unknown region");
    // Locality tiers come from the stored district boundary, not the fallback service.
    if (row.geometry === null) throw new EnrichmentRequestError("BOUNDARY_REQUIRED", "Evidence enrichment needs a stored boundary for this region");
    const region = await getRegion(zoneId);
    if (!region) throw new EnrichmentRequestError("UNKNOWN_ZONE", "Unknown region");

    const bounds = getGeometryBounds(await getZoneBoundary(row));
    const zone = toZone(row);
    const admin = createAdminClient();
    const runs: ClaimedRun[] = [];
    const scopeTypes: ScopeType[] = [];
    const claims: ClaimSummary[] = [];
    const internalRunIds: (number | null)[] = [];

    for (const evidenceType of scopeEvidenceTypes[scope]) {
        const { scopeKey, scopeHash } = evidenceScope(evidenceType, supportedSector);
        const { data, error } = await admin.rpc("check_and_claim_zone_enrichment", {
            p_region_id: region.id, p_evidence_type: evidenceType, p_scope_key: scopeKey, p_scope_hash: scopeHash,
        });
        if (error) throw error;
        const claim = (data as ClaimRow[])[0];
        scopeTypes.push({ evidenceType, scopeHash, minimumRequiredCount: claim.minimum_required_count });
        if (claim.call_lf01 && claim.run_id !== null) runs.push({ id: claim.run_id, evidenceType, sourceBudget: claim.source_budget });
        claims.push({ evidence_type: evidenceType, status: claim.status, run_id: null, retry_at: claim.retry_at });
        internalRunIds.push(claim.run_id);
    }

    // Callers only ever see the external UUID of a run.
    const internalIds = internalRunIds.filter((id): id is number => id !== null);
    if (internalIds.length) {
        const { data, error } = await admin.from("enrichment_runs").select("id, external_run_id").in("id", internalIds);
        if (error) throw error;
        const external = new Map((data as { id: number; external_run_id: string }[]).map((run) => [run.id, run.external_run_id]));
        claims.forEach((claim, index) => {
            const id = internalRunIds[index];
            claim.run_id = id === null ? null : external.get(id) ?? null;
        });
    }

    const job: EnrichmentJob | null = runs.length ? {
        jobId: crypto.randomUUID(),
        requestedAt: new Date().toISOString(),
        scope,
        sectorId: supportedSector,
        zone: {
            regionId: region.id, code: zone.zone_id, name: zone.zone_name, cityName: zone.city_name,
            boundingBox: bounds ? [bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]] : null,
        },
        runs,
        scopeTypes,
    } : null;
    return { job, claims };
}

function createGeocodeCache(admin: ReturnType<typeof createAdminClient>): GeocodeCache {
    return {
        async get(queryHash) {
            const { data, error } = await admin.from("geocode_cache").select("status, result")
                .eq("query_hash", queryHash).gt("expires_at", new Date().toISOString()).maybeSingle();
            if (error) throw error;
            if (!data) return null;
            return { result: data.status === "found" ? data.result as GeocodeResult : null };
        },
        async put(queryHash, query, result) {
            const days = result ? GEOCODE_FOUND_DAYS : GEOCODE_MISS_DAYS;
            const { error } = await admin.from("geocode_cache").upsert({
                query_hash: queryHash, query: query.slice(0, 500), provider: "nominatim",
                status: result ? "found" : "not_found", result, fetched_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
            });
            if (error) throw error;
        },
    };
}

function createEnrichmentDb(admin: ReturnType<typeof createAdminClient>): EnrichmentDb {
    return {
        async markRunStage(runIds, stage) {
            const { error } = await admin.from("enrichment_runs")
                .update({ status: "running", stage, ...(stage === "lf01" ? { started_at: new Date().toISOString() } : {}) })
                .in("id", runIds).in("status", ["queued", "running"]);
            if (error) throw error;
        },
        async classifyPoints(regionId, points) {
            const { data, error } = await admin.rpc("classify_evidence_points", { p_region_id: regionId, p_points: points });
            if (error) throw error;
            return new Map((data as { point_index: number; locality_tier: LocalityTier | null }[])
                .map((row) => [row.point_index, row.locality_tier]));
        },
        async upsertEvidence(runId, rows) {
            const { data, error } = await admin.rpc("upsert_zone_evidence", { p_run_id: runId, p_candidates: rows });
            if (error) throw error;
            return Number(data);
        },
        async getAcceptedEvidence(regionId, evidenceType, scopeHash) {
            const { data, error } = await admin.rpc("get_zone_evidence", {
                p_region_id: regionId, p_evidence_type: evidenceType, p_scope_hash: scopeHash, p_limit: 25,
            });
            if (error) throw error;
            return data as StoredEvidence[];
        },
        async publishSnapshot(regionId, identity, draft) {
            const { data, error } = await admin.from("region_snapshots").insert({
                region_id: regionId,
                snapshot_type: identity.snapshotType,
                scope_key: identity.scopeKey,
                scope_hash: identity.scopeHash,
                snapshot: draft.snapshot,
                evidence_count: draft.evidenceCount,
                contributor_count: draft.contributorCount,
                coverage: draft.coverage,
                confidence: draft.confidence,
                generated_at: draft.generatedAt,
                refresh_after: draft.refreshAfter,
                expires_at: draft.expiresAt,
                status: "draft",
            }).select("id").single();
            if (error) throw error;
            const snapshotId = (data as { id: number }).id;
            const published = await admin.rpc("publish_region_snapshot", { p_snapshot_id: snapshotId });
            if (published.error) throw published.error;
            return snapshotId;
        },
        async completeRun(runId, status, output, errorCode) {
            const { error } = await admin.rpc("complete_enrichment_run", {
                p_run_id: runId, p_status: status, p_output: output, p_error: errorCode,
            });
            if (error) throw error;
        },
    };
}

// Runs after the HTTP response (next/server after()); every failure is recorded
// on the runs themselves, so nothing is thrown back to the caller.
export async function runZoneEnrichment(job: EnrichmentJob): Promise<EnrichmentOutcome> {
    const admin = createAdminClient();
    const box = job.zone.boundingBox;
    return runEnrichment({
        now: () => new Date(),
        runFlow,
        geocoder: createNominatimGeocoder({
            userAgent: process.env.JEJAK_GEOCODER_USER_AGENT!.trim(),
            cache: createGeocodeCache(admin),
            viewbox: box ? [box[0] - VIEWBOX_MARGIN, box[1] - VIEWBOX_MARGIN, box[2] + VIEWBOX_MARGIN, box[3] + VIEWBOX_MARGIN] : null,
        }),
        db: createEnrichmentDb(admin),
    }, job);
}

type RunRow = {
    external_run_id: string;
    evidence_type: string;
    status: string;
    stage: string | null;
    requested_at: string;
    started_at: string | null;
    completed_at: string | null;
    lease_expires_at: string | null;
    next_retry_at: string | null;
    output: Record<string, unknown> | null;
    error: string | null;
};

const runColumns = "external_run_id, evidence_type, status, stage, requested_at, started_at, completed_at, lease_expires_at, next_retry_at, output, error";

// Only aggregate counts and safe codes leave the server; LF-01 output is not echoed.
function publicRun(run: RunRow) {
    const output = run.output ?? {};
    return {
        run_id: run.external_run_id,
        evidence_type: run.evidence_type,
        status: run.status,
        stage: run.stage,
        requested_at: run.requested_at,
        started_at: run.started_at,
        completed_at: run.completed_at,
        retry_at: run.next_retry_at,
        accepted: typeof output.accepted === "number" ? output.accepted : null,
        rejected: output.rejected ?? null,
        incomplete_categories: output.incomplete_categories ?? [],
        snapshot_published: output.snapshot_published === true,
        error_code: run.error,
    };
}

export async function getRunStatus(externalRunId: string) {
    const { data, error } = await createAdminClient().from("enrichment_runs").select(runColumns)
        .eq("external_run_id", externalRunId).maybeSingle();
    if (error) throw error;
    return data ? publicRun(data as RunRow) : null;
}

type SnapshotRow = {
    snapshot: Record<string, unknown>;
    coverage: string;
    confidence: number | null;
    evidence_count: number;
    generated_at: string;
    refresh_after: string | null;
    expires_at: string | null;
    is_stale: boolean;
    is_expired: boolean;
};

// Latest accepted snapshot for the scope plus the state of its refresh runs.
export async function getZoneEvidence(zoneId: string, scope: EnrichmentScope) {
    const region = await getRegion(zoneId);
    if (!region) return null;
    const admin = createAdminClient();
    const identity = snapshotScope(scope, supportedSector);
    const types = scopeEvidenceTypes[scope];

    const [snapshotResult, runsResult] = await Promise.all([
        admin.rpc("get_region_snapshot", { p_region_id: region.id, p_snapshot_type: identity.snapshotType, p_scope_hash: identity.scopeHash }),
        admin.from("enrichment_runs").select(runColumns).eq("region_id", region.id)
            .in("scope_hash", types.map((type) => evidenceScope(type, supportedSector).scopeHash))
            .order("requested_at", { ascending: false }).limit(40),
    ]);
    if (snapshotResult.error) throw snapshotResult.error;
    if (runsResult.error) throw runsResult.error;

    const snapshot = (snapshotResult.data as SnapshotRow[])[0] ?? null;
    const latest = new Map<string, RunRow>();
    for (const run of runsResult.data as RunRow[]) if (!latest.has(run.evidence_type)) latest.set(run.evidence_type, run);
    const runs = [...latest.values()];
    const now = Date.now();
    const active = runs.find((run) => (run.status === "queued" || run.status === "running") &&
        run.lease_expires_at !== null && Date.parse(run.lease_expires_at) > now);
    const cooling = runs.filter((run) => run.next_retry_at !== null && Date.parse(run.next_retry_at) > now)
        .sort((left, right) => Date.parse(left.next_retry_at!) - Date.parse(right.next_retry_at!))[0];

    return {
        zone_id: zoneId,
        scope,
        freshness: !snapshot ? "missing" : snapshot.is_stale ? "stale" : "fresh",
        snapshot: snapshot ? {
            data: snapshot.snapshot,
            coverage: snapshot.coverage,
            confidence: snapshot.confidence === null ? null : Number(snapshot.confidence),
            evidence_count: snapshot.evidence_count,
            generated_at: snapshot.generated_at,
            refresh_after: snapshot.refresh_after,
            expires_at: snapshot.expires_at,
            is_stale: snapshot.is_stale,
            is_expired: snapshot.is_expired,
        } : null,
        refresh: {
            status: active ? active.status : cooling ? "cooldown" : "idle",
            stage: active?.stage ?? null,
            retry_at: active ? null : cooling?.next_retry_at ?? null,
            runs: runs.map(publicRun),
        },
    };
}
