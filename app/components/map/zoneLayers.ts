import type { LayerProps } from "react-map-gl/maplibre";
import type { ZoneMetric } from "@/app/engine/types";

type FillLayerProps = Extract<LayerProps, { type: "fill" }>;
type LineLayerProps = Extract<LayerProps, { type: "line" }>;

export function getZoneFillLayer(metric: ZoneMetric): FillLayerProps {
  return {
    ...ZONE_FILL_LAYER,
    paint: {
      "fill-color": [
        "case", ["==", ["get", metric], null], "#B6B6C4",
        ["interpolate", ["linear"], ["coalesce", ["get", metric], 0],
          0, "#DCEEFF", 50, "#71B9EF", 100, "#098DEC"],
      ],
      "fill-opacity": 0.4,
    },
  };
}

export const ZONE_FILL_LAYER: FillLayerProps & { id: string } = {
  id: "zone-sector-presence",
  type: "fill",
  paint: {
    "fill-color": [
      "interpolate",
      ["linear"],
      ["get", "sector_presence"],
      0,
      "#DCEEFF",
      50,
      "#71B9EF",
      100,
      "#098DEC",
    ],
    "fill-opacity": 0.4,
  },
};

export const ZONE_OUTLINE_LAYER: LineLayerProps = {
  id: "zone-sector-presence-outline",
  type: "line",
  paint: {
    "line-color": "#098DEC",
    "line-width": 1,
  },
};

export const ZONE_HOVER_LAYER: FillLayerProps = {
  id: "zone-sector-presence-hover",
  type: "fill",
  paint: {
    "fill-color": "#098DEC",
    "fill-opacity": 0.18,
  },
};

export const ZONE_HOVER_OUTLINE_LAYER: LineLayerProps = {
  id: "zone-sector-presence-hover-outline",
  type: "line",
  paint: {
    "line-color": "#098DEC",
    "line-width": 2,
  },
};

export const ZONE_SELECTED_LAYER: FillLayerProps = {
  id: "zone-sector-presence-selected",
  type: "fill",
  paint: {
    "fill-color": "#098DEC",
    "fill-opacity": 0.3,
  },
};

export const ZONE_SELECTED_OUTLINE_LAYER: LineLayerProps = {
  id: "zone-sector-presence-selected-outline",
  type: "line",
  paint: {
    "line-color": "#098DEC",
    "line-width": 2.5,
  },
};
