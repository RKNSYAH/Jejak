"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/maplibre";
import { Check } from "lucide-react";
import type { FeatureCollection, Polygon } from "geojson";
import type { FilterSpecification } from "maplibre-gl";
import { availableDestinations, displayStep } from "@/app/engine/onboarding/preview";
import { getDestination } from "@/app/engine/onboarding/demoData";
import type { DistrictRecommendation, FormSession, FormStep, OnboardingPreview } from "@/app/engine/onboarding/types";
import type { MapCategory, ZoneGeometry } from "@/app/engine/types";

export const ONBOARDING_FILL_ID = "onboarding-district-fill";
const HATCH_IMAGE = "onboarding-over-limit-hatch";

function commuteCircle(center: [number, number], radiusKm: number): Polygon {
    const coordinates = Array.from({ length: 65 }, (_, index) => {
        const angle = index / 64 * 2 * Math.PI;
        return [center[0] + Math.cos(angle) * radiusKm / (111.32 * Math.cos(center[1] * Math.PI / 180)),
            center[1] + Math.sin(angle) * radiusKm / 110.57];
    });
    coordinates[64] = coordinates[0];
    return { type: "Polygon", coordinates: [coordinates] };
}

function DistrictLabel({ item, step }: { item: DistrictRecommendation; step: FormStep }) {
    return <div className="pointer-events-none flex flex-col items-center gap-1 text-center font-sans text-sm font-bold leading-tight text-ink [text-shadow:0_1px_2px_var(--color-base-100),0_-1px_2px_var(--color-base-100)]">
        {step === 4 && item.rank && <span className="flex size-7 items-center justify-center rounded-full border-2 border-base-100 bg-primary font-body text-sm text-primary-content shadow-overlay">{item.rank}</span>}
        <span className="max-w-24">{item.district.name}</span>
    </div>;
}

// Onboarding map value (0-100) for each category; mobility is unknown without a destination.
function categoryValue(item: DistrictRecommendation, category: MapCategory | null): number | null {
    switch (category) {
        case "employment": return item.district.career;
        case "education": return item.district.education;
        case "housing": return Math.max(0, 100 - item.rent / 60_000);
        case "mobility": return item.commuteMinutes === null ? null : Math.max(0, 100 - item.commuteMinutes);
        default: return item.score;
    }
}

