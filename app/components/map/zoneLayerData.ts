import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { MapCategory, ZoneDetailResult, ZoneGeometry } from "@/app/engine/types";
import { mapCategories } from "./mapMetrics";

export function createZoneLayerData(
    geometry: ZoneGeometry,
    detailsByZone: Record<string, ZoneDetailResult | undefined>,
    category: MapCategory,
): FeatureCollection<Polygon | MultiPolygon, { zone_id: string; zone_name: string; value: number | null }> {
    const metric = mapCategories[category].metric;
    return {
        type: "FeatureCollection",
        features: geometry.features.map((feature) => ({
            ...feature,
            properties: {
                ...feature.properties,
                value: metric ? detailsByZone[feature.properties.zone_id]?.facts.find((fact) => fact.metric === metric && fact.evidence_type !== "unavailable")?.value ?? null : null,
            },
        })),
    };
}
