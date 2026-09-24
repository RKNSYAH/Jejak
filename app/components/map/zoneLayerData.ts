import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { ZoneGeometry, ZoneIntelligenceResponse } from "@/app/engine/types";

type ZoneLayerProperties = {
  zone_id: string;
  zone_name: string;
  sector_presence: number | null;
  hiring_activity: number | null;
};

export function createZoneLayerData(
  geometry: ZoneGeometry,
  intelligenceByZone: Record<string, ZoneIntelligenceResponse | null>,
): FeatureCollection<Polygon | MultiPolygon, ZoneLayerProperties> {
  return {
    type: "FeatureCollection",
    features: geometry.features.map((feature) => {
      const snapshot = intelligenceByZone[feature.properties.zone_id]?.snapshot;
      return {
        ...feature,
        properties: {
          ...feature.properties,
          sector_presence: snapshot?.indices.sector_presence ?? null,
          hiring_activity: snapshot?.indices.hiring_activity ?? null,
        },
      };
    }),
  };
}
