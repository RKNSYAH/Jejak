"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";
import { Check } from "lucide-react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { FilterSpecification } from "maplibre-gl";
import { hasHousingStatistics, isLiveRecommendationSample, isTopRanked, onboardingCategoryValue } from "@/app/engine/onboarding/livePreview";
import type { LiveOnboardingPreview, LivePreviewMapContext, OnboardingCampus } from "@/app/engine/onboarding/types";
import type { MapCategory, ZoneGeometry } from "@/app/engine/types";
import { visiblePreviewDistricts } from "@/app/engine/onboarding/visibleDistricts";
import PlanningReachLayers from "../PlanningReachLayers";

export const ONBOARDING_FILL_ID = "onboarding-district-fill";
const HATCH_IMAGE = "onboarding-over-limit-hatch";

// `preliminary` is the lighter outlined badge used until the profile is saved; the saved ranking is solid.
function DistrictLabel({ item, rank, preliminary = false }: { item: LiveOnboardingPreview["districts"][number]; rank: number | null; preliminary?: boolean }) {
    return <div className="pointer-events-none flex flex-col items-center gap-1 text-center font-sans text-sm font-bold leading-tight text-ink [text-shadow:0_1px_2px_var(--color-base-100),0_-1px_2px_var(--color-base-100)]">
        {rank !== null && <span className={`flex size-7 items-center justify-center rounded-full border-2 font-body text-sm shadow-overlay ${preliminary ? "border-primary bg-base-100 text-ink" : "border-base-100 bg-primary text-primary-content"}`}>{rank}</span>}
        <span className="max-w-28">{item.district.zone_name}</span>
    </div>;
}

// Campuses are dots, so a zoomed-out metro stays readable; the name shows on hover or focus. The chosen
// campus keeps its name pill, and pressing it again clears the choice.
function DestinationMarker({ item, selected, onClick }: { item: OnboardingCampus; selected: boolean; onClick: () => void }) {
    return <Marker longitude={item.center[0]} latitude={item.center[1]} anchor={selected ? "bottom-left" : "center"}>
        {selected
            ? <button type="button" aria-label={`Pilih kampus ${item.name}`} aria-pressed onClick={(event) => { event.stopPropagation(); onClick(); }} data-hci-region="onboarding-map-destination"
                className="flex min-h-11 max-w-56 items-center gap-2 rounded-full border border-primary bg-primary px-3 py-2 font-body text-xs font-semibold text-primary-content shadow-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Check aria-hidden="true" className="size-3.5 shrink-0" />
                <span className="truncate">{item.name}</span>
            </button>
            : <button type="button" aria-label={`Pilih kampus ${item.name}`} aria-pressed={false} onClick={(event) => { event.stopPropagation(); onClick(); }} data-hci-region="onboarding-map-destination"
                className="group relative flex size-6 items-center justify-center rounded-full pointer-coarse:size-11 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary">
                <span aria-hidden="true" className="size-3.5 rounded-full border-2 border-base-100 bg-primary shadow-overlay group-hover:size-4" />
                <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-full z-10 mt-1 hidden max-w-56 -translate-x-1/2 truncate whitespace-nowrap rounded-md bg-ink px-2 py-1 font-body text-xs font-semibold text-base-100 group-hover:block group-focus-visible:block">{item.name}</span>
            </button>}
    </Marker>;
}

