"use client";

import { useCallback, useEffect, useState } from "react";
import { handleAuthFailure } from "@/app/engine/lib/authRedirect";
import { isStoredRelocationProfile, readRelocationProfileCache } from "@/app/engine/lib/relocationProfileCache";
import type { StoredRelocationProfile } from "@/app/engine/lib/relocationProfile";
import { useUserProfileStore } from "@/app/stores/userStores";

export function useSavedRelocationProfile(userId: string) {
    const savedProfile = useUserProfileStore((state) => state.relocationProfileUserId === userId ? state.relocationProfile : null);
    const loaded = useUserProfileStore((state) => state.relocationProfileUserId === userId);
    const storeProfile = useUserProfileStore((state) => state.setRelocationProfile);
    const [failedUserId, setFailedUserId] = useState<string | null>(null);
    const setSavedProfile = useCallback((profile: StoredRelocationProfile | null) => storeProfile(userId, profile), [storeProfile, userId]);

    useEffect(() => {
        if (useUserProfileStore.getState().relocationProfileUserId === userId) return;
        let active = true;
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            const cached = readRelocationProfileCache(userId);
            if (cached !== undefined) {
                if (active) setSavedProfile(cached);
                return;
            }
            try {
                const response = await fetch("/api/user/relocation-profile", { cache: "no-store", signal: controller.signal });
                if (!active) return;
                if (handleAuthFailure(response) || !response.ok) throw new Error("Unable to load saved profile");
                const result: unknown = await response.json();
                if (typeof result !== "object" || result === null || !("profile" in result) ||
                    (result.profile !== null && !isStoredRelocationProfile(result.profile))) {
                    throw new Error("Invalid saved profile response");
                }
                // A save completed during this request must win over the older GET.
                if (active && useUserProfileStore.getState().relocationProfileUserId !== userId) setSavedProfile(result.profile);
            } catch {
                // A failed request is unknown, never a cached 'not onboarded' result.
                if (active) setFailedUserId(userId);
            }
        }, 0);
        return () => {
            active = false;
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [setSavedProfile, userId]);

    return { savedProfile, loaded, settled: loaded || failedUserId === userId, setSavedProfile };
}
