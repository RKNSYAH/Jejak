"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { validateFormStep } from "@/app/engine/onboarding/preview";
import type { FormAnswers, FormSession, FormStep, LiveOnboardingPreview } from "@/app/engine/onboarding/types";
import DistrictListItem from "./DistrictListItem";
import CostEstimate from "./CostEstimate";
import PurposeStep from "./steps/PurposeStep";
import BudgetStep from "./steps/BudgetStep";
import JourneyStep from "./steps/JourneyStep";
import PrioritiesStep from "./steps/PrioritiesStep";
import CommuteSummary from "./CommuteSummary";
import { useSheetDrag } from "./useSheetDrag";
import { visiblePreviewDistricts } from "@/app/engine/onboarding/visibleDistricts";
import { buildFormRelocationProfile } from "@/app/engine/lib/relocationProfile";
import ProfileReviewFields from "./ProfileReviewFields";

const steps = ["Tujuan", "Batas", "Perjalanan", "Prioritas"];
const stepNumbers: FormStep[] = [1, 2, 3, 4];
const titles = ["Apa yang membawamu pindah?", "Berapa batas yang realistis?", "Seberapa jauh perjalanan yang nyaman?", "Apa yang paling penting untukmu?"];
const descriptions = ["", "Peta memakai data sewa dan biaya yang tersedia.", "Pilih tujuan; perjalanan baru dinilai jika data rute tersedia.", "Bobot merangkum dimensi yang memiliki bukti. Data kosong tidak dianggap nol."];

