"use client";

import { useCallback, useEffect, useState } from "react";
import { handleAuthFailure } from "@/app/engine/lib/authRedirect";
import { isStoredRelocationProfile, readRelocationProfileCache } from "@/app/engine/lib/relocationProfileCache";
import { isRecord } from "@/app/engine/lib/zoneGeometry";
import type { StoredRelocationProfile } from "@/app/engine/lib/relocationProfile";
import { useUserProfileStore } from "@/app/stores/userStores";

export function useSavedRelocationProfile(userId: string, initialProfile?: StoredRelocationProfile | null) {
    const savedProfile = useUserProfileStore((state) => state.relocationProfileUserId === userId ? state.relocationProfile : null);
    const loaded = useUserProfileStore((state) => state.relocationProfileUserId === userId);
    const storeProfile = useUserProfileStore((state) => state.setRelocationProfile);
    const [failedUserId, setFailedUserId] = useState<string | null>(null);
    const setSavedProfile = useCallback((profile: StoredRelocationProfile | null) => storeProfile(userId, profile), [storeProfile, userId]);

    useEffect(() => {
        if (initialProfile !== undefined) {
            const current = useUserProfileStore.getState();
            if (initialProfile === null || current.relocationProfileUserId !== userId || !current.relocationProfile ||
                (initialProfile !== null && current.relocationProfile.revision <= initialProfile.revision)) {
                setSavedProfile(initialProfile);
            }
            return;
        }
        if (useUserProfileStore.getState().relocationProfileUserId === userId) return;
        const controller = new AbortController();
        const { signal } = controller;
        const timer = window.setTimeout(async () => {
            const cached = readRelocationProfileCache(userId);
            if (cached !== undefined) {
                setSavedProfile(cached);
                return;
            }
            try {
                const response = await fetch("/api/user/relocation-profile", { cache: "no-store", signal });
                if (handleAuthFailure(response) || !response.ok) throw new Error("Profil tersimpan belum dapat dimuat.");
                const result: unknown = await response.json();
                if (!isRecord(result) || !("profile" in result) || (result.profile !== null && !isStoredRelocationProfile(result.profile))) {
                    throw new Error("Respons profil tidak valid.");
                }
                // A save completed during this request must win over the older GET.
                if (!signal.aborted && useUserProfileStore.getState().relocationProfileUserId !== userId) setSavedProfile(result.profile);
            } catch {
                // A failed request is unknown, never a cached 'not onboarded' result.
                if (!signal.aborted) setFailedUserId(userId);
            }
        }, 0);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [initialProfile, setSavedProfile, userId]);

    return { savedProfile, loaded, settled: loaded || failedUserId === userId, setSavedProfile };
}
