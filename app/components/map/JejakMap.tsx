"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import MapView, {
    Layer,
    Popup,
    Source,
    type MapMouseEvent,
    type MapRef,
} from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { FilterSpecification, StyleSpecification } from "maplibre-gl";

import jejakStyle from "@/public/jejak_light_openfreemap.json";
import { urbanist, sourceSans3 } from "@/app/fonts";
import {
    getZoneGeometry,
    getZoneIntelligence,
    MOCK_ZONE_INTELLIGENCE,
} from "@/app/datas/mockData";
import { createZoneLayerData } from "./zoneLayerData";
import {
    ZONE_FILL_LAYER,
    ZONE_HOVER_LAYER,
    ZONE_HOVER_OUTLINE_LAYER,
    ZONE_OUTLINE_LAYER,
    ZONE_SELECTED_LAYER,
    ZONE_SELECTED_OUTLINE_LAYER,
} from "./zoneLayers";
import type { ZoneGeometry } from "@/app/datas/mockData";
import type { ZoneIntelligenceResponse } from "@/app/engine/types";
import ZoneIntelligencePanel from "./ZoneIntelligencePanel";
maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const DISPLAY_LAYERS = new Set([
    "place_city",
    "place_town",
    "state",
    "country_1",
    "country_2",
    "country_3",
]);

type ZoneSelection = {
    id: string;
    name: string;
    intelligence: ZoneIntelligenceResponse;
};

type HoveredZone = ZoneSelection & {
    longitude: number;
    latitude: number;
};

function zoneFilter(zoneId: string): FilterSpecification {
    return ["==", ["get", "zone_id"], zoneId];
}

