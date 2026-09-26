"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView, { AttributionControl, Layer, Popup, Source, type MapMouseEvent, type MapRef } from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";

import jejakStyle from "@/public/jejak_light_openfreemap.json";
import { urbanist, sourceSans3 } from "@/app/fonts";
import type { MapCategory, Zone, ZoneGeometry } from "@/app/engine/types";
import { getGeometryBounds } from "@/app/engine/lib/zoneGeometry";
import { createZoneLayerData } from "./zoneLayerData";
import { getZoneFillLayer, ZONE_FILL_LAYER, ZONE_HOVER_OUTLINE_LAYER, ZONE_OUTLINE_LAYER, ZONE_SELECTED_CASING_LAYER, ZONE_SELECTED_OUTLINE_LAYER } from "./zoneLayers";
import { useZoneIntelligence } from "./useZoneIntelligence";
import Buildings3dToggle from "./Buildings3dToggle";
import MapControls from "./MapControls";
import MapLegend from "./MapLegend";
import ZoneIntelligencePanel from "./ZoneIntelligencePanel";
import MapBottomSheet, { type MapBottomSheetHandle } from "./MapBottomSheet";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const DISPLAY_LAYERS = new Set(["place_city", "place_town", "state", "country_1", "country_2", "country_3"]);
const BUILDINGS_3D_LAYER = "building-3d";

