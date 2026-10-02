"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";
import { Check, GraduationCap } from "lucide-react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import type { FilterSpecification } from "maplibre-gl";
import { isLiveRecommendationSample, onboardingCategoryValue } from "@/app/engine/onboarding/livePreview";
import type { LiveOnboardingPreview, LivePreviewMapContext, OnboardingCampus } from "@/app/engine/onboarding/types";
import type { MapCategory, ZoneGeometry } from "@/app/engine/types";
import { visiblePreviewDistricts } from "@/app/engine/onboarding/visibleDistricts";

export const ONBOARDING_FILL_ID = "onboarding-district-fill";
const HATCH_IMAGE = "onboarding-over-limit-hatch";

function DistrictLabel({ item, rank }: { item: LiveOnboardingPreview["districts"][number]; rank: number | null }) {
    return <div className="pointer-events-none flex flex-col items-center gap-1 text-center font-sans text-sm font-bold leading-tight text-ink [text-shadow:0_1px_2px_var(--color-base-100),0_-1px_2px_var(--color-base-100)]">
        {rank !== null && <span className="flex size-7 items-center justify-center rounded-full border-2 border-base-100 bg-primary font-body text-sm text-primary-content shadow-overlay">{rank}</span>}
        <span className="max-w-28">{item.district.zone_name}</span>
    </div>;
}

function DestinationMarker({ item, selected, onClick }: { item: OnboardingCampus; selected: boolean; onClick: () => void }) {
    return <Marker longitude={item.center[0]} latitude={item.center[1]} anchor="bottom-left">
        <button type="button" aria-label={`Pilih kampus ${item.name}`} aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onClick(); }} data-hci-region="onboarding-map-destination"
            className={`flex min-h-11 max-w-56 items-center gap-2 rounded-full border px-3 py-2 font-body text-xs font-semibold shadow-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary bg-primary text-primary-content" : "border-rule bg-base-100 text-ink"}`}>
            {selected ? <Check aria-hidden="true" className="size-3.5 shrink-0" /> : <GraduationCap aria-hidden="true" className="size-3.5 shrink-0 text-primary" />}
            <span className="truncate">{item.name}</span>
        </button>
    </Marker>;
}

export default function OnboardingMapLayers({ context, preview, geometry, mapRef, mapLoaded, category, selectedDistrictId,
    onDestination, onSelectDistrict }: {
    context: LivePreviewMapContext; preview: LiveOnboardingPreview; geometry: ZoneGeometry | null; mapRef: RefObject<MapRef | null>;
    mapLoaded: boolean; category: MapCategory | null; selectedDistrictId: string | null;
    onDestination: (item: OnboardingCampus) => void; onSelectDistrict: (id: string) => void;
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
        zone_id: string; eligible: boolean | null; value: number | null; is_sample: boolean;
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
            } }];
        }) ?? [] };
    }, [preview, geometry, category]);

    const valueRange = useMemo(() => {
        const values = districtData.features.flatMap(({ properties }) => properties.value === null ? [] : [properties.value]);
        return values.length ? [Math.min(...values), Math.max(...values)] as const : null;
    }, [districtData]);
    const bands = useMemo(() => valueRange && valueRange[0] === valueRange[1] ? [valueRange[0], valueRange[0] + 1] as const : valueRange, [valueRange]);
    const showFilled = step === 2 || step === 4;
    const hideExcluded = showFilled && context.overBudget === "hide";
    const eligibleFilter: FilterSpecification = hideExcluded ? ["!=", ["get", "eligible"], false] : ["all"];
    if (!preview.available) return null;
    return <>
        <Source id="onboarding-districts" type="geojson" data={districtData}>
            <Layer id={ONBOARDING_FILL_ID} type="fill" beforeId="building-3d" filter={eligibleFilter}
                paint={{
                    "fill-color": completed && category !== "summary" && category !== null && bands
                        ? ["case", ["==", ["get", "value"], null], "#DCE3EC", ["interpolate", ["linear"], ["get", "value"], bands[0], "#9ED9EB", bands[1], "#006AD8"]]
                        : ["case", ["==", ["get", "eligible"], null], "#DCE3EC", "#006AD8"],
                    "fill-opacity": showFilled ? ["case", ["==", ["get", "eligible"], true], 0.22, ["==", ["get", "eligible"], false], 0.08, 0.14] : 0,
                }} />
            {showFilled && !hideExcluded && patternReady && <Layer id="onboarding-over-limit" type="fill" beforeId="building-3d"
                filter={["==", ["get", "eligible"], false]} paint={{ "fill-pattern": HATCH_IMAGE, "fill-opacity": 0.45 }} />}
            <Layer id="onboarding-district-outlines" type="line" beforeId="building-3d" filter={eligibleFilter}
                paint={{ "line-color": ["case", ["==", ["get", "eligible"], true], "#006AD8", ["==", ["get", "eligible"], false], "#5F84B1", "#8995A9"], "line-width": 1.3, "line-opacity": 0.9 }} />
            {selectedDistrictId && <Layer id="onboarding-selected-outline" type="line" beforeId="building-3d"
                filter={hideExcluded ? ["all", ["==", ["get", "zone_id"], selectedDistrictId], ["!=", ["get", "eligible"], false]] : ["==", ["get", "zone_id"], selectedDistrictId]}
                paint={{ "line-color": "#21297C", "line-width": 3, "line-opacity": 1 }} />}
        </Source>
        {visiblePreviewDistricts(preview, showFilled).flatMap((item) => item.district.center ? [<Marker key={item.district.zone_id} longitude={item.district.center[0]} latitude={item.district.center[1]} anchor="center">
            {completed ? <button type="button" aria-label={`${item.district.zone_name}${item.rank ? `, peringkat ${item.rank}` : item.eligible === false ? ", di luar batas" : ", belum terverifikasi"}`} onClick={(event) => { event.stopPropagation(); onSelectDistrict(item.district.zone_id); }} className="min-h-11 min-w-11 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-primary"><DistrictLabel item={item} rank={item.rank} /></button>
                : <DistrictLabel item={item} rank={null} />}
        </Marker>] : [])}
        {(step === 1 || step === 3) && context.goal !== "work" && preview.destinations.map((item) => <DestinationMarker
            key={item.id} item={item} selected={context.destinationId === item.id} onClick={() => onDestination(item)} />)}
        {context.destinationPoint && <Marker longitude={context.destinationPoint[0]} latitude={context.destinationPoint[1]} anchor="center">
            <span className="pointer-events-none flex size-5 items-center justify-center rounded-full border-2 border-base-100 bg-primary shadow-overlay"><span className="size-1.5 rounded-full bg-base-100" /></span>
        </Marker>}
    </>;
}