export default function JejakMap() {
    const mapRef = useRef<MapRef>(null);
    const [zoneGeometry, setZoneGeometry] = useState<ZoneGeometry>({
        type: "FeatureCollection",
        features: [],
    });
    const [hoveredZone, setHoveredZone] = useState<HoveredZone | null>(null);
    const [selectedZone, setSelectedZone] = useState<ZoneSelection | null>(
        null,
    );
    useEffect(() => {
        async function fetchZoneGeometry() {
            try {
                const geometry = await getZoneGeometry("Pancoran");
                setZoneGeometry(geometry);
            } catch (error) {
                console.error("Error fetching zone geometry:", error);
            }
        }

        fetchZoneGeometry();
    }, []);

    const zoneLayerData = useMemo(
        () =>
            createZoneLayerData(
                zoneGeometry,
                MOCK_ZONE_INTELLIGENCE,
            ),
        [zoneGeometry],
    );

    function getZoneSelection(event: MapMouseEvent): ZoneSelection | null {
        // event.features can be empty on mobile tap if touch precision misses
        // the layer slightly — fall back to a manual point query with a touch
        // radius so nearby features are still found.
        const feature =
            event.features?.[0] ??
            mapRef.current
                ?.queryRenderedFeatures(event.point, {
                    layers: [ZONE_FILL_LAYER.id as string],
                })
                ?.find(Boolean);

        const id = String(feature?.properties?.zone_id ?? "");
        const name = String(feature?.properties?.zone_name ?? id);
        const intelligence = getZoneIntelligence(id);

        if (!id || !intelligence) {
            return null;
        }

        return { id, name, intelligence };
    }

    function handleZoneClick(event: MapMouseEvent) {
        const zone = getZoneSelection(event);
        if (!zone) {
            return;
        }

        setSelectedZone(zone);
        console.log("Selected zone:", zone);
        setHoveredZone(null);
    }

    function handleZoneMouseMove(event: MapMouseEvent) {
        const zone = getZoneSelection(event);
        if (!zone) {
            return;
        }

        setHoveredZone({
            ...zone,
            longitude: event.lngLat.lng,
            latitude: event.lngLat.lat,
        });
    }

    function handleZoneMouseLeave() {
        mapRef.current?.getCanvas().style.removeProperty("cursor");
        setHoveredZone(null);
    }

    function handleZoneMouseEnter() {
        mapRef.current?.getCanvas().style.setProperty("cursor", "pointer");
    }

    function handleAlternativeSelection(zone: ZoneSelection) {
        setHoveredZone(null);
        setSelectedZone(zone);
    }

    const mapStyle = useMemo(() => {
        const style = structuredClone(jejakStyle) as StyleSpecification;

        for (const layer of style.layers) {
            if (
                layer.type !== "symbol" ||
                !layer.layout ||
                !("text-font" in layer.layout)
            ) {
                continue;
            }

            layer.layout["text-font"] = [
                DISPLAY_LAYERS.has(layer.id)
                    ? urbanist.style.fontFamily
                    : sourceSans3.style.fontFamily,
            ];
        }

        return style;
    }, []);

    return (
        <div className="relative h-full min-h-0 overflow-hidden">
            <MapView
                ref={mapRef}
                initialViewState={{
                    longitude: 106.8456,
                    latitude: -6.2088,
                    zoom: 11,
                }}
                rotateSpeed={0.4}
                aroundCenter={false}
                style={{
                    width: "100%",
                    height: "100%",
                }}
                mapStyle={mapStyle}
                interactiveLayerIds={[ZONE_FILL_LAYER.id as string]}
                onClick={handleZoneClick}
                onMouseEnter={handleZoneMouseEnter}
                onMouseMove={handleZoneMouseMove}
                onMouseLeave={handleZoneMouseLeave}
            >
                <Source id="zone-intelligence" type="geojson" data={zoneLayerData}>
                    <Layer {...ZONE_FILL_LAYER} />
                    <Layer {...ZONE_OUTLINE_LAYER} />

                    {/* Hover Layers */}
                    {hoveredZone && hoveredZone.id !== selectedZone?.id && (
                        <Layer
                            {...ZONE_HOVER_LAYER}
                            filter={zoneFilter(hoveredZone.id)}
                        />
                    )}
                    {hoveredZone && hoveredZone.id !== selectedZone?.id && (
                        <Layer
                            {...ZONE_HOVER_OUTLINE_LAYER}
                            filter={zoneFilter(hoveredZone.id)}
                        />
                    )}

                    {/* Selected Layers */}
                    {selectedZone && (
                        <Layer
                            {...ZONE_SELECTED_LAYER}
                            filter={zoneFilter(selectedZone.id)}
                        />
                    )}
                    {selectedZone && (
                        <Layer
                            {...ZONE_SELECTED_OUTLINE_LAYER}
                            filter={zoneFilter(selectedZone.id)}
                        />
                    )}
                </Source>


                {hoveredZone && hoveredZone.id !== selectedZone?.id && (
                    <Popup
                        longitude={hoveredZone.longitude}
                        latitude={hoveredZone.latitude}
                        anchor="bottom"
                        offset={12}
                        closeButton={false}
                        closeOnClick={false}
                        className="zone-hover-popup"
                    >
                        <div
                            role="tooltip"
                            className="min-w-44 cursor-pointer font-body"
                            onClick={() => handleAlternativeSelection(hoveredZone)}
                        >
                            <p className="font-sans text-base font-bold text-ink">
                                {hoveredZone.name}
                            </p>
                            <p className="mt-0.5 text-xs text-ink-muted">
                                Software and IT services
                            </p>
                            <dl className="mt-3 space-y-1 text-xs">
                                <div className="flex justify-between gap-3">
                                    <dt className="text-ink-muted">
                                        Sector presence
                                    </dt>
                                    <dd className="font-semibold text-ink">
                                        {hoveredZone.intelligence.snapshot.indices.sector_presence}/100
                                    </dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt className="text-ink-muted">
                                        Active openings
                                    </dt>
                                    <dd className="font-semibold text-ink">
                                        {hoveredZone.intelligence.snapshot.active_openings}
                                    </dd>
                                </div>
                            </dl>
                            <p className="mt-3 border-t border-rule pt-2 text-[0.6875rem] text-ink-muted">
                                Click for details
                            </p>
                        </div>
                    </Popup>
                )}
            </MapView>
            <div className="absolute bottom-4 left-4 max-w-64 rounded-lg bg-white/80 p-3 shadow-md backdrop-blur-sm">
                <p className="font-body text-xs font-semibold text-ink-muted">
                    Sector presence based on available data and other sources.
                </p>
                <div className="mt-3 h-2 rounded-full bg-[linear-gradient(to_right,#DCEEFF,#71B9EF,#098DEC)]" aria-hidden="true" />
                <div className="mt-1 flex justify-between font-body text-xs text-ink-muted">
                    <span>0</span>
                    <span>100</span>
                </div>
            </div>

            {selectedZone && (
                <ZoneIntelligencePanel
                    zoneName={selectedZone.name}
                    intelligence={selectedZone.intelligence}
                    onClose={() => setSelectedZone(null)}
                />
            )}
        </div>
    );
}