export default function OnboardingMapLayers({ session, preview, geometry, mapRef, mapLoaded, category, onDestination, onSelectDistrict }: {
    session: FormSession; preview: OnboardingPreview; geometry: ZoneGeometry | null; mapRef: RefObject<MapRef | null>;
    mapLoaded: boolean; category: MapCategory | null; onDestination: (id: string) => void; onSelectDistrict: (id: string) => void;
}) {
    const [patternReady, setPatternReady] = useState(false);
    const step = displayStep(session);
    const completed = session.status === "completed";
    const answers = session.answers;
    const destination = getDestination(answers.destinationId);
    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!mapLoaded || !map) return;
        function registerPattern() {
            if (!map!.hasImage(HATCH_IMAGE)) {
                const size = 12;
                const data = new Uint8Array(size * size * 4);
                for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
                    const offset = (y * size + x) * 4;
                    data.set([33, 41, 124, (x + y) % size < 2 ? 100 : 0], offset);
                }
                map!.addImage(HATCH_IMAGE, { width: size, height: size, data });
            }
        }
        registerPattern();
        const timer = window.setTimeout(() => setPatternReady(true), 0);
        const onStyleImageMissing = (event: { id: string }) => { if (event.id === HATCH_IMAGE) registerPattern(); };
        map.on("styleimagemissing", onStyleImageMissing);
        return () => { window.clearTimeout(timer); map.off("styleimagemissing", onStyleImageMissing); };
    }, [mapLoaded, mapRef]);

    const districtData = useMemo(() => {
        const byId = new Map(preview.districts.map((item) => [item.district.id, item]));
        return { type: "FeatureCollection" as const, features: geometry?.features.flatMap((feature) => {
            const item = byId.get(feature.properties.zone_id);
            if (!item) return [];
            return [{ ...feature, properties: { ...feature.properties, eligible: item.eligible, value: categoryValue(item, category), is_sample: true } }];
        }) ?? [] };
    }, [preview, geometry, category]);

    const modeRadius = { transit: 9, motorcycle: 13, car: 10, active: 4 }[answers.transport];
    const departureRadius = { morning: 1, midday: 1.25, evening: 0.9, flexible: 1.1 }[answers.departure];
    const bands = useMemo<FeatureCollection<Polygon, { minutes: number }>>(() => ({
        type: "FeatureCollection", features: destination ? [15, 30, 45, 60].filter((minutes) => minutes <= answers.commuteMinutes).map((minutes) => ({
            type: "Feature", geometry: commuteCircle(destination.center, minutes / 60 * modeRadius * departureRadius), properties: { minutes },
        })) : [],
    }), [destination, answers.commuteMinutes, modeRadius, departureRadius]);

    if (!preview.available) return null;
    const showFilled = step === 2 || step === 4;
    const hideExcluded = showFilled && answers.overBudget === "hide";
    const displayedDistricts = preview.districts.filter((item) => !hideExcluded || item.eligible);
    const eligibleFilter: FilterSpecification = hideExcluded ? ["==", ["get", "eligible"], true] : ["all"];
    return <>
        <Source id="onboarding-districts" type="geojson" data={districtData}>
            <Layer id={ONBOARDING_FILL_ID} type="fill" beforeId="building-3d"
                filter={eligibleFilter}
                paint={{ "fill-color": completed && category !== "summary" && category !== null
                    ? ["interpolate", ["linear"], ["coalesce", ["get", "value"], 0], 0, "#9ED9EB", 100, "#006AD8"] : "#006AD8",
                    "fill-opacity": showFilled ? ["case", ["get", "eligible"], ["case", ["==", ["get", "value"], null], 0, 0.2], 0.015] : 0 }} />
            {showFilled && !hideExcluded && patternReady && <Layer id="onboarding-over-limit" type="fill" beforeId="building-3d"
                filter={["==", ["get", "eligible"], false]} paint={{ "fill-pattern": HATCH_IMAGE, "fill-opacity": 0.65 }} />}
            <Layer id="onboarding-district-outlines" type="line" beforeId="building-3d" filter={eligibleFilter}
                paint={{ "line-color": showFilled ? ["case", ["get", "eligible"], "#006AD8", "#5F84B1"] : "#5F84B1", "line-width": 1.3, "line-opacity": 0.9 }} />
        </Source>
        {step === 3 && destination && <Source id="onboarding-commute-simulation" type="geojson" data={bands}>
            <Layer id="onboarding-commute-fill" type="fill" beforeId="building-3d" filter={["==", ["get", "minutes"], answers.commuteMinutes]}
                paint={{ "fill-color": "#006AD8", "fill-opacity": 0.12 }} />
            <Layer id="onboarding-commute-lines" type="line" beforeId="building-3d" paint={{ "line-color": "#5F84B1", "line-width": 1.5, "line-dasharray": [3, 3] }} />
        </Source>}
        {displayedDistricts.map((item) => <Marker key={item.district.id} longitude={item.district.center[0]} latitude={item.district.center[1]} anchor="center">
            {completed ? <button type="button" aria-label={`${item.district.name}${item.rank ? `, peringkat ${item.rank}` : ", di luar batas"}`} onClick={(event) => { event.stopPropagation(); onSelectDistrict(item.district.id); }} className="min-h-11 min-w-11 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-primary"><DistrictLabel item={item} step={step} /></button>
                : <DistrictLabel item={item} step={step} />}
        </Marker>)}
        {(step === 1 || step === 3) && availableDestinations(answers.goal).map((item) => {
            const selected = step === 3 && answers.destinationId === item.id;
            return <Marker key={item.id} longitude={item.center[0]} latitude={item.center[1]} anchor="bottom-left">
                <button type="button" aria-label={`Pilih ${item.name}`} aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onDestination(item.id); }} data-hci-region="onboarding-map-destination"
                    className={`flex min-h-11 items-center gap-2 rounded-full border px-3 py-2 font-body text-xs font-semibold shadow-overlay focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${selected ? "border-primary bg-primary text-primary-content" : "border-rule bg-base-100 text-ink"}`}>
                    {selected ? <Check aria-hidden="true" className="size-3.5" /> : <span aria-hidden="true" className="size-3 rounded-full border-2 border-base-100 bg-primary ring-4 ring-primary/15" />}{item.name}
                </button>
            </Marker>;
        })}
        {step === 3 && destination && bands.features.map((feature) => {
            const edge = feature.geometry.coordinates[0][7];
            return <Marker key={feature.properties.minutes} longitude={edge[0]} latitude={edge[1]} anchor="center"><span className="pointer-events-none rounded bg-base-100/90 px-1 py-0.5 font-body text-xs font-semibold text-ink">{feature.properties.minutes} mnt</span></Marker>;
        })}
    </>;
}
