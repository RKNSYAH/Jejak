"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "./client";
import { authDestination, loginPath } from "./authDestination";
import type { AccountScope } from "./accountIdentity";
import { useUserProfileStore } from "../../stores/userStores";

export function useAccountIdentity(userId: string) {
    const [destination, setDestination] = useState<string | null>(null);
    const account = useMemo<AccountScope>(() => {
        const controller = new AbortController();
        return {
            userId,
            signal: controller.signal,
            invalidate(navigate = true) {
                controller.abort();
                useUserProfileStore.getState().resetProfile(userId);
                const { pathname, search, hash } = window.location;
                if (navigate) setDestination(authDestination(`${pathname}${search}${hash}`));
            },
        };
    }, [userId]);

    useEffect(() => {
        const { data: { subscription } } = createClient().auth.onAuthStateChange((event, session) => {
            if (account.signal.aborted || session?.user.id === userId) return;
            // Abort the old account's requests and clear its profile now; the redirect waits for a re-render.
            account.invalidate(false);
            const { pathname, search, hash } = window.location;
            const next = `${pathname}${search}${hash}`;
            const signedOutPath = `/login?${new URLSearchParams({ status: "signed-out", next: authDestination(next) })}`;
            setDestination(session?.user.id ? authDestination(next) : event === "SIGNED_OUT" ? signedOutPath : loginPath(next));
        });
        return () => subscription.unsubscribe();
    }, [account, userId]);

    useEffect(() => {
        if (destination) window.location.replace(destination);
    }, [destination]);

    return { account, active: destination === null };
}