export default function OnboardingMapLayers({ context, preview, geometry, mapRef, mapLoaded, category, selectedDistrictId,
    onDestination, onSelectDistrict }: {
    context: LivePreviewMapContext; preview: LiveOnboardingPreview; geometry: ZoneGeometry | null; mapRef: RefObject<MapRef | null>;
    mapLoaded: boolean; category: MapCategory | null; selectedDistrictId: string | null;
    // `null` clears the campus when the chosen one is pressed again.
    onDestination: (item: OnboardingCampus | null) => void; onSelectDistrict: (id: string) => void;
}) {
    const [patternReady, setPatternReady] = useState(false);
    const step = context.step;
    const completed = context.completed;

    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!mapLoaded || !map) return;
        if (!map.hasImage(HATCH_IMAGE)) {
            const size = 12;
            const data = new Uint8Array(size * size * 4);
            for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                const offset = (y * size + x) * 4;
                data.set([33, 41, 124, (x + y) % size < 2 ? 100 : 0], offset);
            }
            map.addImage(HATCH_IMAGE, { width: size, height: size, data });
        }
        const timer = window.setTimeout(() => setPatternReady(true), 0);
        return () => window.clearTimeout(timer);
    }, [mapLoaded, mapRef]);

    const districtData = useMemo<FeatureCollection<Polygon | MultiPolygon, {
        zone_id: string; eligible: boolean | null; value: number | null; is_sample: boolean; reach_band: string; top: boolean;
    }>>(() => {
        const byId = new Map(preview.districts.map((item) => [item.district.zone_id, item]));
        const hasBudgetCriteria = preview.preferences.monthlyBudget !== null || preview.preferences.maximumRent !== null;
        return { type: "FeatureCollection", features: geometry?.features.flatMap((feature) => {
            const item = byId.get(feature.properties.zone_id);
            if (!item) return [];
            return [{ ...feature, properties: {
                ...feature.properties,
                eligible: hasBudgetCriteria ? item.eligible : null,
                value: onboardingCategoryValue(item, category),
                is_sample: isLiveRecommendationSample(item),
                reach_band: item.reachBand,
                top: isTopRanked(item),
            } }];
        }) ?? [] };
    }, [preview, geometry, category]);

    const valueRange = useMemo(() => {
        const values = districtData.features.flatMap(({ properties }) => properties.value === null ? [] : [properties.value]);
        return values.length ? [Math.min(...values), Math.max(...values)] as const : null;
    }, [districtData]);
    const bands = useMemo(() => valueRange && valueRange[0] === valueRange[1] ? [valueRange[0], valueRange[0] + 1] as const : valueRange, [valueRange]);
    const showFilled = step >= 2;
    const showPlanningFill = step >= 3 && !!preview.planningReach && !preview.commute && (category === null || category === "summary" || category === "mobility");
    // While setup is open, only the top-ranked districts stand out so a wide metro doesn't light up all at once.
    const emphasizeTop = showFilled && !completed && preview.ranked.length > 0;
    const hideExcluded = showFilled && context.overBudget === "hide";
    const eligibleFilter: FilterSpecification = hideExcluded ? ["!=", ["get", "eligible"], false] : ["all"];
    const selectedRoute = preview.districts.find((item) => item.district.zone_id === selectedDistrictId)?.commuteEstimate?.geometry;
    const routeSamples = useMemo(() => ({ type: "FeatureCollection" as const,
        features: visiblePreviewDistricts(preview, step >= 2).flatMap((item) => item.commuteEstimate?.samples.map((sample) => ({
            type: "Feature" as const, properties: { status: sample.status },
            geometry: { type: "Point" as const, coordinates: sample.origin },
        })) ?? []),
    }), [preview, step]);
    const planningPoints = useMemo(() => ({ type: "FeatureCollection" as const, features:
        visiblePreviewDistricts(preview, step >= 2).flatMap((item) => item.district.center ? [{
            type: "Feature" as const, properties: { band: item.reachBand },
            geometry: { type: "Point" as const, coordinates: item.district.center },
        }] : []),
    }), [preview, step]);
    if (!preview.available) return null;
    return <>
        <Source id="onboarding-districts" type="geojson" data={districtData}>
            <Layer id={ONBOARDING_FILL_ID} type="fill" beforeId="building-3d" filter={eligibleFilter}
                paint={{
                    "fill-color": showPlanningFill ? ["case", ["==", ["get", "reach_band"], "near"], "#006AD8", ["==", ["get", "reach_band"], "edge"], "#9ED9EB", "#DCE3EC"]
                        : completed && category !== "summary" && category !== null && bands
                        ? ["case", ["==", ["get", "value"], null], "#DCE3EC", ["interpolate", ["linear"], ["get", "value"], bands[0], category === "mobility" ? "#006AD8" : "#9ED9EB", bands[1], category === "mobility" ? "#9ED9EB" : "#006AD8"]]
                        : emphasizeTop ? ["case", ["==", ["get", "top"], true], "#006AD8", ["==", ["get", "eligible"], null], "#DCE3EC", "#006AD8"]
                        : ["case", ["==", ["get", "eligible"], null], "#DCE3EC", "#006AD8"],
                    "fill-opacity": showPlanningFill ? ["case", ["==", ["get", "reach_band"], "near"], 0.28, ["==", ["get", "reach_band"], "edge"], 0.18, 0.04]
                        : !showFilled ? 0 : emphasizeTop
                        ? ["case", ["==", ["get", "top"], true], 0.36, ["==", ["get", "eligible"], true], 0.1, ["==", ["get", "eligible"], false], 0.06, 0.08]
                        : ["case", ["==", ["get", "eligible"], true], 0.22, ["==", ["get", "eligible"], false], 0.08, 0.14],
                }} />
            {showFilled && !hideExcluded && patternReady && <Layer id="onboarding-over-limit" type="fill" beforeId="building-3d"
                filter={["==", ["get", "eligible"], false]} paint={{ "fill-pattern": HATCH_IMAGE, "fill-opacity": 0.45 }} />}
            <Layer id="onboarding-district-outlines" type="line" beforeId="building-3d" filter={eligibleFilter}
                paint={{ "line-color": preview.planningReach
                    ? ["case", ["==", ["get", "reach_band"], "near"], "#006AD8", ["==", ["get", "reach_band"], "edge"], "#5F84B1", "#8995A9"]
                    : ["case", ["==", ["get", "eligible"], true], "#006AD8", ["==", ["get", "eligible"], false], "#5F84B1", "#8995A9"],
                    "line-width": emphasizeTop ? ["case", ["==", ["get", "top"], true], 2.6, 1.3] : 1.3, "line-opacity": 0.9 }} />
            {selectedDistrictId && <Layer id="onboarding-selected-outline" type="line" beforeId="building-3d"
                filter={hideExcluded ? ["all", ["==", ["get", "zone_id"], selectedDistrictId], ["!=", ["get", "eligible"], false]] : ["==", ["get", "zone_id"], selectedDistrictId]}
                paint={{ "line-color": "#21297C", "line-width": 3, "line-opacity": 1 }} />}
        </Source>
        {step >= 3 && preview.planningReach && !preview.commute && <>
            <PlanningReachLayers reach={preview.planningReach} idPrefix="onboarding" />
            <Source id="onboarding-planning-points" type="geojson" data={planningPoints}>
                <Layer id="onboarding-planning-point-status" type="circle" beforeId="building-3d" paint={{ "circle-radius": 4,
                    "circle-color": ["case", ["==", ["get", "band"], "near"], "#006AD8", ["==", ["get", "band"], "edge"], "#5F84B1", "#8995A9"],
                    "circle-stroke-width": 1, "circle-stroke-color": "#FFF9F9" }} />
            </Source>
        </>}
        {step >= 3 && preview.commute?.reach && <Source id="onboarding-network-reach" type="geojson" data={preview.commute.reach}>
            <Layer id="onboarding-reach-fill" type="fill" beforeId="building-3d" paint={{ "fill-color": "#9ED9EB", "fill-opacity": 0.16 }} />
            <Layer id="onboarding-reach-outline" type="line" beforeId="building-3d" paint={{ "line-color": "#006AD8", "line-width": 2, "line-dasharray": [3, 2] }} />
        </Source>}
        {step >= 3 && <Source id="onboarding-route-samples" type="geojson" data={routeSamples}>
            <Layer id="onboarding-sample-points" type="circle" beforeId="building-3d" paint={{ "circle-radius": 3,
                "circle-color": ["case", ["==", ["get", "status"], "ok"], "#006AD8", "#8995A9"], "circle-stroke-width": 1, "circle-stroke-color": "#FFF9F9" }} />
        </Source>}
        {step >= 3 && selectedRoute && <Source id="onboarding-selected-route" type="geojson" data={selectedRoute}>
            <Layer id="onboarding-route-line" type="line" beforeId="building-3d" paint={{ "line-color": "#21297C", "line-width": 4, "line-opacity": 0.85 }} />
            <Layer id="onboarding-route-walk" type="line" beforeId="building-3d" filter={["==", ["get", "mode"], "WALK"]}
                paint={{ "line-color": "#FFF9F9", "line-width": 2, "line-dasharray": [1, 2] }} />
        </Source>}
        {/* Best-ranked last, so its badge draws over neighbouring labels. */}
        {[...visiblePreviewDistricts(preview, showFilled)].reverse().flatMap((item) => item.district.center ? [<Marker key={item.district.zone_id} longitude={item.district.center[0]} latitude={item.district.center[1]} anchor="center">
            {completed ? <button type="button" aria-disabled={!hasHousingStatistics(item)}
                aria-label={`${item.district.zone_name}${item.rank ? `, peringkat ${item.rank}` : item.eligible === false ? ", di luar batas" : ", belum terverifikasi"}${hasHousingStatistics(item) ? "" : ", sewa belum tersedia"}`}
                onClick={(event) => { event.stopPropagation(); if (hasHousingStatistics(item)) onSelectDistrict(item.district.zone_id); }}
                className="min-h-11 min-w-11 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-primary"><DistrictLabel item={item} rank={item.rank} /></button>
                : <DistrictLabel item={item} rank={emphasizeTop && isTopRanked(item) ? item.rank : null} preliminary />}
        </Marker>] : [])}
        {(step === 1 || step === 3) && context.goal !== "work" && preview.destinations.map((item) => <DestinationMarker
            key={item.id} item={item} selected={context.destinationId === item.id}
            onClick={() => onDestination(context.destinationId === item.id ? null : item)} />)}
        {context.destinationPoint && <Marker longitude={context.destinationPoint[0]} latitude={context.destinationPoint[1]} anchor="center">
            <span className="pointer-events-none flex size-5 items-center justify-center rounded-full border-2 border-base-100 bg-primary shadow-overlay"><span className="size-1.5 rounded-full bg-base-100" /></span>
        </Marker>}
    </>;
}
