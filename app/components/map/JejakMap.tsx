"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import MapView, { AttributionControl, Layer, Marker, Popup, Source, type MapMouseEvent, type MapRef } from "react-map-gl/maplibre";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { StyleSpecification } from "maplibre-gl";

import jejakStyle from "@/public/jejak_light_openfreemap.json";
import { urbanist, sourceSans3 } from "@/app/fonts";
import type { MapCategory, Zone, ZoneGeometry, ZoneSummary } from "@/app/engine/types";
import { getGeometryBounds } from "@/app/engine/lib/zoneGeometry";
import { cellLayers, getMapMetricConfig, mapCategories, rentSharePercent, type EducationMetric } from "./mapMetrics";
import { createCellFillData, createCellGlowData, createCompanyPointData, createZoneLayerData, summarizeCells } from "./zoneLayerData";
import { CELL_GLOW_LAYER, CELL_OUTLINE_LAYER, COMPANY_POINT_LAYER, getCellFillLayer, getMetricRange, getZoneFillLayer, ZONE_FILL_LAYER, ZONE_HOVER_OUTLINE_LAYER, ZONE_OUTLINE_LAYER, ZONE_SELECTED_CASING_LAYER, ZONE_SELECTED_OUTLINE_LAYER } from "./zoneLayers";
import { useLocatedEvidence } from "./useEvidence";
import { useMapCells } from "./useMapCells";
import { useZoneIntelligence } from "./useZoneIntelligence";
import Buildings3dToggle from "./Buildings3dToggle";
import MapControls from "./MapControls";
import { getZoneSearchScope, type ZoneSearchScope } from "./zoneSearch";
import { getCityAreaName, getCityMetroArea, getMetroArea, getMetroCityIds, isMetroCity } from "@/app/engine/lib/metroArea";
import MapChatComposer from "./MapChatComposer";
import MapLegend from "./MapLegend";
import MapZoomControls from "./MapZoomControls";
import ZoneIntelligencePanel from "./ZoneIntelligencePanel";
import MapBottomSheet, { SHEET_MIN_HEIGHT, type MapBottomSheetHandle, type MapBottomSheetState } from "./MapBottomSheet";
import RelocationOnboarding, { type MapPoint, type OfficeChoice, type StoryStep } from "./RelocationOnboarding";
import BrandLogo from "../BrandLogo";
import RelocationFormOnboarding from "./onboarding/RelocationFormOnboarding";
import OnboardingMapLayers, { ONBOARDING_FILL_ID } from "./onboarding/OnboardingMapLayers";
import PlanningReachLayers from "./PlanningReachLayers";
import PlanningDistrictLayers, { PLANNING_DISTRICT_FILL_ID } from "./PlanningDistrictLayers";
import PlanningReachSummary from "./PlanningReachSummary";
import { planningReachLabel } from "@/app/engine/onboarding/planningReach";
import OnboardingPreview from "./onboarding/OnboardingPreview";
import { useFormOnboarding } from "./onboarding/useFormOnboarding";
import { useOnboardingGeometry } from "./onboarding/useOnboardingGeometry";
import { useSavedRelocationProfile } from "./onboarding/useSavedRelocationProfile";
import { isDesktopViewport, prefersReducedMotion, useMediaQuery } from "./viewport";
import { formatRupiah, transportLabels } from "@/app/engine/onboarding/demoData";
import { evaluateLiveOnboarding, hasHousingStatistics, isLiveRecommendationSample, monthlyCostRange, profilePreviewPreferences } from "@/app/engine/onboarding/livePreview";
import { saveRelocationProfile } from "@/app/engine/lib/relocationProfileApi";
import { normalizeRelocationProfileInputs, type StoredRelocationProfile } from "@/app/engine/lib/relocationProfile";
import type { RelocationProfileProposal } from "@/app/engine/lib/relocationProfileInterpretationValidation";
import { getRelocationGoal } from "@/app/engine/lib/relocationGoal";
import type { LivePreviewMapContext } from "@/app/engine/onboarding/types";
import type { AccountSummary } from "@/app/engine/controller/userServerController";
import { visiblePreviewDistricts } from "@/app/engine/onboarding/visibleDistricts";
import { applyProfileFieldEdit } from "@/app/engine/lib/relocationProfileInterpretationFollowUp";
import { validateRelocationProfileProposal } from "@/app/engine/lib/relocationProfileInterpretationValidation";
import { onboardingTaxonomy } from "@/app/engine/extractUserProfile";
import { useAccountIdentity } from "@/app/engine/lib/useAccountIdentity";

maplibregl.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const DISPLAY_LAYERS = new Set(["place_city", "place_town", "state", "country_1", "country_2", "country_3"]);
const BUILDINGS_3D_LAYER = "building-3d";

const mapStyle = structuredClone(jejakStyle) as StyleSpecification;
for (const layer of mapStyle.layers) {
    if (layer.type !== "symbol" || !layer.layout || !("text-font" in layer.layout)) continue;
    layer.layout["text-font"] = [DISPLAY_LAYERS.has(layer.id) ? urbanist.style.fontFamily : sourceSans3.style.fontFamily];
}

function getDesktopPanelInset(container: HTMLElement | null) {
    const panel = container?.querySelector<HTMLElement>("#zone-intelligence-desktop");
    if (!container || !panel) return null;
    return Math.ceil(container.getBoundingClientRect().right - panel.getBoundingClientRect().left);
}

