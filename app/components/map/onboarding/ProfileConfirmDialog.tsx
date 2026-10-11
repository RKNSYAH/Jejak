"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowRight, ChevronLeft, CircleDashed, LockKeyhole, X } from "lucide-react";
import { missingProfileItems, profileChips, profileFeasibility, type ConfirmationProfile } from "@/app/engine/onboarding/profileConfirmation";
import type { LiveOnboardingPreview } from "@/app/engine/onboarding/types";

function ProfileLockNotice({ className = "" }: { className?: string }) {
    return <div data-hci-region="profile-lock-notice" className={`flex gap-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-sm md:p-4 ${className}`}>
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
            <p className="font-semibold text-ink">Paket Gratis memuat 1 profil terkonfirmasi</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                Mengubah, mengganti, atau memperbarui profil ini setelah dikonfirmasi memerlukan Premium. <Link href="/pricing" className="link font-semibold text-primary">Lihat Premium</Link>
            </p>
        </div>
    </div>;
}

export default function ProfileConfirmDialog({ profile, inferredFields = [], preview, saving, error, onBack, onConfirm }: {
    profile: ConfirmationProfile; inferredFields?: string[]; preview: LiveOnboardingPreview | null;
    saving: boolean; error: string | null; onBack: () => void; onConfirm: () => void;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const chips = profileChips(profile);
    const missing = missingProfileItems(profile, inferredFields);
    const feasibility = profileFeasibility(preview);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (dialog && !dialog.open) dialog.showModal();
    }, []);

    return <dialog ref={dialogRef} aria-labelledby="profile-confirm-title" data-hci-region="profile-confirmation"
        className="modal modal-bottom onboarding-dialog sm:modal-middle"
        onCancel={(event) => { if (saving) event.preventDefault(); }} onClose={onBack}>
        <div className="modal-box max-h-[calc(100dvh-1.5rem)] w-full max-w-[34rem] rounded-t-2xl border border-rule bg-base-100 p-5 text-ink shadow-overlay sm:rounded-2xl md:p-6">
            <div className="flex items-start justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Satu langkah terakhir</p>
                <button type="button" disabled={saving} onClick={onBack} aria-label="Tutup" className="btn btn-ghost btn-square btn-sm -mr-2 -mt-2 size-11 text-ink">
                    <X aria-hidden="true" className="size-4" />
                </button>
            </div>
            <h2 id="profile-confirm-title" className="font-sans text-2xl font-bold leading-tight md:text-[1.75rem]">Konfirmasi profil relokasi ini?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">Setelah dikonfirmasi, peta terbuka dengan peringkat dan skor kecamatan untuk profil ini.</p>

            <section aria-label="Ringkasan profil" className="mt-4 rounded-xl border border-ink/25 p-3">
                <ul className="flex flex-wrap gap-1.5">
                    {chips.map((chip) => <li key={chip} className="badge badge-neutral h-auto min-h-7 whitespace-normal px-2.5 py-1 text-xs font-semibold">{chip}</li>)}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-2 text-sm">
                    <span className="text-xs text-ink-muted">Kelayakan</span>
                    <span aria-hidden="true" className="flex gap-1">
                        {[1, 2, 3].map((bar) => <span key={bar} className={`h-1.5 w-6 rounded-full ${bar <= feasibility.level ? "bg-primary" : "bg-base-300"}`} />)}
                    </span>
                    <strong className="font-sans">{feasibility.label}</strong>
                    {missing.length > 0 && <span className="badge badge-outline badge-sm border-ink-muted text-ink-muted">Sementara</span>}
                    <span className="ml-auto flex gap-1">
                        {preview?.is_sample && <span className="badge badge-neutral badge-sm">Data contoh</span>}
                        <span className="badge badge-outline badge-sm">Estimasi</span>
                    </span>
                </div>
            </section>

            {missing.length > 0 && <section aria-label="Belum lengkap" className="mt-3 flex gap-3 rounded-xl border border-dashed border-ink/30 p-3 text-sm">
                <CircleDashed aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
                <div>
                    <p><strong>Belum lengkap:</strong> melengkapinya nanti memerlukan Premium.</p>
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                        {missing.map((item) => <li key={item} className="badge badge-outline badge-sm h-auto min-h-6 border-dashed">{item}</li>)}
                    </ul>
                </div>
            </section>}

            <ProfileLockNotice className="mt-3" />

            {error && <p role="alert" className="mt-3 text-sm font-semibold text-error">{error}</p>}
            {error?.startsWith("Masuk") && <Link href="/login?next=%2Fmap" className="btn btn-outline mt-2 min-h-11 border-ink text-ink">Masuk untuk menyimpan</Link>}

            <footer className="mt-5 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
                <button type="button" disabled={saving} onClick={onBack} className="btn btn-outline btn-neutral min-h-11 rounded-xl px-3">
                    <ChevronLeft aria-hidden="true" className="size-4" />Lengkapi dulu
                </button>
                <p className="order-last w-full text-[11px] leading-snug text-ink-muted sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">Belum ada yang terkunci sebelum kamu menekan konfirmasi.</p>
                <button type="button" disabled={saving} onClick={onConfirm} className="btn btn-primary ml-auto min-h-11 rounded-xl px-4">
                    {saving ? "Mengonfirmasi…" : "Konfirmasi profil"}{!saving && <ArrowRight aria-hidden="true" className="size-4" />}
                </button>
            </footer>
        </div>
    </dialog>;
}
