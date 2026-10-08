import { createHash } from "node:crypto";
import type { MissingEvidence } from "../types";

// Evidence scopes a caller may refresh. Each maps to cache policy evidence types
// (public.evidence_cache_policies) that share one public snapshot.
const enrichmentScopes = ["career", "housing"] as const;
export type EnrichmentScope = (typeof enrichmentScopes)[number];

export type EvidenceType =
    | "office_presence" | "active_opening" | "salary_observation" | "local_employment"
    | "kos_listing" | "apartment_listing" | "house_listing";

export const scopeEvidenceTypes: Record<EnrichmentScope, EvidenceType[]> = {
    career: ["office_presence", "active_opening", "salary_observation", "local_employment"],
    housing: ["kos_listing", "apartment_listing", "house_listing"],
};

// Policy names differ from the discovery request vocabulary.
export const discoveryEvidenceByType: Record<EvidenceType, MissingEvidence> = {
    office_presence: "company_presence",
    active_opening: "active_openings",
    salary_observation: "salary",
    local_employment: "headcount",
    kos_listing: "kos",
    apartment_listing: "apartment",
    house_listing: "house",
};

const LOCAL_HEADCOUNT_SCOPES = new Set(["office", "site", "city"]);

// Discovered claim types that can become accepted evidence. Provider rent summaries
// (kos_rent_summary, ...) describe a whole page, not listings, and are not ingested.
export function evidenceTypeForClaim(claimType: string, claimScope: string | null): EvidenceType | null {
    switch (claimType) {
        case "office_location": return "office_presence";
        case "vacancy": return "active_opening";
        case "salary": return "salary_observation";
        case "headcount": return claimScope && LOCAL_HEADCOUNT_SCOPES.has(claimScope) ? "local_employment" : null;
        case "kos_rent": return "kos_listing";
        case "apartment_rent": return "apartment_listing";
        case "house_rent": return "house_listing";
        default: return null;
    }
}

export function isEnrichmentScope(value: unknown): value is EnrichmentScope {
    return typeof value === "string" && (enrichmentScopes as readonly string[]).includes(value);
}

export function sha256Hex(text: string): string {
    return createHash("sha256").update(text).digest("hex");
}

// Lowercase "base|key=value" with sorted keys, so equal filters always hash equally.
function canonicalScopeKey(base: string, filters: Record<string, string> = {}): string {
    const parts = Object.keys(filters).sort().map((key) => `${key}=${filters[key]}`);
    const key = [base, ...parts].join("|").toLowerCase();
    if (key.length > 200) throw new Error("Scope key is too long");
    return key;
}

type ScopeIdentity = { scopeKey: string; scopeHash: string };

function identity(scopeKey: string): ScopeIdentity {
    return { scopeKey, scopeHash: sha256Hex(scopeKey) };
}

// Work evidence is scoped to the sector it was searched for; housing is not.
export function evidenceScope(type: EvidenceType, sectorId: string): ScopeIdentity {
    return identity(scopeEvidenceTypes.career.includes(type) ? canonicalScopeKey(type, { sector: sectorId }) : canonicalScopeKey(type));
}

export function snapshotScope(scope: EnrichmentScope, sectorId: string): ScopeIdentity & { snapshotType: EnrichmentScope } {
    const scopeKey = scope === "career"
        ? canonicalScopeKey("career", { sector: sectorId })
        : canonicalScopeKey("housing", { types: "apartment,house,kos" });
    return { snapshotType: scope, ...identity(scopeKey) };
}