export default function JejakMap({ userId, account, confirmedProfile, profileLoadFailed = false }: {
    userId: string; account: AccountSummary | null; confirmedProfile?: StoredRelocationProfile | null; profileLoadFailed?: boolean;
}) {
    const { account: identity, active: accountActive } = useAccountIdentity(userId);
    const router = useRouter();
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
    const [educationMetric, setEducationMetric] = useState<EducationMetric>("schools");
    const [cellLayerId, setCellLayerId] = useState<string | null>(null);
    const [hoveredZone, setHoveredZone] = useState<{ id: string; longitude: number; latitude: number } | null>(null);
    const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
    const isMobileViewport = useMediaQuery("(max-width: 767px)");
    const isShortViewport = useMediaQuery("(max-height: 600px)");
    const [passwordUpdated, setPasswordUpdated] = useState(false);
    const [desktopPanelWidth, setDesktopPanelWidth] = useState(0);
    const [bottomSheetState, setBottomSheetState] = useState<MapBottomSheetState>({
        height: 30,
        isExpanded: false,
        isDragging: false,
    });
    const [is3dEnabled, setIs3dEnabled] = useState(true);
    const [legacyOnboardingActive, setLegacyOnboardingActive] = useState(true);
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
    const profile = useSavedRelocationProfile(identity, confirmedProfile);
    const form = useFormOnboarding(userId, !!confirmedProfile);
    const [storyPreviewProfile, setStoryPreviewProfile] = useState<StoredRelocationProfile | null>(confirmedProfile ?? null);
    const [storyPreviewVisible, setStoryPreviewVisible] = useState(!!confirmedProfile);
    const storyCityCatalog = form.data.cities;
    const storyDataLoading = form.dataLoading;
    const storyDataError = form.dataError;
    const selectPreviewCity = form.selectPreviewCity;
    const [storyStep, setStoryStep] = useState<StoryStep>(0);
    const [storyProposal, setStoryProposal] = useState<RelocationProfileProposal | null>(null);
    const storyDraftActive = storyStep === 2 && !form.active;
    const storyReviewActive = storyStep === 3 && !form.active;
    const storyMapProfile = useMemo(() => {
        if (storyDraftActive || storyReviewActive) {
            if (!storyProposal || !getRelocationGoal(storyProposal)) return null;
            try {
                // Canonicalize the proposal's fields without saving or confirming it.
                return normalizeRelocationProfileInputs(storyProposal.hard_constraints,
                    storyProposal.soft_preferences, storyProposal.priority_weights);
            } catch {
                return null;
            }
        }
        return storyPreviewVisible ? storyPreviewProfile?.profile ?? null : null;
    }, [storyDraftActive, storyReviewActive, storyProposal, storyPreviewVisible, storyPreviewProfile]);
    const storyPreferences = useMemo(() => {
        const preferences = storyMapProfile ? profilePreviewPreferences(storyMapProfile, storyCityCatalog) : null;
        if (!preferences) return null;
        return storyDraftActive && onboardingMapPoint ? { ...preferences, destinationName: "Titik pilihanmu",
            destinationPoint: [onboardingMapPoint.longitude, onboardingMapPoint.latitude] as [number, number] } : preferences;
    }, [storyMapProfile, storyCityCatalog, storyDraftActive, onboardingMapPoint]);
    const storyPreview = useMemo(() => storyPreferences
        ? evaluateLiveOnboarding(storyPreferences, storyDraftActive ? 2 : 4, form.data)
        : null, [storyPreferences, storyDraftActive, form.data]);
    const storyMapVisible = !form.active && (storyDraftActive || storyReviewActive || storyPreviewVisible);
    const storyCostRange = storyReviewActive && storyPreview?.available ? monthlyCostRange(storyPreview) : null;
    const basePreview = storyMapVisible && !form.active ? storyPreview : form.preview;
    const mapContext = useMemo<LivePreviewMapContext | null>(() => storyMapVisible && storyPreferences
        ? { step: storyDraftActive ? 2 : 4, completed: !storyDraftActive && !storyReviewActive, goal: storyPreferences.goal, overBudget: storyPreferences.overBudget,
            destinationId: storyPreferences.destinationId, destinationPoint: storyPreferences.destinationPoint }
        : form.session ? { step: form.session.status === "completed" ? 4 : form.session.step,
            completed: form.session.status === "completed", goal: form.session.answers.goal,
            overBudget: form.session.answers.overBudget, destinationId: form.session.answers.destinationId,
            destinationPoint: form.session.answers.destinationPoint }
            : null, [storyMapVisible, storyPreferences, storyDraftActive, storyReviewActive, form.session]);
    const storyCityId = storyPreferences?.cityId ?? null;
    const savedPreferences = useMemo(() => profile.savedProfile
        ? profilePreviewPreferences(profile.savedProfile.profile, form.data.cities) : null,
    [profile.savedProfile, form.data.cities]);
    useEffect(() => {
        if (!storyMapVisible && !storyReviewActive) {
            selectPreviewCity(!form.active && !legacyOnboardingActive ? savedPreferences?.cityId ?? undefined : undefined);
            return;
        }
        if (storyDataLoading && !storyDataError) return;
        selectPreviewCity(storyCityId);
    }, [storyMapVisible, storyReviewActive, storyCityId, storyDataLoading, storyDataError, selectPreviewCity,
        form.active, legacyOnboardingActive, savedPreferences?.cityId]);
    const [savedProfileRevision, setSavedProfileRevision] = useState<number | null>(confirmedProfile?.revision ?? null);
    function confirmProfileSaved(saved: StoredRelocationProfile) {
        if (identity.signal.aborted) return;
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
    const prototypeActive = form.previewVisible || storyMapVisible;
    const setupPanelActive = form.active || storyDraftActive || storyReviewActive;
    const exploring = !onboardingActive && !prototypeActive;
    const regularAreas = useMemo(() => {
        if (!exploring || !savedPreferences) return null;
        const cityIds = new Set(savedPreferences.cityId ? getMetroCityIds(savedPreferences.cityId, form.data.cities) : []);
        return { ...form.data, areas: form.data.areas.filter((area) => cityIds.has(area.city_id)) };
    }, [exploring, savedPreferences, form.data]);
    const regularBase = useMemo(() => regularAreas && savedPreferences ? evaluateLiveOnboarding(savedPreferences, 4, regularAreas) : null,
        [regularAreas, savedPreferences]);
    const regularGeometry = useOnboardingGeometry(exploring && !!regularBase?.planningReach && !!regularBase.available,
        regularBase?.city?.city_id ?? null, regularBase?.districts.map((item) => item.district.zone_id) ?? []);
    const regularPreview = useMemo(() => regularAreas && savedPreferences && regularGeometry.geometry
        ? evaluateLiveOnboarding(savedPreferences, 4, { ...regularAreas, geometry: regularGeometry.geometry }) : regularBase,
    [regularAreas, savedPreferences, regularBase, regularGeometry.geometry]);
    const regularReach = regularPreview?.planningReach ?? null;
    const regularReachCameraRef = useRef(false);
    const regularDistrictDataAvailable = !!regularPreview?.available && (!searchScope || !!regularPreview.city && getCityMetroArea(regularPreview.city)?.id === searchScope);
    const showRegularReachFill = !!regularReach && (category === null || category === "summary" || category === "mobility");
    // The saved profile's priority weights rank the list with or without a commute reach.
    const regularDistricts = useMemo(() => {
        if (!regularPreview?.available) return [];
        const scope = getMetroArea(searchScope);
        return visiblePreviewDistricts(regularPreview).filter((item) => !scope || isMetroCity(scope, item.district));
    }, [regularPreview, searchScope]);
    const regularZones = useMemo<ZoneSummary[]>(() => regularDistricts.map((item) => ({
        zone_id: item.district.zone_id, zone_name: item.district.zone_name,
        city_id: item.district.city_id, city_name: item.district.city_name,
        is_sample: isLiveRecommendationSample(item), average_monthly_wage_idr: null,
        median_monthly_rent_idr: item.rent, population: null, wage_to_rent_ratio: null,
    })), [regularDistricts]);
    const onboardingZoneIds = basePreview?.districts.map((item) => item.district.zone_id) ?? [];
    const onboardingGeometry = useOnboardingGeometry(prototypeActive && !!basePreview?.available,
        basePreview?.city?.city_id ?? null, onboardingZoneIds);
    const [onboardingPanelSize, setOnboardingPanelSize] = useState({ width: 0, height: 0 });
    const onboardingCameraRef = useRef<string | null>(null);
    const [sampleSelection, setSampleSelection] = useState<{ cityId: string; id: string } | null>(null);
    const activePreview = useMemo(() => basePreview && mapContext
        ? evaluateLiveOnboarding(basePreview.preferences, mapContext.step, { cities: basePreview.cities,
            areas: basePreview.districts.map((item) => item.district), destinations: basePreview.destinations,
            geometry: onboardingGeometry.geometry })
        : basePreview, [basePreview, mapContext, onboardingGeometry.geometry]);
    const previewDistricts = useMemo(() => activePreview ? [...visiblePreviewDistricts(activePreview)]
        .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || a.district.zone_id.localeCompare(b.district.zone_id)) : [], [activePreview]);
    const sampleSelected = sampleSelection?.cityId === activePreview?.city?.city_id
        ? previewDistricts.find((item) => item.district.zone_id === sampleSelection?.id && hasHousingStatistics(item)) : undefined;
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
    const sampleZones = useMemo<ZoneSummary[]>(() => previewDistricts.map((item) => ({
        zone_id: item.district.zone_id, zone_name: item.district.zone_name,
        city_id: item.district.city_id, city_name: item.district.city_name,
        is_sample: isLiveRecommendationSample(item),
        average_monthly_wage_idr: null, median_monthly_rent_idr: item.rent, population: null, wage_to_rent_ratio: null,
    })), [previewDistricts]);
    const state = useZoneIntelligence(exploring, searchScope);
    const zonesById = useMemo(() => new Map([...regularZones, ...state.catalog.zones].map((zone) => [zone.zone_id, zone])), [regularZones, state.catalog.zones]);
    const selectedId = state.selectedZone?.zone_id;
    const selectedGeometry = selectedId ? state.geometryByZone[selectedId] : undefined;
    const selectedResult = selectedId ? state.results[selectedId] : undefined;
    const metricConfig = getMapMetricConfig(category ?? "summary", educationMetric);

    const layerData = useMemo(() => {
        const geometry: ZoneGeometry = {
            type: "FeatureCollection",
            features: Object.values(state.geometryByZone).flatMap((value) => value.features),
        };
        return createZoneLayerData(geometry, state.results, category ?? "summary", educationMetric);
    }, [state.geometryByZone, state.results, category, educationMetric]);
    const propertiesByZone = useMemo(() => new Map(layerData.features.map((feature) => [feature.properties.zone_id, feature.properties])), [layerData]);
    const metricRange = useMemo(() => getMetricRange(layerData.features.map((feature) => feature.properties.value)), [layerData]);
    const visibleZoneIds = useMemo(() => [...new Set(layerData.features.map((feature) => feature.properties.zone_id))], [layerData]);
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
    const companyPointActive = category === "employment" && exploring && !!selectedId;
    const locatedEvidence = useLocatedEvidence(companyPointActive ? state.selectedZone?.city_id ?? null : null, selectedId ?? null);
    const companyPointData = useMemo(() => createCompanyPointData(locatedEvidence), [locatedEvidence]);
    // On short phones an expanded bottom sheet leaves no room for the map tools or chat.
    const sheetCoversTools = isMobileViewport && isShortViewport && bottomSheetState.height > 44;
    const mobilePanelShown = isMobileViewport && mobilePanelOpen;

    const campusData = useMemo(() => ({
        type: "FeatureCollection" as const,
        features: [...new Set([...Object.keys(state.geometryByZone), ...(selectedId ? [selectedId] : [])])].flatMap((id) =>
            (state.results[id]?.places ?? []).filter((place) => place.category === "campus").map((place) => ({
                type: "Feature" as const,
                geometry: { type: "Point" as const, coordinates: [place.longitude, place.latitude] },
                properties: { name: place.name, is_sample: place.is_sample },
            }))),
    }), [state.geometryByZone, state.results, selectedId]);

    const pendingSearchFlyRef = useRef<{ zoneId: string; started: boolean } | null>(null);

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
        const panel = mapContainerRef.current?.querySelector<HTMLElement>("#zone-intelligence-desktop");
        if (!panel) {
            setDesktopPanelWidth(0);
            return;
        }

        const syncPanelWidth = () => {
            setDesktopPanelWidth(isDesktopViewport() ? getDesktopPanelInset(mapContainerRef.current) ?? 0 : 0);
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
        if (storyReviewActive) {
            setStoryProposal((current) => current ? validateRelocationProfileProposal(applyProfileFieldEdit(current, "destination", {
                name: "Titik pilihanmu", precision: "point", ...point,
            }), onboardingTaxonomy) : null);
            setOnboardingMapPicking(false);
        }
    }, [storyReviewActive]);

    const handleOnboardingOfficeChange = useCallback((office: OfficeChoice) => {
        setOnboardingOffice(office);
        if (office !== "Dipilih di peta") setOnboardingMapPoint(null);
    }, []);

    const handleOnboardingMapPickingChange = useCallback((picking: boolean) => {
        setOnboardingMapPicking(picking);
        if (picking) clearHover();
    }, [clearHover]);

    const handleOnboardingActiveChange = useCallback((active: boolean) => {
        setLegacyOnboardingActive(active);
        if (active) clearHover();
    }, [clearHover]);

    const cancelPendingSearchFly = useCallback(() => {
        pendingSearchFlyRef.current = null;
        if (panelOpenTimer.current !== null) window.clearTimeout(panelOpenTimer.current);
        panelOpenTimer.current = null;
    }, []);

    // On phones a list/search pick waits for the camera flight before opening the panel;
    // a direct map click opens it at once.
    function openZone(zone: Zone, deferMobilePanel: boolean) {
        bottomSheetRef.current?.collapse();
        clearHover();
        cancelPendingSearchFly();
        if (deferMobilePanel) pendingSearchFlyRef.current = { zoneId: zone.zone_id, started: false };
        setMobilePanelOpen(!deferMobilePanel);
        void state.selectZone(zone);
    }

    function selectZone(zone: Zone) {
        if (prototypeActive) return selectPreviewDistrict(zone.zone_id);
        openZone(zone, isMobileViewport);
    }

    function closeSelection() {
        cancelPendingSearchFly();
        setMobilePanelOpen(false);
        state.closeSelection();
    }

    function selectPreviewDistrict(zoneId: string) {
        const item = activePreview?.districts.find((candidate) => candidate.district.zone_id === zoneId);
        if (!item || !hasHousingStatistics(item)) return;
        setSampleSelectedId(zoneId);
        // A user pick owns the camera, even if city boundaries are still loading.
        onboardingCameraRef.current = onboardingCameraKey;
        bottomSheetRef.current?.collapse();
        const center = item.district.center ?? (() => {
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
        if (orbitingRef.current || prefersReducedMotion()) return;

        orbitingRef.current = true;
        let previousTime: number | null = null;

        function orbitStep(time: number) {
            const map = mapRef.current;
            if (!orbitingRef.current || !map) return;

            if (previousTime !== null) {
                const elapsed = Math.min(time - previousTime, 50);
                map.setBearing(map.getBearing() + elapsed * -0.0005);
            }

            previousTime = time;
            orbitFrameRef.current = requestAnimationFrame(orbitStep);
        }

        orbitFrameRef.current = requestAnimationFrame(orbitStep);
    }, []);

    useEffect(() => {
        stopOrbit();
        if (!exploring || !mapLoaded || !selectedGeometry) return;
        const bounds = getGeometryBounds(selectedGeometry);
        if (!bounds) return;
        const desktop = isDesktopViewport();
        const reducedMotion = prefersReducedMotion();
        const panelInset = getDesktopPanelInset(mapContainerRef.current) ?? 416;
        const pendingSearch = pendingSearchFlyRef.current;
        if (!desktop && pendingSearch && pendingSearch.zoneId === selectedId) {
            pendingSearch.started = true;
            panelOpenTimer.current = window.setTimeout(() => {
                const current = pendingSearchFlyRef.current;
                if (current?.zoneId === selectedId) {
                    pendingSearchFlyRef.current = null;
                    panelOpenTimer.current = null;
                    setMobilePanelOpen(true);
                }
            }, reducedMotion ? 0 : 2500);
        }
        mapRef.current?.fitBounds(bounds, {
            padding: desktop
                ? { top: 180, right: panelInset + 16, bottom: 70, left: 40 }
                : { top: Math.min(156, Math.round(window.innerHeight * 0.28)), right: 24, bottom: Math.min(180, Math.round(window.innerHeight * 0.28)), left: 24 },
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
    }, [selectedGeometry, selectedId, mapLoaded, exploring, stopOrbit, startOrbit]);

    useEffect(() => () => {
        stopOrbit();
        if (panelOpenTimer.current !== null) window.clearTimeout(panelOpenTimer.current);
        if (hoverFrameRef.current !== null) cancelAnimationFrame(hoverFrameRef.current);
    }, [stopOrbit]);

    const handleSheetHeightChange = useCallback((height: number) => {
        mapContainerRef.current?.style.setProperty("--map-sheet-height", `${height}px`);
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
        const panel = mapContainerRef.current?.querySelector<HTMLElement>(".onboarding-form-panel, .onboarding-story-panel");
        const container = mapContainerRef.current;
        if (!setupPanelActive || !panel || !container) {
            const timer = window.setTimeout(() => setOnboardingPanelSize({ width: 0, height: 0 }), 0);
            return () => window.clearTimeout(timer);
        }
        const measure = () => {
            const box = panel.getBoundingClientRect();
            container.style.setProperty("--onboarding-sheet-height", `${Math.ceil(box.height)}px`);
            // A mobile drag resizes the panel every frame; the camera only needs the settled size.
            if (panel.dataset.dragging) return;
            setOnboardingPanelSize({ width: Math.ceil(box.width), height: Math.ceil(box.height) });
        };
        const observer = new ResizeObserver(measure);
        observer.observe(panel);
        measure();
        return () => observer.disconnect();
    }, [setupPanelActive, storyStep]);

    const previewCity = activePreview?.city;
    const previewReach = prototypeActive ? activePreview?.planningReach ?? null : null;
    const destinationPoint = setupPanelActive || storyPreviewVisible ? activePreview?.preferences.destinationPoint ?? null : null;
    const onboardingCameraKey = prototypeActive
        ? JSON.stringify([previewCity?.city_id ?? null, destinationPoint ?? previewReach?.destination ?? null,
            previewReach?.radiusKm ?? null, setupPanelActive, storyReviewActive]) : null;
    useEffect(() => {
        if (!prototypeActive) {
            onboardingCameraRef.current = null;
            return;
        }
        if (!mapStyleReady || onboardingCameraRef.current === onboardingCameraKey) return;
        // Wait for the form's first measurement rather than flying twice on mount.
        if (setupPanelActive && (!onboardingPanelSize.width || !onboardingPanelSize.height)) return;
        stopOrbit();
        const desktop = isDesktopViewport();
        const reducedMotion = prefersReducedMotion();
        const top = setupPanelActive ? desktop ? 80 : Math.min(64, window.innerHeight * 0.1) : 150;
        const padding = {
            top, left: 24,
            right: desktop && setupPanelActive ? onboardingPanelSize.width + 40 : 24,
            bottom: !desktop && setupPanelActive ? Math.min(onboardingPanelSize.height + 12, window.innerHeight - top - 64) : 70,
        };
        const destinationCenter = destinationPoint;
        const bounds = onboardingGeometry.geometry && getGeometryBounds(onboardingGeometry.geometry);
        const fallbackCenter = previewCity?.center ?? (bounds
            ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] as [number, number]
            : null);
        if (!destinationCenter && !fallbackCenter) return;
        onboardingCameraRef.current = onboardingCameraKey;
        mapRef.current?.getMap().setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        const reachBounds = previewReach && getGeometryBounds(previewReach.geometry);
        if (reachBounds) {
            mapRef.current?.fitBounds(reachBounds, { padding, maxZoom: 14, pitch: 0, bearing: 0, animate: !reducedMotion, duration: reducedMotion ? 0 : 500 });
        } else {
            mapRef.current?.easeTo({ center: destinationCenter ?? fallbackCenter!, zoom: destinationCenter ? 13 : 11,
                padding, pitch: 0, bearing: 0, animate: !reducedMotion, duration: reducedMotion ? 0 : 500 });
        }
    }, [prototypeActive, mapStyleReady, previewCity, previewReach, destinationPoint, onboardingGeometry.geometry, onboardingPanelSize, setupPanelActive, stopOrbit, onboardingCameraKey]);

    useEffect(() => {
        const map = mapRef.current?.getMap();
        if (!mapStyleReady || !map?.getLayer(BUILDINGS_3D_LAYER)) return;
        map.setLayoutProperty(BUILDINGS_3D_LAYER, "visibility", is3dEnabled && !setupPanelActive ? "visible" : "none");
    }, [mapStyleReady, is3dEnabled, setupPanelActive]);

    function queryZoneIdAt(x: number, y: number) {
        return mapRef.current?.queryRenderedFeatures([[x - 6, y - 6], [x + 6, y + 6]], {
            layers: regularReach ? [PLANNING_DISTRICT_FILL_ID, ZONE_FILL_LAYER.id] : [ZONE_FILL_LAYER.id],
        })[0]?.properties?.zone_id;
    }

    const showPlanningReach = useCallback(() => {
        if (!regularReach || !mapRef.current) return;
        const bounds = getGeometryBounds(regularReach.geometry);
        cancelPendingSearchFly();
        stopOrbit();
        bottomSheetRef.current?.collapse();
        mapRef.current.getMap().setPadding({ top: 0, right: 0, bottom: 0, left: 0 });
        if (bounds) mapRef.current.fitBounds(bounds, { padding: {
            top: Math.min(isMobileViewport ? 330 : 310, window.innerHeight * 0.42), bottom: Math.min(isMobileViewport ? 170 : 80, window.innerHeight * 0.22),
            left: 56, right: Math.min(desktopPanelWidth + 40, window.innerWidth * 0.45),
        }, pitch: 0, bearing: 0, maxZoom: 14, duration: prefersReducedMotion() ? 0 : 600 });
        else mapRef.current.flyTo({ center: [...regularReach.destination], zoom: 14, pitch: 0, bearing: 0, duration: prefersReducedMotion() ? 0 : 600 });
    }, [regularReach, isMobileViewport, desktopPanelWidth, stopOrbit, cancelPendingSearchFly]);

    useEffect(() => {
        if (!exploring) { regularReachCameraRef.current = false; return; }
        if (!mapStyleReady || !regularReach || regularReachCameraRef.current) return;
        regularReachCameraRef.current = true;
        showPlanningReach();
    }, [exploring, mapStyleReady, regularReach, showPlanningReach]);

    function getEventZone(event: MapMouseEvent) {
        return zonesById.get(event.features?.[0]?.properties?.zone_id ?? queryZoneIdAt(event.point.x, event.point.y));
    }

    const hoveredMetadata = zonesById.get(hoveredZone?.id ?? "");
    const hoveredRentSharePercent = rentSharePercent(hoveredMetadata?.wage_to_rent_ratio ?? null);
    const hoveredProperties = hoveredZone ? propertiesByZone.get(hoveredZone.id) : undefined;
    const hoveredValue = hoveredProperties?.value ?? null;

    if (!accountActive) return null;

    return (
        <div ref={mapContainerRef} data-hci-region="map" className="relative h-full min-h-0 overflow-hidden">
            <MapView ref={mapRef} initialViewState={{ longitude: 106.8456, latitude: -6.2088, zoom: 11 }}
                rotateSpeed={0.4} aroundCenter={false} style={{ width: "100%", height: "100%" }}
                 mapStyle={mapStyle} attributionControl={false} interactiveLayerIds={prototypeActive ? !setupPanelActive && activePreview?.available ? [ONBOARDING_FILL_ID] : [] : onboardingActive ? [] : regularReach ? [ZONE_FILL_LAYER.id, PLANNING_DISTRICT_FILL_ID, "planning-district-point-status"] : [ZONE_FILL_LAYER.id]} cursor={form.pickingDestination || onboardingMapPicking ? "crosshair" : hoveredZone && !onboardingActive ? "pointer" : "grab"}
                onLoad={() => { setMapLoaded(true); syncSearchScope(); }}
                onResize={syncSearchScope}
                onStyleData={() => { if (mapRef.current?.getMap().getLayer(BUILDINGS_3D_LAYER)) setMapStyleReady(true); }}
                 onClick={(event) => {
                      if (storyDraftActive || storyReviewActive) {
                         if (onboardingMapPicking) handleOnboardingMapPick({ longitude: event.lngLat.lng, latitude: event.lngLat.lat });
                         return;
                     }
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
                    if (zone) openZone(zone, false);
                }}
                onMouseDown={() => { stopOrbit(); if (prototypeActive) onboardingCameraRef.current = onboardingCameraKey; }}
                onTouchStart={() => { stopOrbit(); if (prototypeActive) onboardingCameraRef.current = onboardingCameraKey; }}
                onMouseMove={(event) => {
                    if (!exploring) return;
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
                            const zone = zonesById.get(pending.zoneId ?? queryZoneIdAt(pending.x, pending.y));
                            setHoveredZone((current) => !zone && current === null ? current : zone
                                ? { id: zone.zone_id, longitude: pending.longitude, latitude: pending.latitude } : null);
                        });
                    }
                }}
                onMoveEnd={() => {
                    syncSearchScope();
                    const pending = pendingSearchFlyRef.current;
                    if (!pending?.started || pending.zoneId !== state.selectedZone?.zone_id) return;
                    cancelPendingSearchFly();
                    panelOpenTimer.current = window.setTimeout(() => {
                        panelOpenTimer.current = null;
                        setMobilePanelOpen(true);
                    }, 120);
                }}
                onMouseLeave={clearHover}>
                <AttributionControl position="bottom-left" compact customAttribution="Batas wilayah: BIG RBI / DKI Jakarta GIS" />
                {onboardingMapPoint && !((storyDraftActive || storyReviewActive) && storyPreferences) && <Marker longitude={onboardingMapPoint.longitude} latitude={onboardingMapPoint.latitude} anchor="center">
                    <span className="pointer-events-none flex size-6 items-center justify-center rounded-full border-2 border-base-100 bg-primary shadow-overlay"><span className="size-2 rounded-full bg-base-100" /></span>
                </Marker>}
                {prototypeActive && mapContext && activePreview && <OnboardingMapLayers context={mapContext} preview={activePreview}
                    geometry={onboardingGeometry.geometry} mapRef={mapRef} mapLoaded={mapStyleReady} category={category}
                    onDestination={(destination) => form.update(destination
                        ? { destinationId: destination.id, destinationName: destination.name, destinationPoint: destination.center }
                        : { destinationId: null, destinationName: null, destinationPoint: null })}
                    selectedDistrictId={sampleSelectedId} onSelectDistrict={selectPreviewDistrict} />}
                {prototypeActive && !setupPanelActive && sampleSelected && sampleSelectedCenter && <Popup longitude={sampleSelectedCenter[0]} latitude={sampleSelectedCenter[1]}
                    anchor="bottom" offset={28} closeOnClick={false} onClose={() => setSampleSelectedId(null)} className="onboarding-sample-popup">
                    <section aria-label={`Data ${sampleSelected.district.zone_name}`} className="max-w-64 font-body text-ink" data-hci-region="onboarding-result-detail">
                        {sampleSelected.district.is_sample && <span className="badge badge-neutral badge-xs">Data contoh</span>}
                        <h2 className="mt-2 font-sans text-xl font-bold">{sampleSelected.district.zone_name}</h2>
                        <dl className="mt-3 space-y-2 text-sm">
                            <div><dt className="text-xs text-ink-muted">Rata-rata sewa / bulan</dt><dd className="font-semibold">{sampleSelected.rent === null ? "Belum tersedia" : `Rp${formatRupiah(sampleSelected.rent)}`}</dd></div>
                            <div><dt className="text-xs text-ink-muted">Perkiraan sewa + biaya kota</dt><dd className="font-semibold">{sampleSelected.monthlyCost === null ? "Belum tersedia" : `sekitar Rp${formatRupiah(sampleSelected.monthlyCost)}`}</dd></div>
                            <div><dt className="text-xs text-ink-muted">Perkiraan jangkauan</dt><dd className="font-semibold">{activePreview?.planningReach ? planningReachLabel(sampleSelected.reachBand) : "Belum tersedia"}</dd></div>
                        </dl>
                        {sampleSelected.rentFact?.source_url && <p className="mt-3 text-xs leading-relaxed text-ink-muted">Sewa: <a className="link link-hover" href={sampleSelected.rentFact.source_url} target="_blank" rel="noreferrer">Sumber</a></p>}
                        {sampleSelected.district.living_cost?.source_url && <p className="mt-1 text-xs leading-relaxed text-ink-muted">Biaya kota: <a className="link link-hover" href={sampleSelected.district.living_cost.source_url} target="_blank" rel="noreferrer">Sumber</a></p>}
                        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{sampleSelected.eligible === true ? sampleSelected.reasons.join(" · ") : sampleSelected.eligible === false ? sampleSelected.exclusions.join(" · ") : sampleSelected.unknowns.join(" · ")}</p>
                    </section>
                </Popup>}
                {exploring && <>
                    <Source id="region-data" type="geojson" data={layerData}>
                        <Layer {...getZoneFillLayer(category ?? "summary", metricRange)} beforeId={BUILDINGS_3D_LAYER}
                            paint={showRegularReachFill ? { "fill-color": "#9ED9EB", "fill-opacity": 0 } : getZoneFillLayer(category ?? "summary", metricRange).paint}
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
                    {regularReach && <>
                        <PlanningDistrictLayers geometry={regularGeometry.geometry} districts={regularDistricts} selectedId={selectedId} showFill={showRegularReachFill} />
                        <PlanningReachLayers reach={regularReach} idPrefix="explore" showDestination />
                    </>}
                </>}
                {exploring && hoveredZone && hoveredMetadata && hoveredZone.id !== selectedId && <Popup longitude={hoveredZone.longitude} latitude={hoveredZone.latitude}
                    anchor="bottom" offset={12} closeButton={false} closeOnClick={false} className="zone-hover-popup">
                    <div role="tooltip" className="min-w-44 font-body">
                        <p className="font-sans text-base font-bold text-on-ink border-b border-on-ink-muted/40">{hoveredMetadata.zone_name}</p>
                        {category === "summary" && <p className="mt-3 text-sm">{hoveredRentSharePercent === null
                            ? <>Sewa dari gaji rata-rata {hoveredMetadata.city_name}: <span className="font-semibold tabular-nums text-accent">Tidak tersedia</span></>
                            : <>{mapCategories.summary.popupLabel}: sekitar <span className="font-semibold tabular-nums text-accent">{mapCategories.summary.format(hoveredRentSharePercent)}</span> dari gaji rata-rata {hoveredMetadata.city_name}</>}</p>}
                        {category && category !== "summary" && <p className="mt-3 text-sm">{metricConfig.popupLabel}: <span className="font-semibold tabular-nums text-accent">{hoveredValue == null ? "Tidak tersedia" : `${hoveredProperties?.approximate ? "sekitar " : ""}${metricConfig.format(hoveredValue)}`}</span></p>}
                    </div>
                </Popup>}
            </MapView>

            {!onboardingActive && <MapControls
                showProfileReminder={profile.loaded && profile.savedProfile === null && !profileReminderDismissed}
                onCompleteProfile={form.returnToStory}
                onDismissProfileReminder={() => setProfileReminderDismissed(true)}
                sidebarWidth={desktopPanelWidth}
                account={account}
                zones={prototypeActive ? sampleZones : [...zonesById.values()]}
                reachSummary={exploring && regularReach && regularPreview ? <PlanningReachSummary reach={regularReach}
                    districts={regularDistricts} destinationName={regularPreview.preferences.destinationName}
                    loading={form.dataLoading} error={form.dataError}
                    savedRevision={profile.savedProfile?.revision}
                    districtsAvailable={regularDistrictDataAvailable} geometryError={regularGeometry.error}
                    geometryMissing={!regularGeometry.loading && regularDistricts.some((item) => !regularGeometry.geometry?.features.some((feature) => feature.properties.zone_id === item.district.zone_id))}
                    onShowReach={showPlanningReach} onRetry={() => { form.retryData(); regularGeometry.retry(); }} /> : undefined}
                searchScope={searchScope}
                onAreaChange={(area) => {
                    closeSelection();
                    setSearchScope(area.id);
                    mapRef.current?.flyTo({ center: [...area.center], zoom: area.zoom, pitch: 0, bearing: 0, duration: prefersReducedMotion() ? 0 : 1200 });
                }}
                loading={!prototypeActive && state.catalogLoading}
                error={prototypeActive ? null : state.catalogError}
                hasActiveRegionLayers={prototypeActive || state.recommendationsLoading || !!selectedId || layerData.features.length > 0 || campusData.features.length > 0}
                onRetry={state.retryCatalog}
                recommendationsLoading={!prototypeActive && state.recommendationsLoading}
                recommendationsError={prototypeActive ? null : state.recommendationsError}
                onRetryRecommendations={state.retryRecommendations}
                heatmapLoading={cells.loading}
                heatmapError={cells.error}
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
                    setEducationMetric("schools");
                    state.resetMap();
                }} />}
            {passwordUpdated && <p role="status" className="pointer-events-none absolute left-1/2 top-32 z-200 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-rule bg-base-100 px-4 py-3 text-center font-body text-sm font-semibold text-ink shadow-overlay md:top-20" data-hci-region="account-feedback">
                Kata sandi berhasil diperbarui. Kamu tetap masuk ke akun.
            </p>}
            {!onboardingActive && savedProfileRevision !== null && !regularReach && <p role="status" data-hci-region="profile-save-feedback" className="pointer-events-none absolute left-1/2 top-32 z-200 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-rule bg-base-100 px-4 py-3 font-body text-sm font-semibold text-ink shadow-overlay md:top-20">
                Profil tersimpan di akunmu · revisi {savedProfileRevision}
            </p>}
            {profileLoadFailed && <div role="alert" data-hci-region="profile-load-feedback" className="absolute left-1/2 top-32 z-200 w-[min(24rem,calc(100%-2rem))] -translate-x-1/2 rounded-xl border border-rule bg-base-100 px-4 py-3 font-body text-sm text-ink shadow-overlay md:top-20">
                <p>Profil terbaru belum dapat dimuat. Profil tersimpan tidak berubah.</p>
                <button type="button" onClick={() => window.location.reload()} className="btn btn-ghost mt-1 min-h-11 px-0 text-primary">Coba lagi</button>
            </div>}
            {!onboardingActive && !sheetCoversTools && <div className={`pointer-events-auto absolute bottom-(--map-tools-bottom) z-100 flex w-11 flex-col gap-2 font-body transition-[bottom] duration-200 motion-reduce:transition-none md:bottom-(--map-tools-md-bottom) right-(--map-tools-right)`} style={{ "--map-tools-right": desktopPanelWidth ? `${desktopPanelWidth + 12}px` : "1rem",
                    "--map-tools-md-bottom": `${SHEET_MIN_HEIGHT + 16}px`, "--map-tools-bottom":`calc(var(--map-sheet-height, ${bottomSheetState.height}px) + ${!bottomSheetState.isExpanded && !(isMobileViewport && mobilePanelOpen) ? "var(--map-chat-height, 112px) + 32px" : "16px"})` } as CSSProperties}>
                <Buildings3dToggle enabled={is3dEnabled} onToggle={() => setIs3dEnabled((enabled) => !enabled)} />
                {!prototypeActive && !showRegularReachFill && (layerData.features.length > 0 || cellSummary) && <MapLegend category={category ?? "summary"} range={metricRange}
                    educationMetric={educationMetric} onEducationMetricChange={setEducationMetric}
                    detailsByZone={state.results} visibleZoneIds={visibleZoneIds} selectedZoneName={state.selectedZone?.zone_name ?? null}
                    cellLayerOptions={selectedId ? cellOptions : []} activeCellLayer={selectedId ? activeCellLayer : null}
                    cellSummary={cellSummary} cellsLoading={cells.loading} cellsError={cells.error}
                    onCellLayerChange={setCellLayerId}
                    companyPointShown={companyPointActive && companyPointData.features.length > 0} />}
                <MapZoomControls onZoomIn={() => mapRef.current?.zoomIn({ duration: prefersReducedMotion() ? 0 : 300 })}
                    onZoomOut={() => mapRef.current?.zoomOut({ duration: prefersReducedMotion() ? 0 : 300 })} />
            </div>}
            {exploring && state.selectedZone && (
                <ZoneIntelligencePanel
                    zoneName={state.selectedZone.zone_name}
                    details={selectedResult ?? null}
                    category={category ?? "summary"}
                    isSample={selectedResult?.is_sample ?? zonesById.get(selectedId ?? "")?.is_sample ?? false}
                    loading={state.loading}
                    error={state.error}
                    geometryMissing={selectedGeometry?.features.length === 0}
                    mobileOpen={mobilePanelOpen}
                    onRetry={() => { if (state.selectedZone) void state.selectZone(state.selectedZone, true); }}
                    onClose={closeSelection} />
            )}
            {!onboardingActive && <MapBottomSheet
                ref={bottomSheetRef}
                zones={prototypeActive ? sampleZones : regularDistrictDataAvailable ? regularZones : state.catalog.zones}
                recommendations={prototypeActive ? previewDistricts : regularReach || regularDistrictDataAvailable ? regularDistricts : undefined}
                restrictSelectionToHousingData={prototypeActive}
                reachActive={prototypeActive ? !!activePreview?.planningReach : !!regularReach}
                title={regularDistrictDataAvailable ? regularReach ? "Kecamatan di sekitar tujuanmu" : "Kecamatan sesuai profilmu" : undefined}
                emptyMessage={regularDistrictDataAvailable ? "Tidak ada kecamatan dengan batas anggaran ini." : undefined}
                onEditPreferences={prototypeActive ? () => {
                    if (confirmedProfile) { router.push("/user"); return; }
                    if (storyPreviewVisible) {
                        setStoryPreviewVisible(false);
                        form.selectPreviewCity(undefined);
                        form.returnToStory();
                    } else form.open();
                } : regularReach ? () => router.push("/user") : undefined}
                onSelect={selectZone}
                onStateChange={handleBottomSheetStateChange}
                onHeightChange={handleSheetHeightChange}
            />}
            <MapChatComposer
                containerRef={chatComposerRef}
                visible={exploring && !bottomSheetState.isExpanded && !mobilePanelShown && !sheetCoversTools}
                isDragging={bottomSheetState.isDragging}
                sheetHeight={bottomSheetState.height}
                sidebarWidth={desktopPanelWidth}
                category={category}
                selectedZoneName={state.selectedZone?.zone_name ?? null}
                onClearContext={closeSelection}
            />
            <RelocationOnboarding
                account={identity}
                step={storyStep}
                onStepChange={setStoryStep}
                proposal={storyProposal}
                onProposalChange={setStoryProposal}
                savedProfile={profile.savedProfile}
                savedProfileLoaded={profile.settled}
                skipRestoredDraft={!!confirmedProfile}
                onSaveProfile={confirmStoryProfileSaved}
                mapPoint={onboardingMapPoint}
                onMapPointChange={setOnboardingMapPoint}
                selectedOffice={onboardingOffice}
                onOfficeChange={handleOnboardingOfficeChange}
                onMapPickingChange={handleOnboardingMapPickingChange}
                mapPicking={onboardingMapPicking}
                preview={storyReviewActive ? activePreview : null}
                selectedDistrictId={sampleSelectedId}
                onSelectDistrict={selectPreviewDistrict}
                onOnboardingActiveChange={handleOnboardingActiveChange}
                formSession={form.session}
                formReady={form.ready}
                storyOpenRequest={form.storyOpenRequest}
                onOpenForm={form.open}
                costRange={storyCostRange}
                costCityName={storyReviewActive && storyPreview?.city ? getCityAreaName(storyPreview.city) : null}
                costLoading={storyReviewActive && storyDataLoading}
            />
            {(form.active || storyReviewActive) && <div className={`absolute left-4 top-4 z-100 ${storyReviewActive ? "hidden md:block" : ""}`}><BrandLogo /></div>}
            {prototypeActive && activePreview && <OnboardingPreview session={storyMapVisible ? null : form.session} preview={activePreview}
                geometryLoading={onboardingGeometry.loading} geometryError={onboardingGeometry.error} onRetry={onboardingGeometry.retry} category={category}
                dataLoading={form.dataLoading} dataError={form.dataError} onRetryData={form.retryData}
                selectedDistrictId={sampleSelectedId} onSelectDistrict={selectPreviewDistrict}
                stepOverride={storyDraftActive ? 2 : storyReviewActive || storyPreviewVisible ? 4 : undefined}
                completedOverride={storyDraftActive || storyReviewActive ? false : storyPreviewVisible ? true : undefined} proposal={storyDraftActive || storyReviewActive}
                transportLabel={activePreview.preferences.transport ? transportLabels[activePreview.preferences.transport] : "belum dipilih"}
                onEditPreferences={() => {
                    if (confirmedProfile) { router.push("/user"); return; }
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
                    const saved = await saveRelocationProfile({ form_answers: form.session!.answers }, identity);
                    confirmProfileSaved(saved);
                    setSampleSelectedId(null); setCategory("summary"); form.finish();
                }} storageAvailable={form.storageAvailable} preview={activePreview ?? form.preview} />}
        </div>
    );
}
