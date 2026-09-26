import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { MapCategory, ZoneDetailResult, ZoneGeometry } from "@/app/engine/types";

const metricByCategory: Partial<Record<MapCategory, string>> = {
    employment: "company_count",
    education: "universities",
    housing: "median_monthly_rent_idr",
    mobility: "public_transport_stops",
};

export function createZoneLayerData(
    geometry: ZoneGeometry,
    detailsByZone: Record<string, ZoneDetailResult | undefined>,
    category: MapCategory,
): FeatureCollection<Polygon | MultiPolygon, { zone_id: string; zone_name: string; value: number | null }> {
    const metric = metricByCategory[category];
    return {
        type: "FeatureCollection",
        features: geometry.features.map((feature) => ({
            ...feature,
            properties: {
                ...feature.properties,
                value: metric ? detailsByZone[feature.properties.zone_id]?.facts.find((fact) => fact.metric === metric)?.value ?? null : null,
            },
        })),
    };
}
