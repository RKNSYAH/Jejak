"use client";

import { useEffect, useRef, useState } from "react";
import { getZoneGeometry, getZoneIntelligence, getZones } from "@/app/engine/lib/zoneApi";
import type { Zone, ZoneDetailResult, ZoneGeometry, ZoneListResponse } from "@/app/engine/types";

export function useZoneIntelligence() {
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
    const detailsCache = useRef<Record<string, ZoneDetailResult>>({});
    const [showRecommendations, setShowRecommendations] = useState(true);
    const [recommendationRevision, setRecommendationRevision] = useState(0);
    const [recommendationsLoading, setRecommendationsLoading] = useState(false);
    const [recommendationsError, setRecommendationsError] = useState<string | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        getZones(controller.signal).then((data) => {
            if (!controller.signal.aborted) setCatalog(data);
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setCatalogError(error instanceof Error ? error.message : "Unable to load zones");
        }).finally(() => {
            if (!controller.signal.aborted) setCatalogLoading(false);
        });
        return () => controller.abort();
    }, [catalogRevision]);

    useEffect(() => () => requestRef.current?.abort(), []);

    useEffect(() => {
        if (!showRecommendations || catalogLoading || catalogError || catalog.zones.length === 0) return;
        const controller = new AbortController();
        recommendationsRef.current = controller;
        const topFive = catalog.zones.slice(0, 5);
        const cached = Object.fromEntries(topFive.flatMap((zone) => {
            const geometry = geometryCache.current[zone.zone_id];
            return geometry ? [[zone.zone_id, geometry]] : [];
        }));
        if (Object.keys(cached).length) setGeometryByZone((current) => ({ ...current, ...cached }));
        setRecommendationsLoading(true);
        setRecommendationsError(null);

        void Promise.all(topFive.map(async (zone) => {
            const [geometry, details] = await Promise.allSettled([
                geometryCache.current[zone.zone_id]
                    ? Promise.resolve(geometryCache.current[zone.zone_id])
                    : getZoneGeometry(zone.zone_id, controller.signal),
                detailsCache.current[zone.zone_id]
                    ? Promise.resolve(detailsCache.current[zone.zone_id])
                    : getZoneIntelligence(zone.zone_id, controller.signal),
            ]);
            if (controller.signal.aborted) return 0;
            if (geometry.status === "fulfilled" && geometry.value.features.length > 0) {
                geometryCache.current[zone.zone_id] = geometry.value;
                setGeometryByZone((current) => ({ ...current, [zone.zone_id]: geometry.value }));
            }
            if (details.status === "fulfilled") {
                detailsCache.current[zone.zone_id] = details.value;
                setResults((current) => ({ ...current, [zone.zone_id]: details.value }));
            }
            return Number(geometry.status === "rejected" || geometry.value.features.length === 0) + Number(details.status === "rejected");
        })).then((failures) => {
            if (controller.signal.aborted) return;
            if (failures.some(Boolean)) setRecommendationsError("Some ranked regions could not be loaded. Retry to load missing data.");
            setRecommendationsLoading(false);
        });

        return () => controller.abort();
    }, [catalog, catalogLoading, catalogError, showRecommendations, recommendationRevision]);

    async function selectZone(zone: Zone, retry = false) {
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        setSelectedZone(zone);
        setError(null);
        const cachedGeometry = geometryByZone[zone.zone_id] ?? geometryCache.current[zone.zone_id];
        const cachedDetails = detailsCache.current[zone.zone_id];
        if (cachedGeometry) setGeometryByZone((current) => ({ ...current, [zone.zone_id]: cachedGeometry }));
        if (cachedGeometry && cachedDetails && !retry) {
            setLoading(false);
            return;
        }
        setLoading(true);

        // Each response joins the visible set independently; a detail failure cannot remove a boundary.
        const [geometry, details] = await Promise.allSettled([
            cachedGeometry && !retry ? Promise.resolve(cachedGeometry) : getZoneGeometry(zone.zone_id, controller.signal).then((result) => {
                if (!controller.signal.aborted) {
                    geometryCache.current[zone.zone_id] = result;
                    setGeometryByZone((current) => ({ ...current, [zone.zone_id]: result }));
                }
                return result;
            }),
            cachedDetails && !retry ? Promise.resolve(cachedDetails) : getZoneIntelligence(zone.zone_id, controller.signal).then((result) => {
                if (!controller.signal.aborted) {
                    detailsCache.current[zone.zone_id] = result;
                    setResults((current) => ({ ...current, [zone.zone_id]: result }));
                }
                return result;
            }),
        ]);
        if (controller.signal.aborted) return;

        const errors: string[] = [];
        if (geometry.status === "rejected") {
            errors.push(geometry.reason instanceof Error ? geometry.reason.message : "Boundary request failed");
        }
        if (details.status === "rejected") {
            errors.push(details.reason instanceof Error ? details.reason.message : "Region data request failed");
        }
        setError(errors.length ? errors.join(" ") : null);
        setLoading(false);
    }

    function closeSelection() {
        requestRef.current?.abort();
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
