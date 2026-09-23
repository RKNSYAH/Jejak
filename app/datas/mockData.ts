import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { ZoneIntelligenceResponse } from "../engine/types";

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
    status: "running",
    run_id: "run_pancoran_it_20260915",
  },
};

export const MOCK_ZONE_INTELLIGENCE_BY_ZONE: Record<
  string,
  ZoneIntelligenceResponse
> = {
  [MOCK_ZONE_INTELLIGENCE.snapshot.zone_id]: MOCK_ZONE_INTELLIGENCE,
};

export function getZoneIntelligence(
  zoneId: string,
): ZoneIntelligenceResponse | undefined {
  return MOCK_ZONE_INTELLIGENCE_BY_ZONE[zoneId];
}


export type ZoneGeometryProperties = {
  zone_id: string;
  zone_name: string;
};

export type ZoneGeometry = FeatureCollection<
  Polygon | MultiPolygon,
  ZoneGeometryProperties
>;

export async function getZoneGeometry(
  zoneName: string
): Promise<ZoneGeometry> {
  const params = new URLSearchParams({
    zone_name: zoneName,
  });

  const res = await fetch(`/api/geometry?${params}`);

  if (!res.ok) {
    throw new Error(
      `Failed to fetch geometry for ${zoneName}`
    );
  }

  const raw = await res.json()
  
  return {
    type: "FeatureCollection",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    features: raw.features.map((feature: any) => ({
      type: "Feature",
      id: zoneName.toLowerCase(),
      properties: {
        zone_id: zoneName.toLowerCase(),
        zone_name: feature.properties.WADMKC,
      },
      geometry: feature.geometry,
    }))
  }
}
