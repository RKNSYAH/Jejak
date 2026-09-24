import type { ZoneIntelligenceResponse, Zone } from "../engine/types";

export const SUPPORTED_ZONES: Zone[] = [
  { zone_id: "pancoran", zone_name: "Pancoran", city_id: "jakarta-selatan", city_name: "Jakarta Selatan" },
  { zone_id: "setiabudi", zone_name: "Setiabudi", city_id: "jakarta-selatan", city_name: "Jakarta Selatan" },
  { zone_id: "mampang-prapatan", zone_name: "Mampang Prapatan", city_id: "jakarta-selatan", city_name: "Jakarta Selatan" },
];

export const MOCK_ZONE_INTELLIGENCE: ZoneIntelligenceResponse = {
  snapshot: {
    zone_id: "pancoran",
    sector_id: "software_and_it_services",
    snapshot_at: "2026-09-15T00:00:00Z",
    observed_organizations: 20,
    verified_offices: 13,
    active_openings: 4,
    local_headcount: {
      minimum: 3000,
      maximum: 6500,
      status: "estimated",
      method_version: "local-headcount-v1",
    },
    indices: {
      sector_presence: 72,
      hiring_activity: 46,
      employer_diversity: 61,
    },
    evidence: {
      sources_monitored: 5,
      organizations_without_headcount: 8,
      oldest_material_evidence: "2026-07-01",
      confidence: 0.67,
      confidence_label: "medium",
    },
  },
  freshness: "stale",
  coverage: "partial",
  refresh: {
    status: "unavailable",
    run_id: null,
  },
};

export const MOCK_ZONE_INTELLIGENCE_BY_ZONE: Record<
  string,
  ZoneIntelligenceResponse
> = {
  [MOCK_ZONE_INTELLIGENCE.snapshot.zone_id]: MOCK_ZONE_INTELLIGENCE,
  setiabudi: {
    ...MOCK_ZONE_INTELLIGENCE,
    freshness: "fresh",
    coverage: "complete",
    snapshot: {
      ...MOCK_ZONE_INTELLIGENCE.snapshot,
      zone_id: "setiabudi",
      active_openings: 0,
      local_headcount: undefined,
      indices: { sector_presence: 85, hiring_activity: 0, employer_diversity: 70 },
    },
  },
};
