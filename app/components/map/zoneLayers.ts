import type { LayerProps } from "react-map-gl/maplibre";
import type { MapCategory } from "@/app/engine/types";

type FillLayerProps = Extract<LayerProps, { type: "fill" }>;
type LineLayerProps = Extract<LayerProps, { type: "line" }>;

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
