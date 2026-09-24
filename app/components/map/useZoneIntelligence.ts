"use client";

import { useEffect, useRef, useState } from "react";
import { getZoneGeometry, getZoneIntelligence, getZones } from "@/app/engine/lib/zoneApi";
import type { Zone, ZoneGeometry, ZoneIntelligenceResult, ZoneListResponse } from "@/app/engine/types";

export function useZoneIntelligence() {
    const [catalog, setCatalog] = useState<ZoneListResponse>({ is_sample: false, zones: [] });
    const [catalogError, setCatalogError] = useState<string | null>(null);
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [catalogRevision, setCatalogRevision] = useState(0);
    const [selectedZone, setSelectedZone] = useState<Zone | null>(null);
    const [geometryByZone, setGeometryByZone] = useState<Record<string, ZoneGeometry>>({});
    const [results, setResults] = useState<Record<string, ZoneIntelligenceResult>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestRef = useRef<AbortController | null>(null);

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

    async function selectZone(zone: Zone) {
        requestRef.current?.abort();
        const controller = new AbortController();
        requestRef.current = controller;
        setSelectedZone(zone);
        setLoading(true);
        setError(null);

        // A failed snapshot request must not prevent a valid boundary from rendering.
        const [geometry, intelligence] = await Promise.allSettled([
            getZoneGeometry(zone.zone_id, controller.signal).then((result) => {
                if (!controller.signal.aborted) {
                    setGeometryByZone((current) => ({ ...current, [zone.zone_id]: result }));
                }
                return result;
            }),
            getZoneIntelligence(zone.zone_id, controller.signal).then((result) => {
                if (!controller.signal.aborted) {
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
        if (intelligence.status === "rejected") {
            errors.push(intelligence.reason instanceof Error ? intelligence.reason.message : "Intelligence request failed");
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
        closeSelection();
        setGeometryByZone({});
    }

    function retryCatalog() {
        setCatalogError(null);
        setCatalogLoading(true);
        setCatalogRevision((value) => value + 1);
    }

    return {
        catalog, catalogLoading, catalogError, retryCatalog,
        selectedZone, selectZone, closeSelection, resetMap,
        geometryByZone, results, loading, error,
    };
}
