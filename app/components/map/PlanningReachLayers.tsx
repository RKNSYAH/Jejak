"use client";

import { useMemo } from "react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import type { PlanningReach } from "@/app/engine/onboarding/planningReach";
import { planningDistanceLabel } from "@/app/engine/onboarding/planningReach";

// Shared by setup and exploration: these rings are distance assumptions, not isochrones.
export default function PlanningReachLayers({ reach, idPrefix, showDestination = false }: {
    reach: PlanningReach; idPrefix: string; showDestination?: boolean;
}) {
    const labels = useMemo(() => reach.geometry.features.map((feature) => ({
        band: feature.properties.band,
        // North-east keeps radius labels away from the central destination pin.
        point: feature.geometry.coordinates[0][84],
        label: `${feature.properties.band === "low" ? "Dalam" : "Luar"} · ${planningDistanceLabel(reach.radiusKm[feature.properties.band])}`,
    })), [reach]);
    return <>
        <Source id={`${idPrefix}-planning-reach`} type="geojson" data={reach.geometry}>
            <Layer id={`${idPrefix}-planning-reach-fill`} type="fill" beforeId="building-3d"
                paint={{ "fill-color": "#9ED9EB", "fill-opacity": 0.08 }} />
            <Layer id={`${idPrefix}-planning-reach-outline`} type="line" beforeId="building-3d"
                paint={{ "line-color": "#006AD8", "line-width": 2.5, "line-dasharray": [3, 2] }} />
        </Source>
        {labels.map(({ band, point, label }) => <Marker key={band} longitude={point[0]} latitude={point[1]} anchor="center">
            <span data-hci-region="planning-radius-label" className="pointer-events-none whitespace-nowrap rounded-md border border-primary bg-base-100 px-2 py-1 font-body text-xs font-semibold tabular-nums text-ink shadow-overlay">{label}</span>
        </Marker>)}
        {showDestination && <Marker longitude={reach.destination[0]} latitude={reach.destination[1]} anchor="bottom">
            <span data-hci-region="planning-destination" className="pointer-events-none rounded-full border-2 border-base-100 bg-primary px-3 py-1 font-body text-xs font-semibold text-primary-content shadow-overlay">Tujuanmu</span>
        </Marker>}
    </>;
}
