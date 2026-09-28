"use client";

import { useEffect, useState } from "react";
import { getMapCells } from "@/app/engine/lib/zoneApi";
import type { MapCategory, MapCellsResponse } from "@/app/engine/types";
import { cellLayers } from "./mapMetrics";

type Entry = { data: MapCellsResponse } | { error: string };

// Loads the H3 cells of the selected district once per category that has cell layers.
export function useMapCells(zoneId: string | null, category: MapCategory | null) {
    const key = zoneId && category && cellLayers[category]?.length ? `${zoneId}:${category}` : null;
    const [entries, setEntries] = useState<Record<string, Entry>>({});
    const entry = key ? entries[key] : undefined;

    useEffect(() => {
        if (!key || !zoneId || !category || entry) return;
        const controller = new AbortController();
        getMapCells(zoneId, category, controller.signal).then((data) => {
            if (!controller.signal.aborted) setEntries((current) => ({ ...current, [key]: { data } }));
        }).catch((error: unknown) => {
            if (!controller.signal.aborted) setEntries((current) => ({
                ...current, [key]: { error: error instanceof Error ? error.message : "Unable to load heatmap" },
            }));
        });
        return () => controller.abort();
    }, [key, zoneId, category, entry]);

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
