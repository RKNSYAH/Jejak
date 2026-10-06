import "server-only";
import { createAdminClient, isAdminConfigured } from "../lib/admin";
import { cachedFactTypes, mergeCachedFacts, type CachedFactRow } from "../enrichment/cachedFacts";
import { evidenceScope } from "../enrichment/scopes";
import { mergeLocatedEvidence, toEvidenceClusters, type ClusterRow } from "../enrichment/clusters";
import type { RegionFact } from "../types";

type FactRegion = { region_code: string; parent_code: string; facts: RegionFact[] };

// Shared read routing for map details and onboarding. No enrichment runs or writes.
export async function withCachedEvidence<T extends FactRegion>(rows: T[], sectorId: string): Promise<T[]> {
    if (!rows.length || !isAdminConfigured()) return rows;
    try {
        const admin = createAdminClient();
        const { data: regions, error } = await admin.from("regions").select("id,region_code")
            .in("region_code", rows.map((row) => row.region_code));
        if (error) throw error;
        const ids = new Map((regions as { id: number; region_code: string }[]).map((row) => [row.region_code, row.id]));
        if (!ids.size) return rows;
        const evidence: CachedFactRow[] = [];
        const now = Date.now();
        // PostgREST caps responses: paginate instead of silently scoring a partial cache.
        const pageSize = 500;
        for (let offset = 0; ; offset += pageSize) {
            const result = await admin.from("zone_evidence_cache")
                .select("region_id,evidence_type,scope_hash,dedup_hash,value,locality_tier,validation_status,is_sample,retrieved_at,refresh_after,expires_at")
                .in("region_id", [...ids.values()])
                .in("scope_hash", cachedFactTypes.map((type) => evidenceScope(type, sectorId).scopeHash))
                .eq("validation_status", "accepted").eq("is_sample", false).eq("locality_tier", "zone")
                .gt("expires_at", new Date(now).toISOString()).order("id").range(offset, offset + pageSize - 1);
            if (result.error) throw result.error;
            const page = result.data as CachedFactRow[];
            evidence.push(...page);
            if (page.length < pageSize) break;
        }
        const byRegion = new Map<number, CachedFactRow[]>();
        for (const row of evidence) {
            const group = byRegion.get(row.region_id) ?? [];
            group.push(row);
            byRegion.set(row.region_id, group);
        }
        // Keep the existing boundary-based office binning: evidence found while
        // searching a neighbouring district still belongs to its actual district.
        const clusters = await Promise.all([...new Set(rows.map((row) => row.parent_code))].map(async (parentCode) => {
            const result = await admin.rpc("get_evidence_clusters", {
                p_parent_code: parentCode, p_scope_hashes: [evidenceScope("office_presence", sectorId).scopeHash],
                p_include_sample: rows.some((row) => "is_sample" in row && row.is_sample === true),
            });
            if (result.error) throw result.error;
            return toEvidenceClusters(result.data as ClusterRow[], ["office_presence"]);
        }));
        const offices = new Map(clusters.flat().map((cluster) => [cluster.zone_id, cluster]));
        return rows.map((row) => ({ ...row, facts: mergeLocatedEvidence(
            mergeCachedFacts(row.facts, byRegion.get(ids.get(row.region_code)!) ?? [], sectorId, now),
            offices.get(row.region_code), sectorId,
        ) }));
    } catch {
        // Cache/service-role availability must never hide the static dataset.
        return rows;
    }
}
