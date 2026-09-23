import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import type { ZoneIntelligenceResponse } from "@/app/engine/types";

type ZoneGeometryProperties = {
  zone_id: string;
  zone_name: string;
};

type ZoneLayerProperties = ZoneGeometryProperties & {
  sector_presence: number;
  hiring_activity: number;
  employer_diversity: number;
  observed_organizations: number;
  verified_offices: number;
  active_openings: number;
  confidence: number;
  confidence_label: string;
};

type ZoneGeometry = Polygon | MultiPolygon;

export function createZoneLayerData(
  geometry: FeatureCollection<ZoneGeometry, ZoneGeometryProperties>,
  intelligence: ZoneIntelligenceResponse,
): FeatureCollection<ZoneGeometry, ZoneLayerProperties> {
  const { snapshot } = intelligence;

  return {
    type: "FeatureCollection",
    features: geometry.features
      .filter(
        (feature) =>
          feature.properties.zone_id === snapshot.zone_id,
      )
      .map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          sector_presence: snapshot.indices.sector_presence,
          hiring_activity: snapshot.indices.hiring_activity,
          employer_diversity: snapshot.indices.employer_diversity,
          observed_organizations: snapshot.observed_organizations,
          verified_offices: snapshot.verified_offices,
          active_openings: snapshot.active_openings,
          confidence: snapshot.evidence.confidence,
          confidence_label: snapshot.evidence.confidence_label,
        },
      })),
  };
}