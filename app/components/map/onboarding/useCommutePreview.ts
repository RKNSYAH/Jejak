"use client";

import { useEffect, useMemo, useState } from "react";
import { getCommute } from "@/app/engine/lib/commuteApi";
import { districtRoutingOrigins, previewDestination, scenarioDeparture } from "@/app/engine/routing/sampling";
import type { CommuteRequest, CommuteResponse } from "@/app/engine/routing/types";
import type { LiveOnboardingPreview, OnboardingArea } from "@/app/engine/onboarding/types";
import type { ZoneGeometry } from "@/app/engine/types";

export function useCommutePreview(preview: LiveOnboardingPreview | null, geometry: ZoneGeometry | null,
    enabled: boolean, selectedOriginId: string | null) {
    const [revision, setRevision] = useState(0);
    const areaKey = JSON.stringify(preview?.districts.map(({ district }) => ({ zone_id: district.zone_id, center: district.center })) ?? []);
    const origins = useMemo(() => enabled
        ? districtRoutingOrigins(JSON.parse(areaKey) as Pick<OnboardingArea, "zone_id" | "center">[], geometry)
        : [], [areaKey, geometry, enabled]);
    const request = useMemo<CommuteRequest | null>(() => {
        if (!enabled || !preview?.available || !preview.preferences.transport) return null;
        const destination = previewDestination(preview.preferences, preview.destinations);
        if (!destination || !origins.length || origins.length > 120) return null;
        return { destination, mode: preview.preferences.transport, origins,
            departureAt: preview.preferences.transport === "transit" ? scenarioDeparture(preview.preferences.departure) : null,
            maxMinutes: Math.max(1, Math.min(120, Math.round(preview.preferences.commuteMinutes ?? 45))),
            selectedOriginId: origins.some((origin) => origin.id === selectedOriginId) ? selectedOriginId : null, includeReach: true };
    }, [preview, origins, enabled, selectedOriginId]);
    // Value identity, not unstable React object references. Budget/rank changes do not re-route.
    const key = request ? JSON.stringify(request) : null;
    const requestKey = key === null ? null : `${revision}:${key}`;
    const [state, setState] = useState<{ key: string; data: CommuteResponse | null; error: string | null }>({ key: "", data: null, error: null });
    useEffect(() => {
        if (!key || !requestKey) return;
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            void getCommute(JSON.parse(key) as CommuteRequest, controller.signal).then((data) => {
                if (!controller.signal.aborted) setState({ key: requestKey, data, error: null });
            }).catch((cause: unknown) => {
                if (!controller.signal.aborted) setState({ key: requestKey, data: null,
                    error: cause instanceof Error ? cause.message : "Estimasi rute belum tersedia." });
            });
        }, 350);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [key, requestKey]);
    const current = requestKey !== null && state.key === requestKey;
    return { data: current ? state.data : null, error: current ? state.error : null,
        loading: requestKey !== null && !current, retry: () => setRevision((value) => value + 1) };
}
