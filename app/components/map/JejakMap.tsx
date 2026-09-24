"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MapView, { AttributionControl, Layer, Popup, Source, type MapMouseEvent, type MapRef } from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";

import jejakStyle from "@/public/jejak_light_openfreemap.json";
import { urbanist, sourceSans3 } from "@/app/fonts";
import type { ZoneGeometry, ZoneMetric } from "@/app/engine/types";
import { getGeometryBounds } from "@/app/engine/lib/zoneGeometry";
import { createZoneLayerData } from "./zoneLayerData";
import { getZoneFillLayer, ZONE_FILL_LAYER, ZONE_HOVER_OUTLINE_LAYER, ZONE_OUTLINE_LAYER, ZONE_SELECTED_OUTLINE_LAYER } from "./zoneLayers";
import { useZoneIntelligence } from "./useZoneIntelligence";
import MapControls from "./MapControls";
import MapLegend from "./MapLegend";
import ZoneIntelligencePanel from "./ZoneIntelligencePanel";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const DISPLAY_LAYERS = new Set(["place_city", "place_town", "state", "country_1", "country_2", "country_3"]);

export default function JejakMap() {
    const mapRef = useRef<MapRef>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [metric, setMetric] = useState<ZoneMetric>("sector_presence");
    const [hoveredZone, setHoveredZone] = useState<{ id: string; longitude: number; latitude: number } | null>(null);
    const state = useZoneIntelligence();
    const selectedId = state.selectedZone?.zone_id;
    const selectedGeometry = selectedId ? state.geometryByZone[selectedId] : undefined;
    const selectedResult = selectedId ? state.results[selectedId] : undefined;

    const intelligenceByZone = useMemo(() => Object.fromEntries(state.catalog.zones.map((zone) => [
        zone.zone_id, state.results[zone.zone_id] ? state.results[zone.zone_id].intelligence : zone.intelligence,
    ])), [state.catalog.zones, state.results]);

    const layerData = useMemo(() => {
        const geometry: ZoneGeometry = {
            type: "FeatureCollection",
            features: Object.values(state.geometryByZone).flatMap((value) => value.features),
        };
        return createZoneLayerData(geometry, intelligenceByZone);
    }, [state.geometryByZone, intelligenceByZone]);

    useEffect(() => {
        if (!mapLoaded || !selectedGeometry) return;
        const bounds = getGeometryBounds(selectedGeometry);
        if (!bounds) return;
        const desktop = window.matchMedia("(min-width: 768px)").matches;
        const panelWidth = mapContainerRef.current?.querySelector<HTMLElement>("#zone-intelligence-desktop")?.getBoundingClientRect().width ?? 420;
        mapRef.current?.fitBounds(bounds, {
            padding: desktop ? { top: 180, right: Math.ceil(panelWidth) + 16, bottom: 70, left: 40 } : 40,
            maxZoom: 14,
            animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        });
    }, [selectedGeometry, mapLoaded]);

    const mapStyle = useMemo(() => {
        const style = structuredClone(jejakStyle) as StyleSpecification;
        for (const layer of style.layers) {
            if (layer.type !== "symbol" || !layer.layout || !("text-font" in layer.layout)) continue;
            layer.layout["text-font"] = [DISPLAY_LAYERS.has(layer.id) ? urbanist.style.fontFamily : sourceSans3.style.fontFamily];
        }
        return style;
    }, []);

    function getEventZone(event: MapMouseEvent) {
        const feature = event.features?.[0] ?? mapRef.current?.queryRenderedFeatures([
            [event.point.x - 6, event.point.y - 6], [event.point.x + 6, event.point.y + 6],
        ], { layers: [ZONE_FILL_LAYER.id] })[0];
        return state.catalog.zones.find((zone) => zone.zone_id === feature?.properties?.zone_id);
    }

    const hoveredMetadata = state.catalog.zones.find((zone) => zone.zone_id === hoveredZone?.id);
    const hoveredSnapshot = hoveredZone ? intelligenceByZone[hoveredZone.id]?.snapshot : undefined;

    return (
        <div ref={mapContainerRef} className="relative h-full min-h-0 overflow-hidden">
            <MapView ref={mapRef} initialViewState={{ longitude: 106.8456, latitude: -6.2088, zoom: 11 }}
                rotateSpeed={0.4} aroundCenter={false} style={{ width: "100%", height: "100%" }}
                mapStyle={mapStyle} attributionControl={false} interactiveLayerIds={[ZONE_FILL_LAYER.id]} cursor={hoveredZone ? "pointer" : "grab"}
                onLoad={() => setMapLoaded(true)}
                onClick={(event) => {
                    const zone = getEventZone(event);
                    if (zone) { setHoveredZone(null); void state.selectZone(zone); }
                }}
                onMouseMove={(event) => {
                    const zone = getEventZone(event);
                    setHoveredZone(zone ? { id: zone.zone_id, longitude: event.lngLat.lng, latitude: event.lngLat.lat } : null);
                }}
                onMouseLeave={() => setHoveredZone(null)}>
                <AttributionControl position="bottom-left" compact customAttribution="Boundaries: BIG RBI" />
                <Source id="zone-intelligence" type="geojson" data={layerData}>
                    <Layer {...getZoneFillLayer(metric)} />
                    <Layer {...ZONE_OUTLINE_LAYER} />
                    {hoveredZone && hoveredZone.id !== selectedId && <Layer {...ZONE_HOVER_OUTLINE_LAYER} filter={["==", ["get", "zone_id"], hoveredZone.id]} />}
                    {selectedId && <Layer {...ZONE_SELECTED_OUTLINE_LAYER} filter={["==", ["get", "zone_id"], selectedId]} />}
                </Source>
                {hoveredZone && hoveredMetadata && hoveredZone.id !== selectedId && <Popup longitude={hoveredZone.longitude} latitude={hoveredZone.latitude}
                    anchor="bottom" offset={12} closeButton={false} closeOnClick={false} className="zone-hover-popup">
                    <div role="tooltip" className="min-w-44 font-body">
                        <p className="font-sans text-base font-bold text-ink">{hoveredMetadata.zone_name}</p>
                        <p className="mt-1 text-xs text-ink-muted">Software and IT services · Sample data</p>
                        <p className="mt-3 text-sm">{metric === "sector_presence" ? "Sector presence" : "Hiring activity"}: {hoveredSnapshot ? `${hoveredSnapshot.indices[metric]}/100` : "Unavailable"}</p>
                        <p className="mt-1 text-sm">Active openings: {hoveredSnapshot?.active_openings ?? "Unavailable"}</p>
                        <p className="mt-2 text-xs">Select the zone for details</p>
                    </div>
                </Popup>}
            </MapView>

            <MapControls zones={state.catalog.zones} loading={state.catalogLoading} error={state.catalogError}
                metric={metric} onMetricChange={setMetric} onRetry={state.retryCatalog}
                onSelect={(zone) => { setHoveredZone(null); void state.selectZone(zone); }}
                onReset={() => { setHoveredZone(null); state.resetMap(); }} />
            {layerData.features.length > 0 && <MapLegend metric={metric} />}
            {state.selectedZone && <ZoneIntelligencePanel zoneName={state.selectedZone.zone_name}
                intelligence={selectedResult?.intelligence ?? null} isSample={selectedResult?.is_sample ?? state.catalog.is_sample}
                loading={state.loading} error={state.error}
                geometryMissing={selectedGeometry?.features.length === 0}
                onRetry={() => { if (state.selectedZone) void state.selectZone(state.selectedZone); }}
                onClose={state.closeSelection} />}
        </div>
    );
}
