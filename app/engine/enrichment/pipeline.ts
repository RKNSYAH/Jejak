import { LANGFLOW_FLOWS, LangflowError, type RunFlowOptions } from "../lib/langflow";
import { MAX_COMPANY_NAMES, MAX_LF01_SOURCES, validateLF01Input } from "../lib/lf01Validation";
import { ACCEPTANCE_THRESHOLD, agreementKey, buildEvidenceRow, checkClaimValue, publishedConfidence, type EvidenceRow } from "./acceptance";
import { companyKey, needsCompanyOffice, officeForPosting, officesByCompany, officesFor, sameCompany } from "./companies";
import { addressQueries, GeocodeBudgetError, type AddressQuery, type GeocodeResult, type Geocoder } from "./geocoder";
import { parseLF01Output, type LF01Candidate, type Precision } from "./lf01Contract";
import { buildLF02Input, parseLF02Output, type SectorClassification } from "./lf02Contract";
import { coarserPrecision, regionKey, resolveLocality, type LocalityTier } from "./locality";
import { evidenceTypeForClaim, lf01EvidenceByType, snapshotScope, type EnrichmentScope, type EvidenceType } from "./scopes";
import { buildSnapshot, type SnapshotDraft, type StoredEvidence } from "./snapshot";

export type ClaimedRun = { id: number; evidenceType: EvidenceType; sourceBudget: number };
export type ScopeType = { evidenceType: EvidenceType; scopeHash: string; minimumRequiredCount: number };
export type RunStatus = "completed" | "partial" | "failed";

export type EnrichmentJob = {
    // Sent to LF-01 as its run_id; one LF-01 call serves every claimed run.
    jobId: string;
    requestedAt: string;
    scope: EnrichmentScope;
    sectorId: string;
    zone: {
        regionId: number;
        code: string;
        name: string;
        cityName: string;
        boundingBox: [number, number, number, number] | null;
    };
    runs: ClaimedRun[];
    // Every evidence type of the scope, claimed or not, for the snapshot.
    scopeTypes: ScopeType[];
};

export type EnrichmentDb = {
    markRunStage(runIds: number[], stage: string): Promise<void>;
    classifyPoints(regionId: number, points: { point_index: number; latitude: number; longitude: number }[]): Promise<Map<number, LocalityTier | null>>;
    upsertEvidence(runId: number, rows: EvidenceRow[]): Promise<number>;
    getAcceptedEvidence(regionId: number, evidenceType: EvidenceType, scopeHash: string): Promise<StoredEvidence[]>;
    publishSnapshot(regionId: number, identity: { snapshotType: string; scopeKey: string; scopeHash: string }, draft: SnapshotDraft): Promise<number>;
    completeRun(runId: number, status: RunStatus, output: Record<string, unknown>, errorCode: string | null): Promise<void>;
};

export type EnrichmentDeps = {
    now(): Date;
    runFlow(flowId: string, input: unknown, options: RunFlowOptions): Promise<unknown>;
    geocoder: Geocoder;
    db: EnrichmentDb;
};

export type EnrichmentOutcome = {
    status: RunStatus;
    accepted: Partial<Record<EvidenceType, number>>;
    rejected: Record<string, number>;
    snapshotId: number | null;
    errorCode: string | null;
};

const LF02_SECTOR_CONFIDENCE = 0.8;
// Postings (and their pay) can borrow their company's office location.
const POSTING_TYPES = new Set<EvidenceType>(["active_opening", "salary_observation"]);
// Time guards inside the enrich route's 300 s limit: the company-office pass only
// starts early enough to finish, and geocoding stops before completion is at risk.
const COMPANY_PASS_BEFORE_MS = 150_000;
const GEOCODE_UNTIL_MS = 270_000;

type LocationPlan = {
    queries: AddressQuery[];
    statedPrecision: Precision;
    // Finest precision the plan may claim: a company office places a posting at district level.
    cap: Precision | null;
    basis: "stated_address" | "company_office";
    officeSourceUrl: string | null;
};

function errorCode(error: unknown): string {
    if (error instanceof LangflowError) return `langflow_${error.code}`;
    if (error instanceof Error && /^INVALID_LF0\d_OUTPUT$/.test(error.message)) return error.message.toLowerCase();
    return "internal_error";
}

