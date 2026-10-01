"use client";

import { useEffect, useState } from "react";
import { getMapCells } from "@/app/engine/lib/zoneApi";
import type { MapCategory, MapCellsResponse } from "@/app/engine/types";
import { cellLayers } from "./mapMetrics";

type Entry = { data: MapCellsResponse } | { error: string };

// Loads the H3 cells of the selected district once per category that has cell layers.
export function useMapCells(zoneId: string | null, category: MapCategory | null, includeGeometry: boolean) {
    const baseKey = zoneId && category && cellLayers[category]?.length ? `${zoneId}:${category}` : null;
    const key = baseKey ? `${baseKey}:${includeGeometry ? "full" : "points"}` : null;
    const [entries, setEntries] = useState<Record<string, Entry>>({});
    // A full response also supplies every centroid needed by a glow layer.
    const fullEntry = baseKey ? entries[`${baseKey}:full`] : undefined;
    const entry = key ? entries[key] ?? (!includeGeometry && fullEntry && "data" in fullEntry ? fullEntry : undefined) : undefined;

    useEffect(() => {
        if (!key || !zoneId || !category || entry) return;
        const controller = new AbortController();
        getMapCells(zoneId, category, controller.signal, includeGeometry).then((data) => {
            if (!controller.signal.aborted) setEntries((current) => ({ ...current, [key]: { data } }));
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setEntries((current) => ({
                ...current, [key]: { error: error instanceof Error ? error.message : "Heatmap belum dapat dimuat." },
            }));
        });
        return () => controller.abort();
    }, [key, zoneId, category, includeGeometry, entry]);

    return {
        enabled: key !== null,
        data: entry && "data" in entry ? entry.data : null,
        loading: key !== null && !entry,
        error: entry && "error" in entry ? entry.error : null,
        retry() {
            if (!key) return;
            setEntries((current) => {
                const next = { ...current };
                delete next[key];
                return next;
            });
        },
    };
}
