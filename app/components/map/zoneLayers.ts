import type { LayerProps } from "react-map-gl/maplibre";
import type { MapCategory } from "@/app/engine/types";

type FillLayerProps = Extract<LayerProps, { type: "fill" }>;
type LineLayerProps = Extract<LayerProps, { type: "line" }>;

export function getZoneFillLayer(category: MapCategory): FillLayerProps {
  return {
    ...ZONE_FILL_LAYER,
    paint: {
      "fill-color": category === "summary" ? "#DCEEFF" : ["case", ["==", ["get", "value"], null], "#B6B6C4", "#098DEC"],
      "fill-opacity": 0.16,
    },
  };
}

export const ZONE_FILL_LAYER: FillLayerProps & { id: string } = {
  id: "region-fill",
  type: "fill",
  paint: { "fill-color": "#DCEEFF", "fill-opacity": 0.16 },
};

export const ZONE_OUTLINE_LAYER: LineLayerProps = {
  id: "region-outline",
  type: "line",
  paint: {
    "line-color": "#098DEC",
    "line-width": 1,
  },
};

export const ZONE_HOVER_OUTLINE_LAYER: LineLayerProps = {
  id: "region-hover-outline",
  type: "line",
  paint: {
    "line-color": "#098DEC",
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
    "line-color": "#080935",
    "line-width": 5,
  },
};

export const ZONE_SELECTED_OUTLINE_LAYER: LineLayerProps = {
  id: "region-selected-outline",
  type: "line",
  paint: {
    "line-color": "#098DEC",
    "line-width": 2.5,
  },
};
