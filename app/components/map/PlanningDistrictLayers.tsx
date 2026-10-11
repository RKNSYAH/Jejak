"use client";

import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";
import type { ZoneGeometry } from "@/app/engine/types";
import type { LiveDistrictRecommendation } from "@/app/engine/onboarding/types";
import { planningDistrictData, planningDistrictPoints } from "@/app/engine/onboarding/planningReach";

export const PLANNING_DISTRICT_FILL_ID = "planning-district-fill";

export default function PlanningDistrictLayers({ geometry, districts, selectedId, showFill }: {
    geometry: ZoneGeometry | null; districts: LiveDistrictRecommendation[]; selectedId?: string; showFill: boolean;
}) {
    const data = useMemo(() => planningDistrictData(geometry, districts), [geometry, districts]);
    const points = useMemo(() => planningDistrictPoints(districts), [districts]);
    return <>
        <Source id="planning-districts" type="geojson" data={data}>
            <Layer id={PLANNING_DISTRICT_FILL_ID} type="fill" beforeId="building-3d" paint={{
                "fill-color": ["case", ["==", ["get", "reach_band"], "near"], "#006AD8", "#9ED9EB"],
                "fill-opacity": showFill ? ["case", ["==", ["get", "reach_band"], "near"], 0.28, ["==", ["get", "reach_band"], "edge"], 0.18, 0] : 0,
            }} />
            <Layer id="planning-district-outline" type="line" beforeId="building-3d" paint={{
                "line-color": ["case", ["==", ["get", "reach_band"], "near"], "#006AD8", ["==", ["get", "reach_band"], "edge"], "#5F84B1", "#8995A9"],
                "line-width": 1.5,
            }} />
            {selectedId && <Layer id="planning-district-selected" type="line" beforeId="building-3d"
                filter={["==", ["get", "zone_id"], selectedId]} paint={{ "line-color": "#21297C", "line-width": 3.5 }} />}
        </Source>
        <Source id="planning-district-points" type="geojson" data={points}>
            <Layer id="planning-district-point-status" type="circle" beforeId="building-3d" paint={{
                "circle-radius": 4,
                "circle-color": ["case", ["==", ["get", "reach_band"], "near"], "#006AD8", ["==", ["get", "reach_band"], "edge"], "#5F84B1", "#8995A9"],
                "circle-stroke-width": 1, "circle-stroke-color": "#FFF9F9",
            }} />
        </Source>
    </>;
}
