"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { validateFormStep } from "@/app/engine/onboarding/preview";
import type { FormAnswers, FormSession, FormStep } from "@/app/engine/onboarding/types";
import type { OnboardingPreview } from "@/app/engine/onboarding/types";
import { formatRupiah } from "@/app/engine/onboarding/demoData";
import PurposeStep from "./steps/PurposeStep";
import BudgetStep from "./steps/BudgetStep";
import JourneyStep from "./steps/JourneyStep";
import PrioritiesStep from "./steps/PrioritiesStep";

const steps = ["Tujuan", "Batas", "Perjalanan", "Prioritas"];
const titles = ["Apa yang membawamu pindah?", "Berapa batas yang realistis?", "Seberapa jauh perjalanan yang nyaman?", "Apa yang paling penting untukmu?"];
const descriptions = ["", "Kecamatan di peta berubah warna saat kamu mengubah angka.", "Pilih kawasan di peta atau cari dari daftar untuk melihat simulasi.", "Bobot mengurutkan kecamatan yang lolos batasmu. Nomor di peta ikut bergeser."];

export default function RelocationFormOnboarding({ session, onChange, onStepChange, onDismiss, onStory, onFinish, storageAvailable, preview }: {
    session: FormSession; onChange: (patch: Partial<FormAnswers>) => void; onStepChange: (step: FormStep) => void;
    onDismiss: () => void; onStory: () => void; onFinish: () => void; storageAvailable: boolean;
    preview: OnboardingPreview;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        // Non-modal: map destinations remain clickable and keyboard-accessible.
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.show();
        return () => dialog?.close();
    }, []);
    useEffect(() => {
        titleRef.current?.focus({ preventScroll: true });
        contentRef.current?.scrollTo({ top: 0 });
    }, [session.step]);

    function change(patch: Partial<FormAnswers>) {
        onChange(patch);
        setErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !(key in patch))));
    }
    function next() {
        const nextErrors = session.step === 4
            ? Object.assign({}, ...([1, 2, 3, 4] as FormStep[]).map((step) => validateFormStep(session.answers, step)))
            : validateFormStep(session.answers, session.step);
        setErrors(nextErrors);
        if (Object.keys(nextErrors).length) {
            const invalidStep = ([1, 2, 3, 4] as FormStep[]).find((step) => Object.keys(validateFormStep(session.answers, step)).length);
            if (invalidStep && invalidStep !== session.step) onStepChange(invalidStep);
            window.setTimeout(() => dialogRef.current?.querySelector<HTMLElement>(`[name="${Object.keys(nextErrors)[0]}"]`)?.focus(), 0);
            return;
        }
        if (session.step < 4) onStepChange((session.step + 1) as FormStep);
        else onFinish();
    }

    return <dialog ref={dialogRef} aria-labelledby="form-onboarding-title" aria-describedby="form-demo-note" lang="id"
        data-hci-region={`onboarding-form-step-${session.step}`} className="onboarding-form-panel absolute inset-x-0 bottom-0 z-200 m-0 flex h-[74dvh] max-h-[74dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-rule bg-base-100 p-0 font-body text-ink shadow-overlay md:inset-y-4 md:left-auto md:right-4 md:h-auto md:max-h-none md:w-[min(35rem,43vw)] md:rounded-2xl"
        onKeyDown={(event) => { if (event.key === "Escape" && !(event.target instanceof HTMLInputElement && event.target.type === "search")) { event.preventDefault(); onDismiss(); } }}>
        <div aria-hidden="true" className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-ink/20 md:hidden" />
        <header className="flex shrink-0 items-center justify-between gap-2 px-5 pb-3 pt-4 md:px-6 md:pt-5">
            <div className="flex min-w-0 flex-wrap items-center gap-3 text-xs font-semibold">
                <span aria-live="polite">Langkah {session.step} dari 4 · {steps[session.step - 1]}</span>
                <ol aria-label="Progres formulir" className="flex w-28 gap-1">
                    {steps.map((step, index) => <li key={step} aria-current={index + 1 === session.step ? "step" : undefined} className={`h-1 flex-1 rounded-full ${index < session.step ? "bg-primary" : "bg-ink/15"}`}><span className="sr-only">{step}</span></li>)}
                </ol>
            </div>
            <button type="button" onClick={onDismiss} className="btn btn-ghost min-h-11 shrink-0 gap-1 px-1 text-xs text-ink">Lewati <X aria-hidden="true" className="hidden size-3.5 md:block" /></button>
        </header>
        <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => { event.preventDefault(); next(); }}>
            <div ref={contentRef} className="@container min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-7 pt-3 md:px-6 md:pt-4">
                {session.step === 1 && <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Akun siap · isi formulir</p>}
                <h1 id="form-onboarding-title" ref={titleRef} tabIndex={-1} className="font-sans text-2xl font-bold leading-[1.15] tracking-tight outline-none md:text-[1.75rem]">{titles[session.step - 1]}</h1>
                {descriptions[session.step - 1] && <p className="mt-2 hidden text-sm leading-relaxed text-ink-muted md:block">{descriptions[session.step - 1]}</p>}
                <p id="form-demo-note" className={`mt-2 text-xs text-ink-muted ${session.step === 1 ? "" : "hidden md:block"}`}><span className="badge badge-neutral badge-xs mr-1.5">Contoh data</span>Pratinjau interaktif; nilai awal bisa kamu ubah.</p>
                {!storageAvailable && <p className="mt-2 text-xs text-ink-muted">Penyimpanan browser tidak tersedia. Isian berlaku selama halaman ini terbuka.</p>}
                {Object.keys(errors).length > 0 && <p role="alert" className="mt-3 text-sm font-semibold text-error">Periksa isian yang ditandai sebelum melanjutkan.</p>}
                <div className="mt-6">
                    {session.step === 1 && <PurposeStep answers={session.answers} onChange={change} errors={errors} onStory={onStory} />}
                    {session.step === 2 && <BudgetStep answers={session.answers} onChange={change} errors={errors} />}
                    {session.step === 3 && <JourneyStep answers={session.answers} onChange={change} errors={errors} />}
                    {session.step === 4 && <PrioritiesStep answers={session.answers} onChange={change} errors={errors} />}
                </div>
                {preview.available && session.step >= 2 && preview.eligibleCount === 0 && <p role="status" className="mt-4 text-sm leading-relaxed text-ink-muted">Belum ada kecamatan contoh yang lolos. Ubah anggaran, hunian, atau batas perjalanan untuk mencoba lagi.</p>}
                {preview.available && <details className="mt-5 border-t border-rule pt-1 text-xs" data-hci-region="onboarding-accessible-results">
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">Lihat daftar kecamatan dan batasnya</summary>
                    <p className="mb-2 text-ink-muted">Contoh data sintetis. Batas kecamatan: BIG RBI. Nilai bukan pengamatan pasar.</p>
                    <ul className="space-y-2" aria-label="Kecamatan dalam pratinjau">
                        {preview.districts.map((item) => <li key={item.district.id}><strong>{session.step === 4 && item.rank ? `${item.rank}. ` : ""}{item.district.name}</strong>
                            {session.step >= 2 && <span className="block leading-relaxed text-ink-muted">Sewa contoh Rp{formatRupiah(item.rent)} / bulan · {item.eligible ? "Lolos batas contoh" : item.exclusions.join("; ")}{session.step >= 3 && item.commuteMinutes !== null ? ` · ${item.commuteMinutes} mnt simulasi` : ""}</span>}
                        </li>)}
                    </ul>
                </details>}
            </div>
            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-rule px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 md:px-6 md:py-3.5">
                <button type="button" aria-label="Kembali" onClick={() => { setErrors({}); if (session.step === 1) onStory(); else onStepChange((session.step - 1) as FormStep); }} className="btn btn-outline btn-neutral min-h-12 rounded-xl px-3 md:px-4">
                    <ArrowLeft aria-hidden="true" className="size-4" /><span className="hidden md:inline">Kembali</span>
                </button>
                <button type="submit" className="btn btn-primary min-h-12 min-w-0 flex-1 rounded-xl px-4 md:flex-none md:px-5">{session.step === 4 ? "Selesai, buka peta" : "Lanjut"}<ArrowRight aria-hidden="true" className="size-4" /></button>
            </footer>
        </form>
    </dialog>;
}
