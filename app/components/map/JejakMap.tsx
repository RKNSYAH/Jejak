"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import MapView, { AttributionControl, Layer, Marker, Popup, Source, type MapMouseEvent, type MapRef } from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";

import jejakStyle from "@/public/jejak_light_openfreemap.json";
import { urbanist, sourceSans3 } from "@/app/fonts";
import type { MapCategory, Zone, ZoneGeometry, ZoneSummary } from "@/app/engine/types";
import { getGeometryBounds } from "@/app/engine/lib/zoneGeometry";
import { cellLayers, mapCategories, rentSharePercent } from "./mapMetrics";
import { createCellFillData, createCellGlowData, createCompanyPointData, createZoneLayerData, summarizeCells } from "./zoneLayerData";
import { CELL_GLOW_LAYER, CELL_OUTLINE_LAYER, COMPANY_POINT_LAYER, getCellFillLayer, getMetricRange, getZoneFillLayer, ZONE_FILL_LAYER, ZONE_HOVER_OUTLINE_LAYER, ZONE_OUTLINE_LAYER, ZONE_SELECTED_CASING_LAYER, ZONE_SELECTED_OUTLINE_LAYER } from "./zoneLayers";
import { useLocatedEvidence } from "./useEvidence";
import { useMapCells } from "./useMapCells";
import { useZoneIntelligence } from "./useZoneIntelligence";
import Buildings3dToggle from "./Buildings3dToggle";
import MapControls from "./MapControls";
import { getZoneSearchScope, type ZoneSearchScope } from "./zoneSearch";
import MapChatComposer from "./MapChatComposer";
import MapLegend from "./MapLegend";
import ZoneIntelligencePanel from "./ZoneIntelligencePanel";
import MapBottomSheet, { type MapBottomSheetHandle, type MapBottomSheetState } from "./MapBottomSheet";
import RelocationOnboarding, { type MapPoint, type OfficeChoice } from "./RelocationOnboarding";
import BrandLogo from "../BrandLogo";
import RelocationFormOnboarding from "./onboarding/RelocationFormOnboarding";
import OnboardingMapLayers, { ONBOARDING_FILL_ID } from "./onboarding/OnboardingMapLayers";
import OnboardingPreview from "./onboarding/OnboardingPreview";
import { useFormOnboarding } from "./onboarding/useFormOnboarding";
import { useOnboardingGeometry } from "./onboarding/useOnboardingGeometry";
import { useSavedRelocationProfile } from "./onboarding/useSavedRelocationProfile";
import { prefersReducedMotion } from "./viewport";
import { formatRupiah, transportLabels } from "@/app/engine/onboarding/demoData";
import { evaluateLiveOnboarding, isLiveRecommendationSample, profilePreviewPreferences } from "@/app/engine/onboarding/livePreview";
import { saveRelocationProfile } from "@/app/engine/lib/relocationProfileApi";
import type { StoredRelocationProfile } from "@/app/engine/lib/relocationProfile";
import type { LivePreviewMapContext } from "@/app/engine/onboarding/types";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const DISPLAY_LAYERS = new Set(["place_city", "place_town", "state", "country_1", "country_2", "country_3"]);
const BUILDINGS_3D_LAYER = "building-3d";

