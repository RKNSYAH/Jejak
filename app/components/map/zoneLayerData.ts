import type { FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import type { MapCategory, MapCell, ZoneDetailResult, ZoneGeometry } from "@/app/engine/types";
import { type CellLayer, mapCategories } from "./mapMetrics";

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

// Glow weights are relative to the highest cell in the district (0 to 1), so a
// few thousand workers cannot saturate the heatmap colour ramp.
export function createCellGlowData(
    cells: MapCell[], metric: string,
): FeatureCollection<Point, { cell_code: string; weight: number }> {
    const max = Math.max(0, ...cells.map((cell) => cell.facts[metric]?.value ?? 0));
    return {
        type: "FeatureCollection",
        features: max > 0 ? cells.flatMap((cell) => {
            const fact = cell.facts[metric];
            return fact ? [{
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: cell.centroid },
                properties: { cell_code: cell.cell_code, weight: fact.value / max },
            }] : [];
        }) : [],
    };
}

export function createCellFillData(
    cells: MapCell[], metric: string,
): FeatureCollection<Polygon | MultiPolygon, { cell_code: string; value: number | null }> {
    return {
        type: "FeatureCollection",
        features: cells.map((cell) => ({
            type: "Feature",
            geometry: cell.geometry,
            properties: { cell_code: cell.cell_code, value: cell.facts[metric]?.value ?? null },
        })),
    };
}

export type CellSummary = {
    cells: number;
    withValue: number;
    min: number;
    max: number;
    total: number;
    // Bounds of the highest cell and of the district total, when the layer has them.
    maxBounds: { low: number; high: number } | null;
    totalBounds: { low: number; high: number } | null;
    sources: string[];
    periods: string[];
    isSample: boolean;
};

export function summarizeCells(cells: MapCell[], layer: CellLayer): CellSummary | null {
    const valued = cells.filter((cell) => cell.facts[layer.metric]);
    if (valued.length === 0) return null;
    const values = valued.map((cell) => cell.facts[layer.metric].value);
    const top = valued[values.indexOf(Math.max(...values))];
    const bounds = layer.bounds;
    const boundsOf = (cell: MapCell) => bounds && cell.facts[bounds.low] && cell.facts[bounds.high]
        ? { low: cell.facts[bounds.low].value, high: cell.facts[bounds.high].value } : null;
    const allBounds = valued.map(boundsOf).filter((b): b is { low: number; high: number } => b !== null);
    const facts = valued.map((cell) => cell.facts[layer.metric]);
    return {
        cells: cells.length,
        withValue: valued.length,
        min: Math.min(...values),
        max: Math.max(...values),
        total: values.reduce((sum, value) => sum + value, 0),
        maxBounds: boundsOf(top),
        totalBounds: bounds && allBounds.length === valued.length
            ? allBounds.reduce((sum, b) => ({ low: sum.low + b.low, high: sum.high + b.high }), { low: 0, high: 0 })
            : null,
        sources: [...new Set(facts.map((fact) => fact.source))],
        periods: [...new Set(facts.map((fact) => fact.period_end ?? "period unavailable"))],
        isSample: facts.some((fact) => fact.is_sample),
    };
}
