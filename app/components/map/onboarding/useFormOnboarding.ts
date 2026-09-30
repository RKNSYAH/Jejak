"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultAnswers } from "@/app/engine/onboarding/demoData";
import { availableDestinations, evaluateOnboarding, parseFormSession } from "@/app/engine/onboarding/preview";
import { FORM_DRAFT_KEY, type FormAnswers, type FormSession, type FormStep } from "@/app/engine/onboarding/types";

export function useFormOnboarding() {
    const [session, setSession] = useState<FormSession | null>(null);
    const [ready, setReady] = useState(false);
    const [storyOpenRequest, setStoryOpenRequest] = useState(0);
    const [storageAvailable, setStorageAvailable] = useState(true);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            try {
                const saved = sessionStorage.getItem(FORM_DRAFT_KEY);
                setSession(saved ? parseFormSession(JSON.parse(saved)) : null);
            } catch { setStorageAvailable(false); }
            setReady(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!ready || !session) return;
        try { sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(session)); }
        catch { /* The form remains usable when browser storage is unavailable. */ }
    }, [ready, session]);

    const open = useCallback(() => setSession((current) => current
        ? { ...current, status: "active" }
        : { version: 1, status: "active", step: 1, answers: structuredClone(defaultAnswers) }), []);
    const update = useCallback((patch: Partial<FormAnswers>) => setSession((current) => {
        if (!current) return current;
        const answers = { ...current.answers, ...patch };
        if (patch.goal && !availableDestinations(answers.goal).some((place) => place.id === answers.destinationId)) {
            answers.destinationId = availableDestinations(answers.goal)[0]?.id ?? null;
        }
        if (patch.city && patch.city !== "unsure" && patch.city !== "jakarta-selatan") answers.destinationId = null;
        return { ...current, answers };
    }), []);
    const goToStep = useCallback((step: FormStep) => setSession((current) => current ? { ...current, step } : null), []);
    const finish = useCallback(() => setSession((current) => current ? { ...current, status: "completed", step: 4 } : null), []);
    const dismiss = useCallback(() => setSession((current) => current ? { ...current, status: "skipped" } : null), []);
    const returnToStory = useCallback(() => {
        setSession((current) => current ? { ...current, status: "paused" } : null);
        setStoryOpenRequest((current) => current + 1);
    }, []);
    const active = session?.status === "active";
    const previewVisible = active || session?.status === "completed";
    const preview = useMemo(() => session ? evaluateOnboarding(session.answers, session.status === "completed" ? 4 : session.step) : null, [session]);
    return { session, ready, active, previewVisible, preview, storageAvailable, storyOpenRequest,
        open, update, goToStep, finish, dismiss, returnToStory };
}