export default function JejakMap({ userId }: { userId: string }) {
    const mapRef = useRef<MapRef>(null);
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const bottomSheetRef = useRef<MapBottomSheetHandle>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [searchScope, setSearchScope] = useState<ZoneSearchScope | null>(() => getZoneSearchScope(106.8456, -6.2088));
    const syncSearchScope = useCallback(() => {
        const center = mapRef.current?.getCenter();
        if (center) setSearchScope(getZoneSearchScope(center.lng, center.lat));
    }, []);
    const [mapStyleReady, setMapStyleReady] = useState(false);
    const [category, setCategory] = useState<MapCategory | null>("summary");
    const [cellLayerId, setCellLayerId] = useState<string | null>(null);
    const [hoveredZone, setHoveredZone] = useState<{ id: string; longitude: number; latitude: number } | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const [isMobileViewport, setIsMobileViewport] = useState(false);
    const [isShortViewport, setIsShortViewport] = useState(false);
    const [passwordUpdated, setPasswordUpdated] = useState(false);
    const [desktopPanelWidth, setDesktopPanelWidth] = useState(0);
    const [bottomSheetState, setBottomSheetState] = useState<MapBottomSheetState>({
        height: 30,
        isExpanded: false,
        isDragging: false,
    });
    const [is3dEnabled, setIs3dEnabled] = useState(true);
    const [legacyOnboardingActive, setOnboardingActive] = useState(true);
    const [onboardingMapPicking, setOnboardingMapPicking] = useState(false);
    const [onboardingMapPoint, setOnboardingMapPoint] = useState<MapPoint | null>(null);
    const [onboardingOffice, setOnboardingOffice] = useState<OfficeChoice>("Belum tahu");
    const hoverFrameRef = useRef<number | null>(null);
    const pendingHoverRef = useRef<{ zoneId: string | null; x: number; y: number; longitude: number; latitude: number } | null>(null);
    const clearHover = useCallback(() => {
        if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
        hoverFrameRef.current = null;
        pendingHoverRef.current = null;
        setHoveredZone(null);
    }, []);
    const orbitFrameRef = useRef<number | null>(null);
    const orbitingRef = useRef(false);
    const orbitMoveEndRef = useRef<(() => void) | null>(null);
    const chatComposerRef = useRef<HTMLDivElement>(null);
    const bottomSheetStateRef = useRef(bottomSheetState);
    const profile = useSavedRelocationProfile(userId);
    const form = useFormOnboarding();
    const [storyPreviewProfile, setStoryPreviewProfile] = useState<StoredRelocationProfile | null>(null);
    const [storyPreviewVisible, setStoryPreviewVisible] = useState(false);
    const storyCityCatalog = form.data.cities;
    const storyDataLoading = form.dataLoading;
    const storyDataError = form.dataError;
    const selectPreviewCity = form.selectPreviewCity;
    const storyPreferences = useMemo(() => storyPreviewProfile
        ? profilePreviewPreferences(storyPreviewProfile.profile, storyCityCatalog)
        : null, [storyPreviewProfile, storyCityCatalog]);
    const storyPreview = useMemo(() => storyPreferences
        ? evaluateLiveOnboarding(storyPreferences, 4, form.data)
        : null, [storyPreferences, form.data]);
    const activePreview = storyPreviewVisible ? storyPreview : form.preview;
    const mapContext: LivePreviewMapContext | null = storyPreviewVisible && storyPreferences
        ? { step: 4, completed: true, goal: storyPreferences.goal, overBudget: storyPreferences.overBudget,
            destinationId: storyPreferences.destinationId, destinationPoint: storyPreferences.destinationPoint }
        : form.session ? { step: form.session.status === "completed" ? 4 : form.session.step,
            completed: form.session.status === "completed", goal: form.session.answers.goal,
            overBudget: form.session.answers.overBudget, destinationId: form.session.answers.destinationId,
            destinationPoint: form.session.answers.destinationPoint }
            : null;
    useEffect(() => {
        if (!storyPreviewProfile || storyDataLoading && !storyDataError) return;
        const preferences = profilePreviewPreferences(storyPreviewProfile.profile, storyCityCatalog);
        selectPreviewCity(preferences?.cityId ?? null);
    }, [storyPreviewProfile, storyCityCatalog, storyDataLoading, storyDataError, selectPreviewCity]);
    const [savedProfileRevision, setSavedProfileRevision] = useState<number | null>(null);
    function confirmProfileSaved(saved: StoredRelocationProfile) {
        profile.setSavedProfile(saved);
        setSavedProfileRevision(saved.revision);
    }
    function confirmStoryProfileSaved(saved: StoredRelocationProfile) {
        confirmProfileSaved(saved);
        setStoryPreviewProfile(saved);
        setStoryPreviewVisible(true);
    }
    const [profileReminderDismissed, setProfileReminderDismissed] = useState(false);
    const onboardingActive = legacyOnboardingActive || form.active || !form.ready;
    const prototypeActive = form.previewVisible || storyPreviewVisible;
    // The live map (real regions, panel, legend) shows only outside onboarding and the demo preview.
    const exploring = !onboardingActive && !prototypeActive;
    const onboardingZoneIds = activePreview?.districts.map((item) => item.district.zone_id) ?? [];
    const onboardingGeometry = useOnboardingGeometry(prototypeActive && !!activePreview?.available,
        activePreview?.city?.city_id ?? null, onboardingZoneIds);
    const [onboardingPanelSize, setOnboardingPanelSize] = useState({ width: 0, height: 0 });
    const onboardingCameraRef = useRef<string | null>(null);
    const [sampleSelection, setSampleSelection] = useState<{ cityId: string; id: string } | null>(null);
    const sampleSelected = sampleSelection?.cityId === activePreview?.city?.city_id
        ? activePreview?.districts.find((item) => item.district.zone_id === sampleSelection?.id) : undefined;
    const sampleSelectedId = sampleSelected?.district.zone_id ?? null;
    function setSampleSelectedId(id: string | null) {
        const cityId = activePreview?.city?.city_id;
        setSampleSelection(id && cityId ? { cityId, id } : null);
    }
    const sampleSelectedCenter = useMemo(() => {
        if (!sampleSelected) return null;
        if (sampleSelected.district.center) return sampleSelected.district.center;
        const features = onboardingGeometry.geometry?.features.filter((feature) => feature.properties.zone_id === sampleSelected.district.zone_id) ?? [];
        if (!features.length) return null;
        const bounds = getGeometryBounds({ type: "FeatureCollection", features });
        return bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] as [number, number] : null;
    }, [sampleSelected, onboardingGeometry.geometry]);
    const sampleZones = useMemo<ZoneSummary[]>(() => activePreview?.ranked.map((item) => ({
        zone_id: item.district.zone_id, zone_name: item.district.zone_name,
        city_id: item.district.city_id, city_name: item.district.city_name,
        is_sample: isLiveRecommendationSample(item),
        average_monthly_wage_idr: null, median_monthly_rent_idr: item.rent, population: null, wage_to_rent_ratio: null,
    })) ?? [], [activePreview]);
    const state = useZoneIntelligence(exploring);
    const zonesById = useMemo(() => new Map(state.catalog.zones.map((zone) => [zone.zone_id, zone])), [state.catalog.zones]);
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
    const propertiesByZone = useMemo(() => new Map(layerData.features.map((feature) => [feature.properties.zone_id, feature.properties])), [layerData]);
    const metricRange = useMemo(() => getMetricRange(layerData.features.map((feature) => feature.properties.value)), [layerData]);
    const visibleZoneIds = useMemo(() => [...new Set(layerData.features.map((feature) => feature.properties.zone_id))], [layerData]);
    // H3 cells of the selected district, for categories that have cell layers.
    const cellOptions = useMemo(() => (category ? cellLayers[category] : undefined) ?? [], [category]);
    const activeCellLayer = cellOptions.find((layer) => layer.id === cellLayerId) ?? cellOptions[0] ?? null;
    const cells = useMapCells(prototypeActive ? null : selectedId ?? null, category, activeCellLayer?.kind === "fill");
    const cellList = useMemo(() => cells.data?.cells ?? [], [cells.data]);
    const cellGlowData = useMemo(() => activeCellLayer?.kind === "glow" ? createCellGlowData(cellList, activeCellLayer.metric) : null, [cellList, activeCellLayer]);
    const cellFillData = useMemo(() => activeCellLayer?.kind === "fill" ? createCellFillData(cellList, activeCellLayer.metric) : null, [cellList, activeCellLayer]);
    const cellRange = useMemo(() => getMetricRange(cellFillData?.features.map((feature) => feature.properties.value) ?? []), [cellFillData]);
    const cellSummary = useMemo(() => activeCellLayer ? summarizeCells(cellList, activeCellLayer) : null, [cellList, activeCellLayer]);
    // Filled cells replace the selected district's own fill instead of blending with it.
    const showCellFill = !!selectedId && cellRange !== null;
    // In the Pekerjaan lens, the selected district's located companies (behind its
    // company count) get a point at the district centre.
    const companyPointActive = category === "employment" && !onboardingActive && !prototypeActive && !!selectedId;
    const selectedCityId = zonesById.get(selectedId ?? "")?.city_id ?? null;
    const locatedEvidence = useLocatedEvidence(companyPointActive ? selectedCityId : null, selectedId ?? null);
    const companyPointData = useMemo(() => createCompanyPointData(locatedEvidence), [locatedEvidence]);
    const mapStyle = useMemo(() => {
        const style = structuredClone(jejakStyle) as StyleSpecification;
        for (const layer of style.layers) {
            if (layer.type !== "symbol" || !layer.layout || !("text-font" in layer.layout)) continue;
            layer.layout["text-font"] = [DISPLAY_LAYERS.has(layer.id) ? urbanist.style.fontFamily : sourceSans3.style.fontFamily];
        }
        return style;
    }, []);

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

    const handleBottomSheetStateChange = useCallback((nextState: MapBottomSheetState) => {
        const previousState = bottomSheetStateRef.current;
        if (
            nextState.isExpanded && !previousState.isExpanded &&
            chatComposerRef.current?.contains(document.activeElement)
        ) {
            bottomSheetRef.current?.focusHandle();
        }
        bottomSheetStateRef.current = nextState;
        setBottomSheetState(nextState);
    }, []);

    useEffect(() => {
        const viewport = window.matchMedia("(max-width: 767px)");
        const syncViewport = () => setIsMobileViewport(viewport.matches);
        syncViewport();
        viewport.addEventListener("change", syncViewport);
        return () => viewport.removeEventListener("change", syncViewport);
    }, []);

    useEffect(() => {
        const panel = mapContainerRef.current?.querySelector<HTMLElement>("#zone-intelligence-desktop");
        if (!panel) {
            setDesktopPanelWidth(0);
            return;
        }

        const syncPanelWidth = () => {
            const width = window.matchMedia("(min-width: 768px)").matches
                ? Math.ceil(panel.getBoundingClientRect().width)
                : 0;
            setDesktopPanelWidth(width);
        };
        const observer = new ResizeObserver(syncPanelWidth);
        observer.observe(panel);
        window.addEventListener("resize", syncPanelWidth);
        syncPanelWidth();

        return () => {
            observer.disconnect();
            window.removeEventListener("resize", syncPanelWidth);
        };
    }, [selectedId]);

    const handleOnboardingMapPick = useCallback((point: MapPoint) => {
        setOnboardingMapPoint(point);
        setOnboardingOffice("Dipilih di peta");
    }, []);

    const handleOnboardingOfficeChange = useCallback((office: OfficeChoice) => {
        setOnboardingOffice(office);
        if (office !== "Dipilih di peta") setOnboardingMapPoint(null);
    }, []);

    const handleOnboardingMapPickingChange = useCallback((picking: boolean) => {
        setOnboardingMapPicking(picking);
        if (picking) clearHover();
    }, [clearHover]);

    const handleOnboardingActiveChange = useCallback((active: boolean) => {
        setOnboardingActive(active);
        if (active) clearHover();
    }, [clearHover]);

    function cancelPendingSearchFly() {
        pendingSearchFlyRef.current = null;
        if (panelOpenTimer.current !== null) window.clearTimeout(panelOpenTimer.current);
        panelOpenTimer.current = null;
    }

    useEffect(() => () => {
        if (panelOpenTimer.current !== null) window.clearTimeout(panelOpenTimer.current);
    }, []);

    function selectZone(zone: Zone) {
        if (prototypeActive) {
            selectPreviewDistrict(zone.zone_id);
            return;
        }
        bottomSheetRef.current?.collapse();
        clearHover();
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

    function selectPreviewDistrict(zoneId: string) {
        setSampleSelectedId(zoneId);
        // A user pick owns the camera, even if city boundaries are still loading.
        onboardingCameraRef.current = onboardingCameraKey;
        bottomSheetRef.current?.collapse();
        const center = activePreview?.districts.find((item) => item.district.zone_id === zoneId)?.district.center ?? (() => {
            const features = onboardingGeometry.geometry?.features.filter((feature) => feature.properties.zone_id === zoneId) ?? [];
            const bounds = features.length ? getGeometryBounds({ type: "FeatureCollection", features }) : null;
            return bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] as [number, number] : null;
        })();
        if (center) mapRef.current?.easeTo({ center, zoom: 12.5, duration: prefersReducedMotion() ? 0 : 500 });
    }

    const stopOrbit = useCallback(() => {
        if (orbitMoveEndRef.current) {
            mapRef.current?.off("moveend", orbitMoveEndRef.current);
            orbitMoveEndRef.current = null;
        }
        orbitingRef.current = false;

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
                map.setBearing(map.getBearing() + elapsed * -0.0025);
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
        if (onboardingActive || prototypeActive || !mapLoaded || !selectedGeometry) return;
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
        mapRef.current?.fitBounds(bounds, {
            padding: desktop
                ? {
                    top: 180,
                    right: Math.ceil(panelWidth) + 16,
                    bottom: 70,
                    left: 40,
                }
                : {
                    top: Math.min(156, Math.round(window.innerHeight * 0.28)),
                    right: 24,
                    bottom: Math.min(180, Math.round(window.innerHeight * 0.28)),
                    left: 24,
                },
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
    }, [selectedGeometry, selectedId, mapLoaded, onboardingActive, prototypeActive, stopOrbit, startOrbit]);

    useEffect(() => () => stopOrbit(), [stopOrbit]);

    useEffect(() => () => {
        if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
    }, []);

    const handleSheetHeightChange = useCallback((height: number) => {
        mapContainerRef.current?.style.setProperty("--map-sheet-height", `${height}px`);
    }, []);

    useEffect(() => {
        const viewport = window.matchMedia("(max-height: 600px)");
        const syncViewport = () => setIsShortViewport(viewport.matches);
        syncViewport();
        viewport.addEventListener("change", syncViewport);
        return () => viewport.removeEventListener("change", syncViewport);
    }, []);

    useEffect(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.get("passwordUpdated") !== "1") return;
        const timer = window.setTimeout(() => {
            setPasswordUpdated(true);
            url.searchParams.delete("passwordUpdated");
            window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        const composer = chatComposerRef.current;
        const container = mapContainerRef.current;
        if (!composer || !container) return;
        const syncHeight = () => container.style.setProperty("--map-chat-height", `${composer.getBoundingClientRect().height}px`);
        const observer = new ResizeObserver(syncHeight);
        observer.observe(composer);
        syncHeight();
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (onboardingMapPicking) stopOrbit();
    }, [onboardingMapPicking, stopOrbit]);

    useEffect(() => {
        const panel = mapContainerRef.current?.querySelector<HTMLElement>(".onboarding-form-panel");
        const container = mapContainerRef.current;
        if (!form.active || !panel || !container) {
            const timer = window.setTimeout(() => setOnboardingPanelSize({ width: 0, height: 0 }), 0);
            return () => window.clearTimeout(timer);
        }
        const measure = () => {
            const box = panel.getBoundingClientRect();
            container.style.setProperty("--onboarding-sheet-height", `${Math.ceil(box.height)}px`);
            setOnboardingPanelSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
        };
        const observer = new ResizeObserver(measure);
        observer.observe(panel);
        measure();
        return () => observer.disconnect();
    }, [form.active]);

    const previewCity = activePreview?.city;
    const destinationPoint = form.active ? form.session?.answers.destinationPoint
        : storyPreviewVisible ? storyPreferences?.destinationPoint ?? null : null;
    const onboardingCameraKey = prototypeActive
        ? JSON.stringify([previewCity?.city_id ?? null, destinationPoint ?? null, form.active]) : null;
    useEffect(() => {
        if (!prototypeActive) {
            onboardingCameraRef.current = null;
            return;
        }
        if (!mapStyleReady || onboardingCameraRef.current === onboardingCameraKey) return;
        // Wait for the form's first measurement rather than flying twice on mount.
        if (form.active && (!onboardingPanelSize.width || !onboardingPanelSize.height)) return;
        stopOrbit();
        const desktop = window.matchMedia("(min-width: 768px)").matches;
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const top = form.active ? desktop ? 80 : Math.min(64, window.innerHeight * 0.1) : 150;
        const padding = {
            top, left: 24,
            right: desktop && form.active ? onboardingPanelSize.width + 40 : 24,
            bottom: !desktop && form.active ? Math.min(onboardingPanelSize.height + 12, window.innerHeight - top - 64) : 70,
        };
        const destinationCenter = destinationPoint;
        const bounds = onboardingGeometry.geometry && getGeometryBounds(onboardingGeometry.geometry);
        const fallbackCenter = previewCity?.center ?? (bounds
            ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] as [number, number]
            : null);
        if (!destinationCenter && !fallbackCenter) return;
        // Frame once per explicit city/destination/mode change. Border responses,
        // refreshed preview objects, and panel resizes must not reset the user's view.
        onboardingCameraRef.current = onboardingCameraKey;
        // fitBounds bakes its padding into the camera. Clear an earlier easeTo's
        // global padding before switching camera strategies, avoiding double offsets.
        mapRef.current?.getMap().setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        if (bounds && !destinationCenter && (desktop || !form.active)) {
            mapRef.current?.fitBounds(bounds, { padding, maxZoom: 12.5, pitch: 0, bearing: 0, animate: !reducedMotion, duration: reducedMotion ? 0 : 500 });
        } else {
            mapRef.current?.easeTo({ center: destinationCenter ?? fallbackCenter!, zoom: destinationCenter ? 13 : 11,
                padding, pitch: 0, bearing: 0, animate: !reducedMotion, duration: reducedMotion ? 0 : 500 });
        }
    }, [prototypeActive, mapStyleReady, previewCity, destinationPoint, onboardingGeometry.geometry, onboardingPanelSize, form.active, stopOrbit, onboardingCameraKey]);

    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!mapStyleReady || !map?.getLayer(BUILDINGS_3D_LAYER)) return;
        map.setLayoutProperty(BUILDINGS_3D_LAYER, "visibility", is3dEnabled && !form.active ? "visible" : "none");
    }, [mapStyleReady, is3dEnabled, form.active]);

    function getEventZone(event: MapMouseEvent) {
        const feature = event.features?.[0] ?? mapRef.current?.queryRenderedFeatures([
            [event.point.x - 6, event.point.y - 6], [event.point.x + 6, event.point.y + 6],
        ], { layers: [ZONE_FILL_LAYER.id] })[0];
        return zonesById.get(feature?.properties?.zone_id);
    }

    const hoveredMetadata = zonesById.get(hoveredZone?.id ?? "");
    const hoveredRentSharePercent = rentSharePercent(hoveredMetadata?.wage_to_rent_ratio ?? null);
    const hoveredProperties = hoveredZone ? propertiesByZone.get(hoveredZone.id) : undefined;
    const hoveredValue = hoveredProperties?.value ?? null;

    return (
        <div ref={mapContainerRef} data-hci-region="map" className="relative h-full min-h-0 overflow-hidden">
            <MapView ref={mapRef} initialViewState={{ longitude: 106.8456, latitude: -6.2088, zoom: 11 }}
                rotateSpeed={0.4} aroundCenter={false} style={{ width: "100%", height: "100%" }}
                 mapStyle={mapStyle} attributionControl={false} interactiveLayerIds={prototypeActive ? !form.active && activePreview?.available ? [ONBOARDING_FILL_ID] : [] : onboardingActive ? [] : [ZONE_FILL_LAYER.id]} cursor={form.pickingDestination || onboardingMapPicking ? "crosshair" : hoveredZone && !onboardingActive ? "pointer" : "grab"}
                onLoad={() => { setMapLoaded(true); syncSearchScope(); }}
                onResize={syncSearchScope}
                onStyleData={() => { if (mapRef.current?.getMap().getLayer(BUILDINGS_3D_LAYER)) setMapStyleReady(true); }}
                 onClick={(event) => {
                     if (prototypeActive) {
                         if (form.active) {
                             if (form.pickingDestination) form.setDestinationPoint([event.lngLat.lng, event.lngLat.lat]);
                             return;
                         }
                         const id = event.features?.[0]?.properties?.zone_id;
                         if (typeof id === "string") selectPreviewDistrict(id);
                         return;
                     }
                    if (onboardingActive) {
                        if (onboardingMapPicking) handleOnboardingMapPick({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
                        return;
                    }
                    const zone = getEventZone(event);
                    if (zone) {
                        bottomSheetRef.current?.collapse();
                        cancelPendingSearchFly();
                        setMobilePanelOpen(true);
                        clearHover();
                        void state.selectZone(zone);
                    }
                }}
                onMouseDown={() => { stopOrbit(); if (prototypeActive) onboardingCameraRef.current = onboardingCameraKey; }}
                onTouchStart={() => { stopOrbit(); if (prototypeActive) onboardingCameraRef.current = onboardingCameraKey; }}
                onMouseMove={(event) => {
                    if (onboardingActive || prototypeActive) return;
                    pendingHoverRef.current = {
                        zoneId: typeof event.features?.[0]?.properties?.zone_id === "string" ? event.features[0].properties.zone_id : null,
                        x: event.point.x, y: event.point.y,
                        longitude: event.lngLat.lng, latitude: event.lngLat.lat,
                    };
                    if (hoverFrameRef.current === null) {
                        hoverFrameRef.current = requestAnimationFrame(() => {
                            hoverFrameRef.current = null;
                            const pending = pendingHoverRef.current;
                            if (!pending) return;
                            const id = pending.zoneId ?? mapRef.current?.queryRenderedFeatures([
                                [pending.x - 6, pending.y - 6], [pending.x + 6, pending.y + 6],
                            ], { layers: [ZONE_FILL_LAYER.id] })[0]?.properties?.zone_id;
                            const zone = zonesById.get(id);
                            setHoveredZone((current) => !zone && current === null ? current : zone
                                ? { id: zone.zone_id, longitude: pending.longitude, latitude: pending.latitude } : null);
                        });
                    }
                }}
                onMoveEnd={() => {
                    syncSearchScope();
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
                onMouseLeave={clearHover}>
                <AttributionControl position="bottom-left" compact customAttribution="Batas wilayah: BIG RBI / DKI Jakarta GIS" />
                {onboardingMapPoint && <Marker longitude={onboardingMapPoint.longitude} latitude={onboardingMapPoint.latitude} anchor="center">
                    <span className="pointer-events-none flex size-6 items-center justify-center rounded-full border-2 border-base-100 bg-primary shadow-overlay"><span className="size-2 rounded-full bg-base-100" /></span>
                </Marker>}
                {prototypeActive && mapContext && activePreview && <OnboardingMapLayers context={mapContext} preview={activePreview}
                    geometry={onboardingGeometry.geometry} mapRef={mapRef} mapLoaded={mapStyleReady} category={category}
                    onDestination={(destination) => form.update({ destinationId: destination.id, destinationName: destination.name, destinationPoint: destination.center })}
                    selectedDistrictId={sampleSelectedId} onSelectDistrict={selectPreviewDistrict} />}
                {prototypeActive && !form.active && sampleSelected && sampleSelectedCenter && <Popup longitude={sampleSelectedCenter[0]} latitude={sampleSelectedCenter[1]}
                    anchor="bottom" offset={28} closeOnClick={false} onClose={() => setSampleSelectedId(null)} className="onboarding-sample-popup">
                    <section aria-label={`Data ${sampleSelected.district.zone_name}`} className="max-w-64 font-body text-ink" data-hci-region="onboarding-result-detail">
                        {sampleSelected.district.is_sample && <span className="badge badge-neutral badge-xs">Data contoh</span>}
                        <h2 className="mt-2 font-sans text-xl font-bold">{sampleSelected.district.zone_name}</h2>
                        <dl className="mt-3 space-y-2 text-sm">
                            <div><dt className="text-xs text-ink-muted">Median sewa / bulan</dt><dd className="font-semibold">{sampleSelected.rent === null ? "Belum tersedia" : `Rp${formatRupiah(sampleSelected.rent)}`}</dd></div>
                            <div><dt className="text-xs text-ink-muted">Perkiraan sewa + biaya kota</dt><dd className="font-semibold">{sampleSelected.monthlyCost === null ? "Belum tersedia" : `sekitar Rp${formatRupiah(sampleSelected.monthlyCost)}`}</dd></div>
                            <div><dt className="text-xs text-ink-muted">Perjalanan</dt><dd className="font-semibold">Rute belum tersedia · tidak dihitung</dd></div>
                        </dl>
                        {sampleSelected.rentFact && <p className="mt-3 text-xs leading-relaxed text-ink-muted">Sewa: {sampleSelected.rentFact.source}{sampleSelected.rentFact.is_sample ? " · Data contoh" : ""}</p>}
                        {sampleSelected.district.living_cost && <p className="mt-1 text-xs leading-relaxed text-ink-muted">Biaya kota: <a className="link link-hover" href={sampleSelected.district.living_cost.source_url ?? undefined} target="_blank" rel="noreferrer">{sampleSelected.district.living_cost.source}</a></p>}
                        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{sampleSelected.eligible === true ? sampleSelected.reasons.join(" · ") : sampleSelected.eligible === false ? sampleSelected.exclusions.join(" · ") : sampleSelected.unknowns.join(" · ")}</p>
                    </section>
                </Popup>}
                {!onboardingActive && !prototypeActive && <>
                    <Source id="region-data" type="geojson" data={layerData}>
                        <Layer {...getZoneFillLayer(category ?? "summary", metricRange)} beforeId={BUILDINGS_3D_LAYER}
                            filter={["!=", ["get", "zone_id"], showCellFill ? selectedId ?? "" : ""]} />
                        <Layer {...ZONE_OUTLINE_LAYER} beforeId={BUILDINGS_3D_LAYER} />
                        {hoveredZone && hoveredZone.id !== selectedId && <Layer {...ZONE_HOVER_OUTLINE_LAYER} beforeId={BUILDINGS_3D_LAYER} filter={["==", ["get", "zone_id"], hoveredZone.id]} />}
                        {selectedId && <Layer {...ZONE_SELECTED_CASING_LAYER} beforeId={BUILDINGS_3D_LAYER} filter={["==", ["get", "zone_id"], selectedId]} />}
                        {selectedId && <Layer {...ZONE_SELECTED_OUTLINE_LAYER} beforeId={BUILDINGS_3D_LAYER} filter={["==", ["get", "zone_id"], selectedId]} />}
                    </Source>
                    {showCellFill && cellFillData && <Source id="cell-fill-data" type="geojson" data={cellFillData}>
                        <Layer {...getCellFillLayer(cellRange)} beforeId={ZONE_OUTLINE_LAYER.id} />
                        <Layer {...CELL_OUTLINE_LAYER} beforeId={ZONE_OUTLINE_LAYER.id} />
                    </Source>}
                    {selectedId && cellGlowData && cellGlowData.features.length > 0 && <Source id="cell-glow-data" type="geojson" data={cellGlowData}>
                        <Layer {...CELL_GLOW_LAYER} beforeId={ZONE_OUTLINE_LAYER.id} />
                    </Source>}
                    {category === "education" && <Source id="region-campuses" type="geojson" data={campusData}>
                        <Layer id="region-campus-points" type="circle" paint={{ "circle-radius": 7, "circle-color": "#006AD8", "circle-stroke-width": 2, "circle-stroke-color": "#21297C" }} />
                    </Source>}
                    {companyPointActive && companyPointData.features.length > 0 && <Source id="company-point" type="geojson" data={companyPointData}>
                        <Layer {...COMPANY_POINT_LAYER} />
                    </Source>}
                </>}
                {!onboardingActive && !prototypeActive && hoveredZone && hoveredMetadata && hoveredZone.id !== selectedId && <Popup longitude={hoveredZone.longitude} latitude={hoveredZone.latitude}
                    anchor="bottom" offset={12} closeButton={false} closeOnClick={false} className="zone-hover-popup">
                    <div role="tooltip" className="min-w-44 font-body">
                        <p className="font-sans text-base font-bold text-on-ink border-b border-on-ink-muted/40">{hoveredMetadata.zone_name}</p>
                        {category === "summary" && <p className="mt-3 text-sm">{hoveredRentSharePercent === null
                            ? <>Sewa dari gaji rata-rata {hoveredMetadata.city_name}: <span className="font-semibold tabular-nums text-accent">Tidak tersedia</span></>
                            : <>{mapCategories.summary.popupLabel}: sekitar <span className="font-semibold tabular-nums text-accent">{mapCategories.summary.format(hoveredRentSharePercent)}</span> dari gaji rata-rata {hoveredMetadata.city_name}</>}</p>}
                        {category && category !== "summary" && <p className="mt-3 text-sm">{mapCategories[category].popupLabel}: <span className="font-semibold tabular-nums text-accent">{hoveredValue == null ? "Tidak tersedia" : `${hoveredProperties?.approximate ? "sekitar " : ""}${mapCategories[category].format(hoveredValue)}`}</span></p>}
                    </div>
                </Popup>}
            </MapView>

            {!onboardingActive && <MapControls
                showProfileReminder={profile.loaded && profile.savedProfile === null && !profileReminderDismissed}
                onCompleteProfile={form.returnToStory}
                onDismissProfileReminder={() => setProfileReminderDismissed(true)}
                sidebarWidth={desktopPanelWidth}
                zones={prototypeActive ? sampleZones : state.catalog.zones}
                searchScope={searchScope}
                loading={prototypeActive ? false : state.catalogLoading}
                error={prototypeActive ? null : state.catalogError}
                hasActiveRegionLayers={prototypeActive || state.recommendationsLoading || !!selectedId || layerData.features.length > 0 || campusData.features.length > 0}
                onRetry={state.retryCatalog}
                recommendationsLoading={prototypeActive ? false : state.recommendationsLoading}
                recommendationsError={prototypeActive ? null : state.recommendationsError}
                onRetryRecommendations={state.retryRecommendations}
                heatmapLoading={cells.loading}
                heatmapError={cells.error}
                heatmapEmpty={cells.enabled && !cells.loading && !cells.error && !cellSummary}
                onRetryHeatmap={cells.retry}
                category={category}
                onCategoryChange={(next) => {
                    setCategory(next);
                    if (next === "summary") state.restoreRecommendations();
                }}
                onSelect={selectZone}
                onReset={() => {
                    if (prototypeActive) { form.dismiss(); setStoryPreviewVisible(false); form.selectPreviewCity(undefined); setSampleSelectedId(null); }
                    clearHover();
                    cancelPendingSearchFly();
                    setMobilePanelOpen(false);
                    setCategory(null);
                    state.resetMap();
                }} />}
            {passwordUpdated && <p role="status" className="pointer-events-none absolute left-1/2 top-32 z-200 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-rule bg-base-100 px-4 py-3 text-center font-body text-sm font-semibold text-ink shadow-overlay md:top-20" data-hci-region="account-feedback">
                Kata sandi berhasil diperbarui. Kamu tetap masuk ke akun.
            </p>}
            {!onboardingActive && savedProfileRevision !== null && <p role="status" data-hci-region="profile-save-feedback" className="pointer-events-none absolute left-1/2 top-32 z-200 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-rule bg-base-100 px-4 py-3 font-body text-sm font-semibold text-ink shadow-overlay md:top-20">
                Profil tersimpan di akunmu · revisi {savedProfileRevision}
            </p>}
            {!onboardingActive && !(isMobileViewport && isShortViewport && bottomSheetState.height > 44) && <div className={`pointer-events-auto absolute bottom-(--map-tools-bottom) z-100 flex w-11 flex-col gap-2 font-body transition-[bottom] duration-200 motion-reduce:transition-none md:bottom-8 ${prototypeActive ? "right-4" : "left-[max(0.75rem,env(safe-area-inset-left))] md:left-4"}`} style={{ "--map-tools-bottom": `calc(var(--map-sheet-height, ${bottomSheetState.height}px) + ${!bottomSheetState.isExpanded && !(isMobileViewport && mobilePanelOpen) ? "var(--map-chat-height, 112px) + 32px" : "16px"})` } as CSSProperties}>
                <Buildings3dToggle enabled={is3dEnabled} onToggle={() => setIs3dEnabled((enabled) => !enabled)} />
                {!prototypeActive && (layerData.features.length > 0 || cellSummary) && <MapLegend category={category ?? "summary"} range={metricRange}
                    detailsByZone={state.results} visibleZoneIds={visibleZoneIds} selectedZoneName={state.selectedZone?.zone_name ?? null}
                    cellLayerOptions={selectedId ? cellOptions : []} activeCellLayer={selectedId ? activeCellLayer : null}
                    cellSummary={cellSummary} cellsLoading={cells.loading} cellsError={cells.error}
                    onCellLayerChange={setCellLayerId}
                    companyPointShown={companyPointActive && companyPointData.features.length > 0} />}
            </div>}
            {!onboardingActive && !prototypeActive && state.selectedZone && (
                <ZoneIntelligencePanel
                    zoneName={state.selectedZone.zone_name}
                    details={selectedResult ?? null}
                    category={category ?? "summary"}
                    isSample={selectedResult?.is_sample ?? zonesById.get(selectedId ?? "")?.is_sample ?? false}
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
                        setMobilePanelOpen(false);
                        state.closeSelection();
                    }} />
            )}
            {!onboardingActive && <MapBottomSheet
                ref={bottomSheetRef}
                zones={prototypeActive ? sampleZones : state.catalog.zones}
                recommendations={prototypeActive ? activePreview?.ranked : undefined}
                onEditPreferences={prototypeActive ? () => {
                    if (storyPreviewVisible) {
                        setStoryPreviewVisible(false);
                        form.selectPreviewCity(undefined);
                        form.returnToStory();
                    } else form.open();
                } : undefined}
                onSelect={selectZone}
                onStateChange={handleBottomSheetStateChange}
                onHeightChange={handleSheetHeightChange}
            />}
            <MapChatComposer
                containerRef={chatComposerRef}
                visible={!onboardingActive && !prototypeActive && !bottomSheetState.isExpanded && !(isMobileViewport && mobilePanelOpen) && !(isMobileViewport && isShortViewport && bottomSheetState.height > 44)}
                isDragging={bottomSheetState.isDragging}
                sheetHeight={bottomSheetState.height}
                sidebarWidth={desktopPanelWidth}
                category={category}
                selectedZoneName={state.selectedZone?.zone_name ?? null}
                onClearContext={() => {
                    cancelPendingSearchFly();
                    setMobilePanelOpen(false);
                    state.closeSelection();
                }}
            />
            <RelocationOnboarding
                savedProfile={profile.savedProfile}
                savedProfileLoaded={profile.settled}
                onSaveProfile={confirmStoryProfileSaved}
                mapPoint={onboardingMapPoint}
                onMapPointChange={setOnboardingMapPoint}
                selectedOffice={onboardingOffice}
                onOfficeChange={handleOnboardingOfficeChange}
                onMapPickingChange={handleOnboardingMapPickingChange}
                onOnboardingActiveChange={handleOnboardingActiveChange}
                formSession={form.session}
                formReady={form.ready}
                storyOpenRequest={form.storyOpenRequest}
                onOpenForm={form.open}
            />
            {form.active && <div className="absolute left-4 top-4 z-100"><BrandLogo /></div>}
            {prototypeActive && activePreview && <OnboardingPreview session={storyPreviewVisible ? null : form.session} preview={activePreview}
                geometryLoading={onboardingGeometry.loading} geometryError={onboardingGeometry.error} onRetry={onboardingGeometry.retry} category={category}
                dataLoading={form.dataLoading} dataError={form.dataError} onRetryData={form.retryData}
                selectedDistrictId={sampleSelectedId} onSelectDistrict={selectPreviewDistrict}
                stepOverride={storyPreviewVisible ? 4 : undefined} completedOverride={storyPreviewVisible ? true : undefined}
                transportLabel={activePreview.preferences.transport ? transportLabels[activePreview.preferences.transport] : "belum dipilih"}
                onEditPreferences={() => {
                    if (storyPreviewVisible) {
                        setStoryPreviewVisible(false);
                        form.selectPreviewCity(undefined);
                        form.returnToStory();
                    } else form.open();
                }} onExitPrototype={() => {
                    form.dismiss(); setStoryPreviewVisible(false); form.selectPreviewCity(undefined);
                    setSampleSelectedId(null); setCategory("summary"); state.restoreRecommendations();
                }} />}
            {form.active && form.session && form.preview && <RelocationFormOnboarding session={form.session} onChange={(patch) => {
                if (patch.city !== undefined && patch.city !== form.session?.answers.city) setSampleSelectedId(null);
                form.update(patch);
            }}
                onStepChange={form.goToStep} onDismiss={form.dismiss} onStory={form.returnToStory}
                previewLoading={form.dataLoading} previewError={form.dataError} onRetryPreview={form.retryData}
                onMapPick={form.startPickingDestination} pickingDestination={form.pickingDestination}
                selectedDistrictId={sampleSelectedId} onSelectDistrict={selectPreviewDistrict}
                onFinish={async () => {
                    const saved = await saveRelocationProfile({ form_answers: form.session!.answers });
                    confirmProfileSaved(saved);
                    setSampleSelectedId(null); setCategory("summary"); form.finish();
                }} storageAvailable={form.storageAvailable} preview={form.preview} />}
        </div>
    );
}
