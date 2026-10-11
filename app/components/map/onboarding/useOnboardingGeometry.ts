"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/app/engine/lib/zoneApi";
import { isBoundary, isRecord } from "@/app/engine/lib/zoneGeometry";
import { ZONE_BOUNDARY_REQUEST_TIMEOUT_MS } from "@/app/engine/lib/zoneRequestTimeouts";
import type { ZoneGeometry } from "@/app/engine/types";

type CityBoundaryResponse = { geometry: ZoneGeometry; missingZones: string[] };

function parseCityBoundaries(value: unknown, expectedIds: Set<string>): CityBoundaryResponse {
    if (!isRecord(value) || !isRecord(value.geometry) || value.geometry.type !== "FeatureCollection" || !Array.isArray(value.geometry.features) ||
        !Array.isArray(value.missingZones) || value.missingZones.some((id) => typeof id !== "string" || !expectedIds.has(id))) {
        throw new Error("Batas kecamatan belum valid.");
    }
    const features: ZoneGeometry["features"] = value.geometry.features.map((feature) => {
        if (!isRecord(feature) || feature.type !== "Feature" || !isBoundary(feature.geometry) || !isRecord(feature.properties) ||
            typeof feature.properties.zone_id !== "string" || typeof feature.properties.zone_name !== "string" ||
            !expectedIds.has(feature.properties.zone_id)) throw new Error("Batas tidak sesuai dengan kota yang dipilih.");
        return feature as unknown as ZoneGeometry["features"][number];
    });
    if (!features.length && !value.missingZones.length) throw new Error("Batas kecamatan tidak ditemukan.");
    return { geometry: { type: "FeatureCollection", features }, missingZones: value.missingZones as string[] };
}

export function useOnboardingGeometry(enabled: boolean, cityId: string | null, zoneIds: string[]) {
    const [revision, setRevision] = useState(0);
    // Ranking can reorder districts without changing the boundaries we need.
    const zoneKey = [...new Set(zoneIds)].sort().join("|");
    const scopeKey = enabled && cityId && zoneKey ? `${cityId}\u001f${zoneKey}` : null;
    const requestKey = scopeKey ? `${scopeKey}\u001f${revision}` : null;
    const [request, setRequest] = useState<{
        key: string; scope: string | null; geometry: ZoneGeometry | null; error: string | null; loading: boolean;
    }>({ key: "", scope: null, geometry: null, error: null, loading: false });

    useEffect(() => {
        if (!requestKey || !cityId) return;
        const controller = new AbortController();
        const expectedIds = new Set(zoneKey.split("|"));
        const timer = window.setTimeout(() => {
            setRequest((current) => ({ key: requestKey, scope: scopeKey,
                geometry: current.scope === scopeKey ? current.geometry : null, error: null, loading: true }));
            void getJson(`/api/onboarding/geometry?city_id=${encodeURIComponent(cityId)}`, controller.signal, ZONE_BOUNDARY_REQUEST_TIMEOUT_MS)
                .then((data) => parseCityBoundaries(data, expectedIds))
                .then((result) => {
                    if (controller.signal.aborted) return;
                    setRequest({
                        key: requestKey,
                        scope: scopeKey,
                        geometry: result.geometry,
                        error: result.missingZones.length ? `${result.missingZones.length} batas kecamatan belum tersedia.` : null,
                        loading: false,
                    });
                })
                .catch((cause: unknown) => {
                    if (!controller.signal.aborted) setRequest((current) => ({ key: requestKey, scope: scopeKey,
                        geometry: current.scope === scopeKey ? current.geometry : null,
                        error: cause instanceof Error ? cause.message : "Batas kecamatan belum tersedia.", loading: false }));
                });
        }, 0);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [requestKey, cityId, zoneKey, scopeKey]);

    const currentRequest = requestKey !== null && request.key === requestKey;
    return {
        geometry: scopeKey !== null && request.scope === scopeKey ? request.geometry : null,
        loading: requestKey !== null && (!currentRequest || request.loading),
        error: currentRequest ? request.error : null,
        retry: () => setRevision((value) => value + 1),
    };
}
