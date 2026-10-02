"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { initialFormAnswers } from "@/app/engine/onboarding/demoData";
import { displayStep, parseFormSession } from "@/app/engine/onboarding/preview";
import { evaluateLiveOnboarding, formPreviewPreferences } from "@/app/engine/onboarding/livePreview";
import { getOnboardingData, type OnboardingDataResponse } from "@/app/engine/lib/onboardingApi";
import { FORM_DRAFT_KEY, type FormAnswers, type FormSession, type FormStep, type LiveOnboardingPreview } from "@/app/engine/onboarding/types";

const emptyData: OnboardingDataResponse = { cities: [], areas: [], destinations: [] };

export function useFormOnboarding(skipRestoredDraft = false) {
    const [session, setSession] = useState<FormSession | null>(null);
    const [ready, setReady] = useState(false);
    const [storyOpenRequest, setStoryOpenRequest] = useState(0);
    const [storageAvailable, setStorageAvailable] = useState(true);
    const [data, setData] = useState<OnboardingDataResponse>(emptyData);
    const [loadedCityId, setLoadedCityId] = useState<string | null>(null);
    const [dataLoading, setDataLoading] = useState(true);
    const [dataError, setDataError] = useState<string | null>(null);
    const [dataRevision, setDataRevision] = useState(0);
    const [pickingDestination, setPickingDestination] = useState(false);
    const [previewCityOverride, setPreviewCityOverride] = useState<string | null | undefined>(undefined);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            // Keep unfinished inputs in storage, but don't let them replace a newly saved profile.
            if (skipRestoredDraft) {
                setReady(true);
                return;
            }
            try {
                const saved = sessionStorage.getItem(FORM_DRAFT_KEY);
                const parsed = saved ? parseFormSession(JSON.parse(saved)) : null;
                setSession(parsed ? { ...parsed, answers: { ...parsed.answers, experience: null, extras: [] } } : null);
            } catch { setStorageAvailable(false); }
            setReady(true);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [skipRestoredDraft]);

    useEffect(() => {
        if (!ready || !session) return;
        try { sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(session)); }
        catch { /* The form remains usable when browser storage is unavailable. */ }
    }, [ready, session]);

    const cityId = previewCityOverride !== undefined
        ? previewCityOverride
        : session?.answers.city && session.answers.city !== "unsure" ? session.answers.city : null;
    const visibleData = useMemo(() => loadedCityId === cityId
        ? data
        : { cities: data.cities, areas: [], destinations: [] }, [data, loadedCityId, cityId]);
    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => {
            setDataLoading(true);
            setDataError(null);
            void getOnboardingData(cityId, controller.signal).then((result) => {
                if (controller.signal.aborted) return;
                setData(result);
                setLoadedCityId(cityId);
                setSession((current) => {
                    if (!current || current.answers.city !== cityId || !current.answers.destinationId ||
                        result.destinations.some((item) => item.id === current.answers.destinationId)) return current;
                    return { ...current, answers: { ...current.answers, destinationId: null, destinationName: null, destinationPoint: null } };
                });
            }).catch((error: unknown) => {
                if (!controller.signal.aborted) setDataError(error instanceof Error ? error.message : "Data onboarding belum dapat dimuat.");
            }).finally(() => {
                if (!controller.signal.aborted) setDataLoading(false);
            });
        }, 0);
        return () => { window.clearTimeout(timer); controller.abort(); };
    }, [cityId, dataRevision]);

    const open = useCallback(() => {
        setPreviewCityOverride(undefined);
        setSession((current) => current
            ? { ...current, status: "active" }
            : { version: 1, status: "active", step: 1, answers: structuredClone(initialFormAnswers) });
    }, []);
    const update = useCallback((patch: Partial<FormAnswers>) => {
        if (patch.goal !== undefined || patch.city !== undefined) setPickingDestination(false);
        setSession((current) => {
            if (!current) return current;
            const answers = { ...current.answers, ...patch };
            if (patch.goal !== undefined || patch.city !== undefined) {
                answers.destinationId = null;
                answers.destinationName = null;
                answers.destinationPoint = null;
            }
            return { ...current, answers };
        });
    }, []);
    const startPickingDestination = useCallback(() => setPickingDestination(true), []);
    const setDestinationPoint = useCallback((point: [number, number]) => {
        setSession((current) => current ? { ...current, answers: {
            ...current.answers,
            destinationId: null,
            destinationName: "Titik pilihanmu",
            destinationPoint: point,
        } } : current);
        setPickingDestination(false);
    }, []);
    const goToStep = useCallback((step: FormStep) => setSession((current) => current ? { ...current, step } : null), []);
    const finish = useCallback(() => setSession((current) => current ? { ...current, status: "completed", step: 4 } : null), []);
    const dismiss = useCallback(() => setSession((current) => current ? { ...current, status: "skipped" } : null), []);
    const returnToStory = useCallback(() => {
        setSession((current) => current ? { ...current, status: "paused" } : null);
        setStoryOpenRequest((current) => current + 1);
    }, []);
    const active = session?.status === "active";
    const previewVisible = active || session?.status === "completed";
    const preview: LiveOnboardingPreview | null = useMemo(() => session
        ? evaluateLiveOnboarding(formPreviewPreferences(session.answers), displayStep(session), visibleData)
        : null, [session, visibleData]);
    const retryData = useCallback(() => setDataRevision((value) => value + 1), []);
    const selectPreviewCity = useCallback((cityId: string | null | undefined) => setPreviewCityOverride(cityId), []);
    return { session, ready, active, previewVisible, preview, data: visibleData, storageAvailable, storyOpenRequest,
        dataLoading, dataError, retryData, selectPreviewCity, pickingDestination, startPickingDestination, setDestinationPoint,
        open, update, goToStep, finish, dismiss, returnToStory };
}
