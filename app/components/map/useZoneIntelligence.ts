"use client";

import { useEffect, useRef, useState } from "react";
import { beginHciResponse } from "@/app/engine/lib/hciTelemetry";
import { getZoneGeometry, getZoneIntelligence, getZoneMapData, getZones } from "@/app/engine/lib/zoneApi";
import type { Zone, ZoneDetailResult, ZoneGeometry, ZoneListResponse } from "@/app/engine/types";
import { getMetroArea, isMetroCity, type MetroAreaId } from "@/app/engine/lib/metroArea";

// Curated picks lead an area's recommendations; the catalog's ranking (wage-to-rent
// ratio) fills the remaining slots, so every area shows five kecamatan.
const FEATURED_ZONE_IDS: Partial<Record<MetroAreaId, string[]>> = {
    jabodetabek: [
        "jakarta-selatan-setiabudi",
        "jakarta-selatan-tebet",
        "jakarta-pusat-menteng",
        "jakarta-selatan-kebayoran-baru",
        "jakarta-pusat-tanah-abang",
    ],
};

export function useZoneIntelligence(enabled: boolean, areaId: MetroAreaId | null) {
    const [catalog, setCatalog] = useState<ZoneListResponse>({ is_sample: false, zones: [] });
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogRevision, setCatalogRevision] = useState(0);
    const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
    const [geometryByZone, setGeometryByZone] = useState<Record<string, ZoneGeometry>>({});
    const [results, setResults] = useState<Record<string, ZoneDetailResult>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef<AbortController | null>(null);
    const recommendationsRef = useRef<AbortController | null>(null);
    const geometryCache = useRef<Record<string, ZoneGeometry>>({});
    const selectedIdRef = useRef<string | null>(null);
    const detailsCache = useRef<Record<string, ZoneDetailResult>>({});
    const [showRecommendations, setShowRecommendations] = useState(true);
    const [recommendationRevision, setRecommendationRevision] = useState(0);
    const [recommendationsLoading, setRecommendationsLoading] = useState(false);
    const [recommendationsError, setRecommendationsError] = useState<string | null>(null);

    async function loadZone(zoneId: string, signal: AbortSignal, retry = false) {
        const cachedGeometry = retry ? undefined : geometryCache.current[zoneId];
        const cachedDetails = retry ? undefined : detailsCache.current[zoneId];
        if (!cachedGeometry && !cachedDetails) {
            try {
                const result = await getZoneMapData(zoneId, signal);
                return {
                    geometry: result.geometry ? { status: "fulfilled" as const, value: result.geometry } :
                        { status: "rejected" as const, reason: new Error(result.geometryError ?? "Batas kecamatan tidak tersedia.") },
                    details: { status: "fulfilled" as const, value: result.details },
                };
            } catch (error) {
                return {
                    geometry: { status: "rejected" as const, reason: error },
                    details: { status: "rejected" as const, reason: error },
                };
            }
        }

        const [geometry, details] = await Promise.allSettled([
            cachedGeometry ? Promise.resolve(cachedGeometry) : getZoneGeometry(zoneId, signal),
            cachedDetails ? Promise.resolve(cachedDetails) : getZoneIntelligence(zoneId, signal),
        ] as const);
        return { geometry, details };
    }

    useEffect(() => {
        if (!enabled) return;
        const controller = new AbortController();
        getZones(controller.signal).then((data) => {
            if (!controller.signal.aborted) setCatalog(data);
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : "Daftar kecamatan belum dapat dimuat.");
        }).finally(() => {
            if (!controller.signal.aborted) setCatalogLoading(false);
        });
        return () => controller.abort();
    }, [catalogRevision, enabled]);

    useEffect(() => () => requestRef.current?.abort(), []);

    useEffect(() => {
        if (!enabled || !showRecommendations || catalogLoading || catalogError || catalog.zones.length === 0) return;
        const controller = new AbortController();
        recommendationsRef.current = controller;
        const area = getMetroArea(areaId);
        const areaZones = area ? catalog.zones.filter((zone) => isMetroCity(area, zone)) : catalog.zones;
        const featured = (areaId ? FEATURED_ZONE_IDS[areaId] ?? [] : [])
            .flatMap((id) => areaZones.find((zone) => zone.zone_id === id) ?? []);
        const topFive = [...new Set([...featured, ...areaZones])].slice(0, 5);
        const cached = Object.fromEntries(topFive.flatMap((zone) => {
            const geometry = geometryCache.current[zone.zone_id];
            return geometry ? [[zone.zone_id, geometry]] : [];
        }));
        // Switching areas drops the previous area's shapes; the open selection stays drawn.
        const areaIds = new Set(areaZones.map((zone) => zone.zone_id));
        setGeometryByZone((current) => ({
            ...Object.fromEntries(Object.entries(current).filter(([id]) => areaIds.has(id) || id === selectedIdRef.current)),
            ...cached,
        }));
        setRecommendationsLoading(true);
        setRecommendationsError(null);

        const requests = topFive.map(async (zone) => ({ zoneId: zone.zone_id, ...await loadZone(zone.zone_id, controller.signal) }));

        function commit(batch: Awaited<(typeof requests)[number]>[]) {
            const geometries: Record<string, ZoneGeometry> = {};
            const detailsByZone: Record<string, ZoneDetailResult> = {};
            for (const result of batch) {
                if (result.geometry.status === "fulfilled" && result.geometry.value.features.length > 0) {
                    geometries[result.zoneId] = result.geometry.value;
                    geometryCache.current[result.zoneId] = result.geometry.value;
                }
                if (result.details.status === "fulfilled") {
                    detailsByZone[result.zoneId] = result.details.value;
                    detailsCache.current[result.zoneId] = result.details.value;
                }
            }
            if (Object.keys(geometries).length) setGeometryByZone((current) => ({ ...current, ...geometries }));
            if (Object.keys(detailsByZone).length) setResults((current) => ({ ...current, ...detailsByZone }));
        }

        void (async () => {
            // Paint the first ready region promptly, then commit the remaining results together.
            const first = await Promise.race(requests);
            if (controller.signal.aborted) return;
            commit([first]);
            const results = await Promise.all(requests);
            if (controller.signal.aborted) return;
            commit(results.filter((result) => result !== first));
            if (results.some(({ geometry, details }) => geometry.status === "rejected" || geometry.value.features.length === 0 || details.status === "rejected")) {
                setRecommendationsError("Sebagian kecamatan rekomendasi gagal dimuat.");
            }
            setRecommendationsLoading(false);
        })();

        return () => controller.abort();
    }, [catalog, catalogLoading, catalogError, enabled, showRecommendations, recommendationRevision, areaId]);

    async function selectZone(zone: Zone, retry = false) {
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        selectedIdRef.current = zone.zone_id;
        setSelectedZone(zone);
        setError(null);
        const cachedGeometry = geometryByZone[zone.zone_id] ?? geometryCache.current[zone.zone_id];
        const cachedDetails = detailsCache.current[zone.zone_id];
        if (cachedGeometry && !geometryByZone[zone.zone_id]) setGeometryByZone((current) => ({ ...current, [zone.zone_id]: cachedGeometry }));
        if (cachedGeometry && cachedDetails && !retry) {
            setLoading(false);
            return;
        }
        setLoading(true);

        const finishResponse = beginHciResponse(controller.signal);
        try {
            const { geometry, details } = await loadZone(zone.zone_id, controller.signal, retry);
            if (controller.signal.aborted) return;

            if (geometry.status === "fulfilled") {
                geometryCache.current[zone.zone_id] = geometry.value;
                setGeometryByZone((current) => ({ ...current, [zone.zone_id]: geometry.value }));
            }
            if (details.status === "fulfilled") {
                detailsCache.current[zone.zone_id] = details.value;
                setResults((current) => ({ ...current, [zone.zone_id]: details.value }));
            }

            const errors: string[] = [];
            if (geometry.status === "rejected") {
                errors.push(geometry.reason instanceof Error ? geometry.reason.message : "Batas kecamatan gagal dimuat.");
            }
            if (details.status === "rejected") {
                errors.push(details.reason instanceof Error ? details.reason.message : "Data kecamatan gagal dimuat.");
            }
            setError(errors.length ? [...new Set(errors)].join(" ") : null);
            setLoading(false);
        } finally {
            finishResponse();
        }
    }

    function closeSelection() {
        requestRef.current?.abort();
        selectedIdRef.current = null;
        setSelectedZone(null);
        setLoading(false);
        setError(null);
    }

    function resetMap() {
        recommendationsRef.current?.abort();
        setShowRecommendations(false);
        setRecommendationsLoading(false);
        setRecommendationsError(null);
        closeSelection();
        setGeometryByZone({});
    }

    function restoreRecommendations() {
        setShowRecommendations(true);
    }

    function retryRecommendations() {
        setRecommendationRevision((value) => value + 1);
    }

    function retryCatalog() {
        setCatalogError(null);
        setCatalogLoading(true);
        setCatalogRevision((value) => value + 1);
    }

    return {
        catalog, catalogLoading, catalogError, retryCatalog,
        selectedZone, selectZone, closeSelection, resetMap,
        restoreRecommendations, retryRecommendations, recommendationsLoading, recommendationsError,
        geometryByZone, results, loading, error,
    };
}
