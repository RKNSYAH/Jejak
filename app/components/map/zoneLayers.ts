import type { LayerProps } from "react-map-gl/maplibre";
import type { MapCategory } from "@/app/engine/types";

type FillLayerProps = Extract<LayerProps, { type: "fill" }>;
type LineLayerProps = Extract<LayerProps, { type: "line" }>;
type HeatmapLayerProps = Extract<LayerProps, { type: "heatmap" }>;

export type MetricRange = { min: number; max: number } | null;

export function getMetricRange(values: (number | null)[]): MetricRange {
  const available = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return available.length ? { min: Math.min(...available), max: Math.max(...available) } : null;
}

export function getZoneFillLayer(category: MapCategory, range: MetricRange): FillLayerProps {
  const thematic = category !== "summary";
  return {
    ...ZONE_FILL_LAYER,
    paint: {
      "fill-color": !thematic ? "#9ED9EB" : range && range.min < range.max
        ? ["interpolate", ["linear"], ["to-number", ["get", "value"]], range.min, "#9ED9EB", range.max, "#006AD8"]
        : "#006AD8",
      "fill-opacity": thematic ? ["case", ["==", ["get", "value"], null], 0, 0.6] : 0.16,
    },
  };
}

export const GLOW_RAMP = ["rgba(255, 210, 77, 0.65)", "#FFB347", "#F26743", "#C82E50"];

// Weights are 0-1 relative to the district's highest cell. The radius doubles
// per zoom level so the glow stays about one H3 resolution-9 cell (~350 m
// across) wide on the ground: ~42 px at zoom 14 near Jakarta.
export const CELL_GLOW_LAYER: HeatmapLayerProps = {
  id: "cell-glow",
  type: "heatmap",
  paint: {
    "heatmap-weight": ["get", "weight"],
    "heatmap-intensity": 1,
    "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 11, 5, 17, 336],
    "heatmap-color": ["interpolate", ["linear"], ["heatmap-density"],
      0, "rgba(255, 210, 77, 0)", 0.02, GLOW_RAMP[0], 0.1, GLOW_RAMP[1], 0.3, GLOW_RAMP[2], 1, GLOW_RAMP[3]],
    "heatmap-opacity": 0.8,
  },
};

// Per-cell values such as median rent are not additive, so they fill hexagons
// instead of glowing. Same blue scale as the district fill for the same measure.
export function getCellFillLayer(range: MetricRange): FillLayerProps {
  return {
    id: "cell-fill",
    type: "fill",
    paint: {
      "fill-color": range && range.min < range.max
        ? ["interpolate", ["linear"], ["to-number", ["get", "value"]], range.min, "#9ED9EB", range.max, "#006AD8"]
        : "#006AD8",
      "fill-opacity": ["case", ["==", ["get", "value"], null], 0, 0.7],
    },
  };
}

export const CELL_OUTLINE_LAYER: LineLayerProps = {
  id: "cell-outline",
  type: "line",
  paint: {
    "line-color": "#FFFFFF",
    "line-opacity": 0.6,
    "line-width": 0.5,
  },
};

export const ZONE_FILL_LAYER: FillLayerProps & { id: string } = {
  id: "region-fill",
  type: "fill",
  paint: { "fill-color": "#9ED9EB", "fill-opacity": 0.16 },
};

export const ZONE_OUTLINE_LAYER: LineLayerProps = {
  id: "region-outline",
  type: "line",
  paint: {
    "line-color": "#5F84B1",
    "line-opacity": 0.4,
    "line-width": 1,
  },
};

export const ZONE_HOVER_OUTLINE_LAYER: LineLayerProps = {
  id: "region-hover-outline",
  type: "line",
  paint: {
    "line-color": "#006AD8",
    "line-width": 2,
  },
};

export const ZONE_SELECTED_CASING_LAYER: LineLayerProps = {
  id: "region-selected-casing",
  type: "line",
  layout: {
    "line-join": "round",
  },
  paint: {
    "line-color": "#21297C",
    "line-width": 5,
  },
};

export const ZONE_SELECTED_OUTLINE_LAYER: LineLayerProps = {
  id: "region-selected-outline",
  type: "line",
  paint: {
    "line-color": "#006AD8",
    "line-width": 2.5,
  },
};