// LF-01 → LF-02 and a company-office LF-01 pass (both best effort) → geocoding →
// boundary tiers → acceptance →
// evidence upsert → snapshot publication → run completion. The database stays
// the authority for claims, leases, and publication; failures keep the
// previous accepted snapshot.
export async function runEnrichment(deps: EnrichmentDeps, job: EnrichmentJob): Promise<EnrichmentOutcome> {
    const { db, geocoder } = deps;
    const runIds = job.runs.map((run) => run.id);
    const requested = new Set(job.runs.map((run) => run.evidenceType));
    const accepted: EnrichmentOutcome["accepted"] = {};
    const rejected: Record<string, number> = {};
    const completed = new Set<number>();
    const reject = (reason: string) => { rejected[reason] = (rejected[reason] ?? 0) + 1; };
    const report: Record<string, unknown> = { lf01_run_id: job.jobId };
    const startedAt = deps.now().getTime();

    async function complete(runId: number, status: RunStatus, output: Record<string, unknown>, code: string | null) {
        try {
            await db.completeRun(runId, status, output, code);
        } catch {
            // An expired lease already failed this run; nothing more to record.
        }
        completed.add(runId);
    }

    // Shared by the main LF-01 run and the company-office pass.
    const zoneInput = {
        zone_id: job.zone.code,
        zone_name: job.zone.name,
        city_name: job.zone.cityName,
        requested_at: job.requestedAt,
        ...(job.zone.boundingBox ? { bounding_box: job.zone.boundingBox } : {}),
    };

    try {
        await db.markRunStage(runIds, "lf01");
        const lf01Input = validateLF01Input({
            ...zoneInput,
            run_id: job.jobId,
            missing_evidence: [...new Set(job.runs.map((run) => lf01EvidenceByType[run.evidenceType]))],
            maximum_sources: Math.min(MAX_LF01_SOURCES, Math.max(1, job.runs.reduce((sum, run) => sum + run.sourceBudget, 0))),
            ...(job.scope === "career" ? { target_sectors: [job.sectorId] } : {}),
        });
        const lf01 = parseLF01Output(await deps.runFlow(LANGFLOW_FLOWS.lf01, lf01Input, {
            timeoutMs: 180_000, maxBytes: 2_000_000, contract: "lf01-v2", sessionId: job.jobId,
        }), job.jobId);
        Object.assign(report, {
            lf01_status: lf01.status, pages_retrieved: lf01.pagesRetrieved, sources_monitored: lf01.sourcesMonitored,
            incomplete_categories: lf01.incompleteCategories, lf01_errors: lf01.errors.slice(0, 10),
        });
        lf01.skipped.forEach(({ reason }) => reject(`lf01_${reason}`));

        const pending: { candidate: LF01Candidate; type: EvidenceType }[] = [];
        const admit = (candidate: LF01Candidate) => {
            const type = evidenceTypeForClaim(candidate.claimType, candidate.claimScope);
            if (!type) {
                // A company-wide (national or global) headcount says nothing about local employment.
                reject(candidate.claimType === "headcount" ? "non_local_headcount"
                    : candidate.claimType.endsWith("_rent_summary") ? "rent_summary_not_ingested" : "unsupported_claim");
            }
            else if (!requested.has(type)) reject("not_requested");
            else {
                const problem = checkClaimValue(candidate, type);
                if (problem) reject(problem);
                else pending.push({ candidate, type });
            }
        };
        lf01.candidates.forEach(admit);

        // Postings that can't be placed below city level borrow their company's office.
        // Offices LF-01 already found are reused; the rest get one targeted LF-01 pass.
        const offices = officesByCompany(lf01.candidates);
        const lookups = new Map<string, string>();
        for (const { candidate, type } of pending) {
            if (!POSTING_TYPES.has(type) || !needsCompanyOffice(candidate)) continue;
            const key = companyKey(candidate.subjectName);
            if (key && !officesFor(offices, key).length && lookups.size < MAX_COMPANY_NAMES) lookups.set(key, candidate.subjectName!);
        }

        const runLf02 = job.scope === "career" && pending.length > 0;
        const runOffices = lookups.size > 0 && deps.now().getTime() - startedAt < COMPANY_PASS_BEFORE_MS;
        report.lf02_status = "skipped";
        report.company_lookup = { companies: lookups.size, status: lookups.size ? "skipped_time" : "none", offices_found: 0 };
        if (runLf02 || runOffices) await db.markRunStage(runIds, runLf02 ? "lf02" : "company_offices");

        const officesRunId = `${job.jobId}-offices`;
        const [lf02Result, officesResult] = await Promise.allSettled([
            // LF-02 only adds sector labels here; losing it must not lose the run.
            runLf02
                ? deps.runFlow(LANGFLOW_FLOWS.lf02, buildLF02Input(job.jobId, pending.map((item) => item.candidate)), {
                    timeoutMs: 45_000, maxBytes: 2_000_000, contract: "lf02-v2", sessionId: job.jobId,
                }).then((output) => parseLF02Output(output, job.jobId))
                : Promise.resolve(new Map<string, SectorClassification>()),
            runOffices
                ? deps.runFlow(LANGFLOW_FLOWS.lf01, validateLF01Input({
                    ...zoneInput,
                    run_id: officesRunId,
                    missing_evidence: ["company_presence"],
                    maximum_sources: Math.min(MAX_LF01_SOURCES, lookups.size * 2),
                    company_names: [...lookups.values()],
                }), { timeoutMs: 90_000, maxBytes: 2_000_000, contract: "lf01-v2", sessionId: job.jobId })
                    .then((output) => parseLF01Output(output, officesRunId).candidates)
                : Promise.resolve([] as LF01Candidate[]),
        ]);

        let sectors = new Map<string, SectorClassification>();
        if (runLf02) {
            if (lf02Result.status === "fulfilled") {
                sectors = lf02Result.value;
                report.lf02_status = "classified";
            } else {
                report.lf02_status = `failed:${errorCode(lf02Result.reason)}`;
            }
        }
        const onSector = pending.filter(({ candidate }) => {
            const sector = sectors.get(candidate.evidenceId);
            if (sector && sector.method !== "needs_review" && sector.confidence >= LF02_SECTOR_CONFIDENCE && sector.label !== job.sectorId) {
                reject("sector_mismatch");
                return false;
            }
            return true;
        });
        if (runOffices) {
            if (officesResult.status === "fulfilled") {
                // Only offices of the companies asked about; a contact page may list partners too.
                const asked = [...lookups.keys()];
                const found = officesByCompany(officesResult.value.filter((candidate) => {
                    const key = companyKey(candidate.subjectName);
                    return !!key && asked.some((lookup) => sameCompany(lookup, key));
                }));
                for (const [key, list] of found) offices.set(key, list);
                report.company_lookup = { companies: lookups.size, status: "ok", offices_found: [...found.values()].reduce((sum, list) => sum + list.length, 0) };
                // The offices found are office evidence in their own right.
                const before = pending.length;
                officesResult.value.filter((candidate) => candidate.claimType === "office_location").forEach(admit);
                onSector.push(...pending.slice(before));
            } else {
                report.company_lookup = { companies: lookups.size, status: `failed:${errorCode(officesResult.reason)}`, offices_found: 0 };
            }
        }

        function planLocation(candidate: LF01Candidate, type: EvidenceType): LocationPlan | string {
            if (POSTING_TYPES.has(type) && needsCompanyOffice(candidate)) {
                const key = companyKey(candidate.subjectName);
                const office = key ? officeForPosting(officesFor(offices, key), candidate.rawAddress, job.zone.cityName) : null;
                // A posting placed by its company's office is only a district-level association.
                if (office) {
                    return { queries: addressQueries(office.buildingName, office.rawAddress), statedPrecision: office.precision,
                        cap: "district", basis: "company_office", officeSourceUrl: office.sourceUrl };
                }
                if (!candidate.rawAddress && !candidate.buildingName) return "company_office_not_found";
            }
            const queries = addressQueries(candidate.buildingName, candidate.rawAddress);
            return queries.length
                ? { queries, statedPrecision: candidate.precision, cap: null, basis: "stated_address", officeSourceUrl: null }
                : "missing_address";
        }

        await db.markRunStage(runIds, "geocoding");
        let geocoderStatus = "ok";
        const located: { candidate: LF01Candidate; type: EvidenceType; geocode: GeocodeResult; plan: LocationPlan; cap: Precision | null }[] = [];
        for (const item of onSector) {
            const plan = planLocation(item.candidate, item.type);
            if (typeof plan === "string") {
                reject(plan);
                continue;
            }
            if (geocoderStatus === "ok" && deps.now().getTime() - startedAt > GEOCODE_UNTIL_MS) geocoderStatus = "time_spent";
            if (geocoderStatus !== "ok") {
                reject(`geocoder_${geocoderStatus}`);
                continue;
            }
            try {
                let match: { geocode: GeocodeResult; cap: Precision | null } | null = null;
                for (const { query, cap } of plan.queries) {
                    const geocode = await geocoder.geocode(query);
                    if (geocode) {
                        match = { geocode, cap: cap && plan.cap ? coarserPrecision(cap, plan.cap) : cap ?? plan.cap };
                        break;
                    }
                }
                if (match) located.push({ ...item, ...match, plan });
                else reject(plan.basis === "company_office" ? "office_address_not_found" : "address_not_found");
            } catch (error) {
                geocoderStatus = error instanceof GeocodeBudgetError ? "budget_spent" : "unavailable";
                reject(`geocoder_${geocoderStatus}`);
            }
        }
        report.geocoder_status = geocoderStatus;

        const tiers = located.length
            ? await db.classifyPoints(job.zone.regionId, located.map((item, index) => ({
                point_index: index, latitude: item.geocode.latitude, longitude: item.geocode.longitude,
            })))
            : new Map<number, LocalityTier | null>();
        const pages = new Map<string, Set<string>>();
        for (const { candidate, type } of located) {
            const key = agreementKey(type, candidate.normalizedValue);
            pages.set(key, (pages.get(key) ?? new Set()).add(candidate.canonicalUrl));
        }

        // The zone's own province is only needed when no trusted boundary covers a point.
        let zoneRegion: Promise<string | null> | null = null;
        const rowsByType = new Map<EvidenceType, EvidenceRow[]>();
        for (const [index, { candidate, type, geocode, plan, cap }] of located.entries()) {
            const boundaryTier = tiers.get(index) ?? null;
            if (!boundaryTier && !zoneRegion) {
                zoneRegion = geocoder.geocode(`${job.zone.name}, ${job.zone.cityName}`).then((result) => result ? regionKey(result) : null, () => null);
            }
            const locality = resolveLocality({
                statedPrecision: plan.statedPrecision, geocode, boundaryTier, capPrecision: cap,
                cityName: job.zone.cityName, zoneRegion: boundaryTier ? null : await zoneRegion,
            });
            if ("reason" in locality) {
                reject(locality.reason);
                continue;
            }
            const agreed = (pages.get(agreementKey(type, candidate.normalizedValue))?.size ?? 1) > 1;
            const confidence = publishedConfidence(candidate, locality.precision, agreed, deps.now());
            if (confidence < ACCEPTANCE_THRESHOLD) {
                reject("low_confidence");
                continue;
            }
            const rows = rowsByType.get(type) ?? [];
            rows.push(buildEvidenceRow({
                candidate, type, latitude: geocode.latitude, longitude: geocode.longitude,
                precision: locality.precision, tier: locality.tier, confidence, runId: job.jobId,
                sector: sectors.get(candidate.evidenceId) ?? null,
                locationBasis: plan.basis, officeSourceUrl: plan.officeSourceUrl,
            }));
            rowsByType.set(type, rows);
        }

        await db.markRunStage(runIds, "ingesting");
        for (const run of job.runs) {
            const rows = rowsByType.get(run.evidenceType) ?? [];
            accepted[run.evidenceType] = rows.length ? await db.upsertEvidence(run.id, rows) : 0;
        }

        let snapshotId: number | null = null;
        if (Object.values(accepted).some((count) => count > 0)) {
            const evidence = Object.fromEntries(await Promise.all(job.scopeTypes.map(async (type) =>
                [type.evidenceType, await db.getAcceptedEvidence(job.zone.regionId, type.evidenceType, type.scopeHash)] as const)));
            const draft = buildSnapshot({
                scope: job.scope,
                cityName: job.zone.cityName,
                evidence,
                minimums: Object.fromEntries(job.scopeTypes.map((type) => [type.evidenceType, type.minimumRequiredCount])),
                now: deps.now(),
            });
            if (draft) snapshotId = await db.publishSnapshot(job.zone.regionId, snapshotScope(job.scope, job.sectorId), draft);
        }
        report.snapshot_published = snapshotId !== null;
        report.rejected = rejected;

        let status: RunStatus = "completed";
        for (const run of job.runs) {
            const incomplete = lf01.status !== "candidates_ready" || geocoderStatus !== "ok" ||
                lf01.incompleteCategories.includes(lf01EvidenceByType[run.evidenceType]);
            if (incomplete) status = "partial";
            await complete(run.id, incomplete ? "partial" : "completed", { ...report, accepted: accepted[run.evidenceType] ?? 0 }, null);
        }
        return { status, accepted, rejected, snapshotId, errorCode: null };
    } catch (error) {
        const code = errorCode(error);
        for (const run of job.runs) {
            if (!completed.has(run.id)) await complete(run.id, "failed", { ...report, rejected, accepted: accepted[run.evidenceType] ?? 0 }, code);
        }
        return { status: "failed", accepted, rejected, snapshotId: null, errorCode: code };
    }
}
