"use client";

import { useEffect, useState } from "react";
import { demoDistricts } from "@/app/engine/onboarding/demoData";
import { isBoundary, isRecord } from "@/app/engine/lib/zoneGeometry";
import type { ZoneGeometry } from "@/app/engine/types";

export function useOnboardingGeometry(enabled: boolean) {
    const [geometry, setGeometry] = useState<ZoneGeometry | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        if (!enabled || geometry) return;
        const controller = new AbortController();
        void fetch("/onboarding/jakarta-selatan.geojson", { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error("Batas kecamatan belum berhasil dimuat.");
                const data: unknown = await response.json();
                if (!isRecord(data) || data.type !== "FeatureCollection" || !Array.isArray(data.features) || data.features.length !== 10) {
                    throw new Error("Berkas batas kecamatan tidak valid.");
                }
                const ids = new Set<string>();
                for (const feature of data.features) {
                    if (!isRecord(feature) || !isBoundary(feature.geometry) || !isRecord(feature.properties)) {
                        throw new Error("Batas kecamatan tidak sesuai dengan pratinjau.");
                    }
                    const properties = feature.properties;
                    if (!demoDistricts.some((district) => district.id === properties.zone_id && district.name === properties.zone_name)) {
                        throw new Error("Batas kecamatan tidak sesuai dengan pratinjau.");
                    }
                    ids.add(String(feature.properties.zone_id));
                }
                if (ids.size !== 10) throw new Error("Batas kecamatan tidak lengkap.");
                return data as unknown as ZoneGeometry;
            }).then((data) => { if (!controller.signal.aborted) { setGeometry(data); setError(null); } })
            .catch((cause: unknown) => {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Batas kecamatan belum tersedia.");
            });
        return () => controller.abort();
    }, [enabled, geometry, revision]);
    return { geometry, loading: enabled && !geometry && !error, error, retry: () => { setError(null); setRevision((value) => value + 1); } };
}