export default function RelocationFormOnboarding({ session, onChange, onStepChange, onDismiss, onStory, onFinish, storageAvailable, preview,
    previewLoading, previewError, onRetryPreview, onMapPick, pickingDestination, selectedDistrictId, onSelectDistrict,
    commuteLoading, commuteError, onRetryCommute }: {
    session: FormSession; onChange: (patch: Partial<FormAnswers>) => void; onStepChange: (step: FormStep) => void;
    onDismiss: () => void; onStory: () => void; onFinish: () => Promise<void>; storageAvailable: boolean;
    preview: LiveOnboardingPreview; previewLoading: boolean; previewError: string | null; onRetryPreview: () => void;
    onMapPick: () => void; pickingDestination: boolean;
    selectedDistrictId: string | null; onSelectDistrict: (id: string) => void;
    commuteLoading?: boolean; commuteError?: string | null; onRetryCommute?: () => void;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const { collapsed, handleProps } = useSheetDrag(dialogRef);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [reviewing, setReviewing] = useState(false);
    const [returningToReview, setReturningToReview] = useState(false);
    const savingRef = useRef(false);
    const reviewedProfile = useMemo(() => {
        try { return buildFormRelocationProfile(session.answers); }
        catch { return null; }
    }, [session.answers]);

    useEffect(() => {
        // Non-modal: map destinations remain clickable and keyboard-accessible.
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.show();
        return () => dialog?.close();
    }, []);
    useEffect(() => {
        titleRef.current?.focus({ preventScroll: true });
        contentRef.current?.scrollTo({ top: 0 });
    }, [reviewing, session.step]);

    function change(patch: Partial<FormAnswers>) {
        if (savingRef.current) return;
        onChange(patch);
        setSaveError(null);
        setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !(key in patch))));
    }
    async function next() {
        if (savingRef.current) return;
        if (reviewing) {
            await confirm();
            return;
        }
        const stepErrors = stepNumbers.map((step) => validateFormStep(session.answers, step));
        const nextErrors = session.step === 4 ? Object.assign({}, ...stepErrors) : stepErrors[session.step - 1];
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) {
            const invalidStep = stepNumbers.find((step) => Object.keys(stepErrors[step - 1]).length);
            if (invalidStep && invalidStep !== session.step) onStepChange(invalidStep);
            window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(nextErrors)[0]}"]`)?.focus(), 0);
            return;
        }
        if (session.step < 4) onStepChange((session.step + 1) as FormStep);
        else { setReviewing(true); setReturningToReview(false); }
    }

    async function confirm() {
        if (savingRef.current) return;
        const stepErrors = stepNumbers.map((step) => validateFormStep(session.answers, step));
        const allErrors = Object.assign({}, ...stepErrors);
        setErrors(allErrors);
        if (Object.keys(allErrors).length || !reviewedProfile) {
            setReviewing(false);
            const invalidStep = stepNumbers.find((step) => Object.keys(stepErrors[step - 1]).length);
            if (invalidStep) onStepChange(invalidStep);
            return;
        }
        savingRef.current = true;
        setIsSaving(true);
        setSaveError(null);
        try { await onFinish(); }
        catch (error) { setSaveError(error instanceof Error ? error.message : "Profil belum tersimpan. Isianmu tetap ada. Coba lagi."); }
        finally { savingRef.current = false; setIsSaving(false); }
    }

    function back() {
        if (isSaving) return;
        setErrors({});
        setSaveError(null);
        if (reviewing) {
            setReviewing(false);
            return;
        }
        if (returningToReview) {
            setReviewing(true);
            setReturningToReview(false);
            if (session.step !== 4) onStepChange(4);
            return;
        }
        if (session.step === 1) onStory();
        else onStepChange((session.step - 1) as FormStep);
    }

    function editField(field: string) {
        const editStep: FormStep = field === "goal" || field === "occupation" || field === "target_occupations" ||
            field === "target_fields" || field === "study_field" || field === "education_level" || field === "destination_cities" ? 1
            : field === "monthly_budget" || field === "housing_budget" || field === "housing_types" || field === "over_budget" ? 2
            : field === "priorities" ? 4 : 3;
        setReviewing(false);
        setReturningToReview(true);
        setErrors({});
        setSaveError(null);
        onStepChange(editStep);
    }

    return <dialog ref={dialogRef} aria-labelledby="form-onboarding-title"
        data-hci-region={reviewing ? "onboarding-form-review" : `onboarding-form-step-${session.step}`} className="onboarding-form-panel absolute inset-x-0 bottom-0 z-200 m-0 flex h-[var(--sheet-h,74dvh)] max-h-[74dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-rule bg-base-100 p-0 font-body text-ink shadow-overlay max-md:transition-[height] max-md:duration-200 max-md:ease-out md:inset-y-4 md:left-auto md:right-4 md:h-auto md:max-h-none md:w-[min(35rem,43vw)] md:rounded-2xl"
        onKeyDown={(event) => { if (event.key === "Escape" && !(event.target instanceof HTMLInputElement && event.target.type === "search")) { event.preventDefault(); if (!isSaving) onDismiss(); } }}>
        <button type="button" {...handleProps} aria-expanded={!collapsed} aria-label={collapsed ? "Buka formulir" : "Perkecil formulir untuk melihat peta"}
            className="flex h-11 w-full shrink-0 cursor-ns-resize touch-none items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:hidden">
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-ink/20" />
        </button>
        <header className="flex shrink-0 items-center justify-between gap-2 px-5 pb-3 pt-1 md:px-6 md:pt-5">
            <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs font-semibold">
                <span aria-live="polite">{reviewing ? "Tinjau profilmu" : `Langkah ${session.step} dari 4 · ${steps[session.step - 1]}`}</span>
                <ol aria-label="Progres formulir" className="flex w-28 gap-1">
                    {steps.map((step, index) => <li key={step} aria-current={index + 1 === session.step ? "step" : undefined} className={`h-1 flex-1 rounded-full ${index < session.step ? "bg-primary" : "bg-ink/15"}`}><span className="sr-only">{step}</span></li>)}
                </ol>
            </div>
            <button type="button" disabled={isSaving} onClick={onDismiss} className="btn btn-ghost min-h-11 shrink-0 gap-1 px-1 text-xs text-ink">Lewati <X aria-hidden="true" className="hidden size-3.5 md:block" /></button>
        </header>
        <form noValidate aria-busy={isSaving} className={`flex min-h-0 flex-1 flex-col ${collapsed ? "invisible" : ""}`} onSubmit={(event) => { event.preventDefault(); void next(); }}>
            <div ref={contentRef} className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-7 pt-3 md:px-6 md:pt-4">
                {session.step === 1 && <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Akun siap · isi formulir</p>}
                <h1 id="form-onboarding-title" ref={titleRef} tabIndex={-1} className="font-sans text-2xl font-bold leading-[1.15] tracking-tight outline-none md:text-[1.75rem]">{reviewing ? "Tinjau profilmu" : titles[session.step - 1]}</h1>
                {reviewing ? <p className="mt-2 text-sm leading-relaxed text-ink-muted">Periksa batas dan preferensi sebelum Jejak menyimpan profil.</p>
                    : descriptions[session.step - 1] && <p className="mt-2 hidden text-sm leading-relaxed text-ink-muted md:block">{descriptions[session.step - 1]}</p>}
                {!storageAvailable && <p className="mt-2 text-xs text-ink-muted">Penyimpanan browser tidak tersedia. Isian berlaku selama halaman ini terbuka.</p>}
                {Object.keys(errors).length > 0 && <p role="alert" className="mt-3 text-sm font-semibold text-error">Periksa isian yang ditandai sebelum melanjutkan.</p>}
                {!reviewing ? <fieldset disabled={isSaving} className="mt-6">
                    {session.step === 1 && <PurposeStep answers={session.answers} onChange={change} errors={errors} onStory={onStory} cities={preview.cities} citiesLoading={previewLoading} />}
                    {session.step === 2 && <BudgetStep answers={session.answers} onChange={change} errors={errors} />}
                    {session.step === 3 && <JourneyStep answers={session.answers} onChange={change} errors={errors} destinations={preview.destinations} onMapPick={onMapPick} pickingDestination={pickingDestination} />}
                    {session.step === 4 && <PrioritiesStep answers={session.answers} onChange={change} errors={errors} />}
                </fieldset> : reviewedProfile && <div className="mt-6"><ProfileReviewFields profile={reviewedProfile} onEdit={editField} /></div>}
                {session.step >= 3 && <CommuteSummary preview={preview} loading={commuteLoading} error={commuteError} onRetry={onRetryCommute} />}
                {session.step >= 2 && preview.available && <CostEstimate preview={preview} selectedDistrictId={selectedDistrictId}
                    onSelectDistrict={onSelectDistrict} disabled={isSaving} />}
                {saveError && <p role="alert" className="alert alert-error mt-4 text-sm">{saveError}</p>}
                {previewLoading && <p role="status" className="mt-4 text-sm text-ink-muted">Memuat data kecamatan…</p>}
                {previewError && <p role="alert" className="mt-4 text-sm text-error">{previewError}<button type="button" onClick={onRetryPreview} className="btn btn-ghost min-h-11 px-2 text-xs text-primary underline">Coba lagi</button></p>}
                {preview.available && session.step >= 2 && preview.eligibleCount === 0 && <p role="status" className="mt-4 text-sm leading-relaxed text-ink-muted">Belum ada kecamatan yang memenuhi semua batas dari data dan estimasi tersedia.</p>}
                {preview.available && <details className="mt-5 border-t border-rule pt-1 text-xs" data-hci-region="onboarding-accessible-results">
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">Lihat daftar kecamatan dan batasnya</summary>
                    <p className="mb-2 text-ink-muted">Sumber dan status data dicantumkan per kecamatan. Batas kecamatan memakai geometri tersimpan atau BIG RBI.</p>
                    <ul className="space-y-2" aria-label="Kecamatan dalam pratinjau">
                        {visiblePreviewDistricts(preview, session.step >= 2).map((item) => <DistrictListItem key={item.district.zone_id} item={item} step={session.step}
                            selected={selectedDistrictId === item.district.zone_id} onSelect={() => onSelectDistrict(item.district.zone_id)} />)}
                    </ul>
                </details>}
            </div>
            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-rule px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 md:px-6 md:py-3.5">
                <button type="button" disabled={isSaving} aria-label="Kembali" onClick={back} className="btn btn-outline btn-neutral min-h-12 rounded-xl px-3 md:px-4">
                    <ArrowLeft aria-hidden="true" className="size-4" /><span className="hidden md:inline">Kembali</span>
                </button>
                <button type="submit" disabled={isSaving || reviewing && !reviewedProfile} className="btn btn-primary min-h-12 min-w-0 flex-1 rounded-xl px-4 md:flex-none md:px-5">
                    {isSaving ? "Menyimpan profil…" : reviewing ? "Konfirmasi dan simpan" : session.step === 4 ? returningToReview ? "Kembali ke tinjauan" : "Tinjau profil" : "Lanjut"}
                    <ArrowRight aria-hidden="true" className="size-4" />
                </button>
            </footer>
        </form>
    </dialog>;
}