export default function JejakMap() {
    const mapRef = useRef<MapRef>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const bottomSheetRef = useRef<MapBottomSheetHandle>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [category, setCategory] = useState<MapCategory | null>("summary");
    const [hoveredZone, setHoveredZone] = useState<{ id: string; longitude: number; latitude: number } | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [is3dEnabled, setIs3dEnabled] = useState(true);
    const orbitFrameRef = useRef<number | null>(null);
    const orbitingRef = useRef(false);
    const orbitPendingRef = useRef(false);
    const orbitMoveEndRef = useRef<(() => void) | null>(null);
    const state = useZoneIntelligence();
    const selectedId = state.selectedZone?.zone_id;
    const selectedGeometry = selectedId ? state.geometryByZone[selectedId] : undefined;
    const selectedResult = selectedId ? state.results[selectedId] : undefined;

    const layerData = useMemo(() => {
        const geometry: ZoneGeometry = {
            type: "FeatureCollection",
            features: Object.values(state.geometryByZone).flatMap((value) => value.features),
        };
        return createZoneLayerData(geometry, state.results, category ?? "summary");
    }, [state.geometryByZone, state.results, category]);

    const campusData = useMemo(() => ({
        type: "FeatureCollection" as const,
        features: [...new Set([...Object.keys(state.geometryByZone), ...(selectedId ? [selectedId] : [])])].flatMap((id) =>
            (state.results[id]?.places ?? []).filter((place) => place.category === "campus").map((place) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [place.longitude, place.latitude] },
                properties: { name: place.name, is_sample: place.is_sample },
            }))),
    }), [state.geometryByZone, state.results, selectedId]);

    const pendingSearchFlyRef = useRef<{
        zoneId: string
        started: boolean
    } | null>(null);

    const panelOpenTimer = useRef<number | null>(null);

    function cancelPendingSearchFly() {
        if (pendingSearchFlyRef.current) {
            pendingSearchFlyRef.current = null;
            if (panelOpenTimer.current) {
                window.clearTimeout(panelOpenTimer.current);
                panelOpenTimer.current = null;
            }
        }
    }

    function selectZone(zone: Zone) {
        bottomSheetRef.current?.collapse();
        setHoveredZone(null);
        cancelPendingSearchFly();
        const mobile = window.matchMedia("(max-width: 767px)").matches;
        if (mobile) {
            pendingSearchFlyRef.current = { zoneId: zone.zone_id, started: false };
            setMobilePanelOpen(false);
        } else {
            setMobilePanelOpen(true);
        }

        void state.selectZone(zone);
    }

    const stopOrbit = useCallback(() => {
        if (orbitMoveEndRef.current) {
            mapRef.current?.off("moveend", orbitMoveEndRef.current);
            orbitMoveEndRef.current = null;
        }
        orbitingRef.current = false;
        orbitPendingRef.current = false;

        if (orbitFrameRef.current !== null) {
            cancelAnimationFrame(orbitFrameRef.current);
            orbitFrameRef.current = null;
        }
    }, []);

    const startOrbit = useCallback(() => {
        if (
            orbitingRef.current ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) return;

        orbitingRef.current = true;
        let previousTime: number | null = null;

        function orbitStep(time: number) {
            const map = mapRef.current;
            if (!orbitingRef.current || !map) return;

            if (previousTime !== null) {
                const elapsed = Math.min(time - previousTime, 50);
                map.setBearing(map.getBearing() + elapsed * -0.003);
            }

            previousTime = time;
            if (orbitingRef.current) {
                orbitFrameRef.current = requestAnimationFrame(orbitStep);
            }
        }

        orbitFrameRef.current = requestAnimationFrame(orbitStep);
    }, []);

    useEffect(() => {
        stopOrbit();
        if (!mapLoaded || !selectedGeometry) return;
        const bounds = getGeometryBounds(selectedGeometry);
        if (!bounds) return;
        const desktop = window.matchMedia("(min-width: 768px)").matches;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const panelWidth = mapContainerRef.current?.querySelector<HTMLElement>("#zone-intelligence-desktop")?.getBoundingClientRect().width ?? 420;
        const pendingSearch = pendingSearchFlyRef.current;
        const shouldDefer = !desktop && pendingSearch?.zoneId === selectedId
        if (shouldDefer && pendingSearch) {
            pendingSearch.started = true;
            panelOpenTimer.current = window.setTimeout(() => {
                const current = pendingSearchFlyRef.current;
                if (current?.zoneId === selectedId) {
                    pendingSearchFlyRef.current = null;
                    panelOpenTimer.current = null;
                    setMobilePanelOpen(true);
                }
            }, reducedMotion ? 0 : 2500)
        }
        orbitPendingRef.current = !reducedMotion;
        mapRef.current?.fitBounds(bounds, {
            padding: desktop
                ? {
                    top: 180,
                    right: Math.ceil(panelWidth) + 16,
                    bottom: 70,
                    left: 40,
                }
                : 40,
            maxZoom: 15,
            animate: !reducedMotion,
            pitch: 50,
            bearing: 0,
            duration: reducedMotion ? 0 : 1000,
        });
        if (!reducedMotion) {
            const onFitComplete = () => {
                orbitMoveEndRef.current = null;
                startOrbit();
            };
            orbitMoveEndRef.current = onFitComplete;
            mapRef.current?.once("moveend", onFitComplete);
        }
    }, [selectedGeometry, selectedId, mapLoaded, stopOrbit, startOrbit]);

    useEffect(() => () => stopOrbit(), [stopOrbit]);

    const mapStyle = useMemo(() => {
        const style = structuredClone(jejakStyle) as StyleSpecification;
        for (const layer of style.layers) {
            if (layer.type !== "symbol" || !layer.layout || !("text-font" in layer.layout)) continue;
            layer.layout["text-font"] = [DISPLAY_LAYERS.has(layer.id) ? urbanist.style.fontFamily : sourceSans3.style.fontFamily];
        }
        return style;
    }, []);

    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!mapLoaded || !map?.getLayer(BUILDINGS_3D_LAYER)) return;
        map.setLayoutProperty(BUILDINGS_3D_LAYER, "visibility", is3dEnabled ? "visible" : "none");
    }, [mapLoaded, is3dEnabled]);

    function getEventZone(event: MapMouseEvent) {
        const feature = event.features?.[0] ?? mapRef.current?.queryRenderedFeatures([
            [event.point.x - 6, event.point.y - 6], [event.point.x + 6, event.point.y + 6],
        ], { layers: [ZONE_FILL_LAYER.id] })[0];
        return state.catalog.zones.find((zone) => zone.zone_id === feature?.properties?.zone_id);
    }

    const hoveredMetadata = state.catalog.zones.find((zone) => zone.zone_id === hoveredZone?.id);
    const hoveredValue = hoveredZone ? layerData.features.find((feature) => feature.properties.zone_id === hoveredZone.id)?.properties.value : null;

    return (
        <div ref={mapContainerRef} className="relative h-full min-h-0 overflow-hidden">
            <MapView ref={mapRef} initialViewState={{ longitude: 106.8456, latitude: -6.2088, zoom: 11 }}
                rotateSpeed={0.4} aroundCenter={false} style={{ width: "100%", height: "100%" }}
                mapStyle={mapStyle} attributionControl={false} interactiveLayerIds={[ZONE_FILL_LAYER.id]} cursor={hoveredZone ? "pointer" : "grab"}
                onLoad={() => setMapLoaded(true)}
                onClick={(event) => {
                    const zone = getEventZone(event);
                    if (zone) {
                        bottomSheetRef.current?.collapse();
                        cancelPendingSearchFly();
                        setMobilePanelOpen(true);
                        setHoveredZone(null);
                        void state.selectZone(zone);
                    }
                }}
                onMouseDown={() => stopOrbit()}
                onTouchStart={() => stopOrbit()}
                onMouseMove={(event) => {
                    const zone = getEventZone(event);
                    setHoveredZone(zone ? { id: zone.zone_id, longitude: event.lngLat.lng, latitude: event.lngLat.lat } : null);
                }}
                onMoveEnd={() => {
                    const pending = pendingSearchFlyRef.current
                    if (!pending?.started) return
                    if (pending.zoneId !== state.selectedZone?.zone_id) return
                    pendingSearchFlyRef.current = null;
                    if (panelOpenTimer.current !== null) {
                        window.clearTimeout(panelOpenTimer.current);
                    }
                    panelOpenTimer.current = window.setTimeout(() => {
                        panelOpenTimer.current = null;
                        setMobilePanelOpen(true);
                    }, 120)
                }}
                onMouseLeave={() => setHoveredZone(null)}>
                <AttributionControl position="bottom-left" compact customAttribution="Boundaries: BIG RBI" />
                <Source id="region-data" type="geojson" data={layerData}>
                    <Layer {...getZoneFillLayer(category ?? "summary")} beforeId={BUILDINGS_3D_LAYER} />
                    <Layer {...ZONE_OUTLINE_LAYER} beforeId={BUILDINGS_3D_LAYER} />
                    {hoveredZone && hoveredZone.id !== selectedId && <Layer {...ZONE_HOVER_OUTLINE_LAYER} beforeId={BUILDINGS_3D_LAYER} filter={["==", ["get", "zone_id"], hoveredZone.id]} />}
                    {selectedId && <Layer {...ZONE_SELECTED_CASING_LAYER} beforeId={BUILDINGS_3D_LAYER} filter={["==", ["get", "zone_id"], selectedId]} />}
                    {selectedId && <Layer {...ZONE_SELECTED_OUTLINE_LAYER} beforeId={BUILDINGS_3D_LAYER} filter={["==", ["get", "zone_id"], selectedId]} />}
                </Source>
                {category === "education" && <Source id="region-campuses" type="geojson" data={campusData}>
                    <Layer id="region-campus-points" type="circle" paint={{ "circle-radius": 7, "circle-color": "#098DEC", "circle-stroke-width": 2, "circle-stroke-color": "#080935" }} />
                </Source>}
                {hoveredZone && hoveredMetadata && hoveredZone.id !== selectedId && <Popup longitude={hoveredZone.longitude} latitude={hoveredZone.latitude}
                    anchor="bottom" offset={12} closeButton={false} closeOnClick={false} className="zone-hover-popup">
                    <div role="tooltip" className="min-w-44 font-body">
                        <p className="font-sans text-base font-bold text-on-ink">{hoveredMetadata.zone_name}</p>
                        <p className="mt-1 text-xs text-on-ink-muted">{state.catalog.zones.find((zone) => zone.zone_id === hoveredZone.id)?.is_sample ? "Sample data" : "Region data"}</p>
                        {category === "summary" && <p className="mt-3 text-sm">Wage-to-rent ratio: <span className="font-semibold tabular-nums text-primary">{hoveredMetadata.wage_to_rent_ratio === null ? "Unavailable" : `${hoveredMetadata.wage_to_rent_ratio.toLocaleString("id-ID")}×`}</span></p>}
                        {category && category !== "summary" && <p className="mt-3 text-sm">{category}: <span className="font-semibold tabular-nums text-primary">{hoveredValue ?? "Unavailable"}</span></p>}
                        <p className="mt-2 text-xs text-on-ink-muted">Select the zone for details</p>
                    </div>
                </Popup>}
            </MapView>

            <MapControls
                zones={state.catalog.zones}
                loading={state.catalogLoading}
                error={state.catalogError}
                hasActiveRegionLayers={state.recommendationsLoading || !!selectedId || layerData.features.length > 0 || campusData.features.length > 0}
                onRetry={state.retryCatalog}
                recommendationsLoading={state.recommendationsLoading}
                recommendationsError={state.recommendationsError}
                onRetryRecommendations={state.retryRecommendations}
                category={category}
                onCategoryChange={(next) => {
                    setCategory(next);
                    if (next === "summary") state.restoreRecommendations();
                }}
                onSelect={selectZone}
                onReset={() => {
                    setHoveredZone(null);
                    cancelPendingSearchFly();
                    setMobilePanelOpen(false);
                    setCategory(null);
                    state.resetMap();
                }} />
            <div className="absolute bottom-8 left-4 z-100 flex items-center gap-2 font-body">
                <Buildings3dToggle enabled={is3dEnabled} onToggle={() => setIs3dEnabled((enabled) => !enabled)} />
                {(layerData.features.length > 0 || (category === "education" && campusData.features.length > 0)) && <MapLegend category={category ?? "summary"} isSample={state.catalog.is_sample} />}
            </div>
            {state.selectedZone && (
                <ZoneIntelligencePanel
                    zoneName={state.selectedZone.zone_name}
                    details={selectedResult ?? null}
                    category={category ?? "summary"}
                    isSample={selectedResult?.is_sample ?? state.catalog.zones.find((zone) => zone.zone_id === selectedId)?.is_sample ?? false}
                    loading={state.loading}
                    error={state.error}
                    geometryMissing={selectedGeometry?.features.length === 0}
                    mobileOpen={mobilePanelOpen}
                    onRetry={() => {
                        if (state.selectedZone) {
                            void state.selectZone(state.selectedZone, true);
                        }
                    }}
                    onClose={() => {
                        cancelPendingSearchFly();
                        setMobilePanelOpen(true);
                        state.closeSelection();
                    }} />
            )}
            <MapBottomSheet ref={bottomSheetRef} zones={state.catalog.zones} onSelect={selectZone} />
        </div>
    );
}
