"use client";

import Link from "next/link";
import { Download } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import type { AccountSummary } from "../engine/controller/userServerController";

export type SettingsTab = "profile" | "account" | "plan" | "privacy";

function SettingsSection({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
    return <section id={id} tabIndex={-1} className="scroll-mt-6 border-t-2 border-ink pt-4 focus-visible:outline-primary">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:gap-8">
            <div>
                <h2 className="font-sans text-xl font-bold text-ink">{title}</h2>
                {description && <p className="mt-1 max-w-64 text-sm leading-relaxed text-ink-muted">{description}</p>}
            </div>
            <div className="min-w-0">{children}</div>
        </div>
    </section>;
}

function SettingsRow({ label, value, unavailable = false }: { label: string; value: ReactNode; unavailable?: boolean }) {
    return <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-baseline gap-4 border-b border-rule py-3 text-sm">
        <dt className="text-ink-muted">{label}</dt>
        <dd className={`min-w-0 break-words ${unavailable ? "text-ink-muted" : "font-semibold text-ink"}`}>{value}</dd>
    </div>;
}

export default function UserSettings({ email, account, hasSavedProfile, hasUnsavedChanges, activeTab, onNavigate, onReturnToProfile, onCreateProfile, children }: {
    email: string | null;
    account: AccountSummary | null;
    hasSavedProfile: boolean | null;
    hasUnsavedChanges: boolean;
    activeTab: SettingsTab;
    onNavigate: (event: { preventDefault: () => void }) => void;
    onReturnToProfile: () => void;
    onCreateProfile: (event: { preventDefault: () => void }) => void;
    children: ReactNode;
}) {
    useEffect(() => {
        if (activeTab === "account") {
            document.getElementById("account-title")?.focus({ preventScroll: true });
            window.scrollTo({ top: 0, behavior: "instant" });
            return;
        }
        if (activeTab !== "plan" && activeTab !== "privacy") return;
        const section = document.getElementById(`settings-${activeTab}`);
        section?.focus({ preventScroll: true });
        section?.scrollIntoView({ block: "start", behavior: "instant" });
    }, [activeTab]);

    return <div className="mx-auto max-w-5xl px-5 pb-12 pt-7 sm:px-8 lg:px-10" data-hci-region="user-settings">
        <header className="mb-8">
            <h1 id="account-title" tabIndex={-1} className="mt-2 font-sans text-[clamp(2rem,1rem+3vw,2.75rem)] font-bold leading-tight text-ink focus-visible:outline-primary">Akun, paket, dan datamu</h1>
        </header>
        {hasUnsavedChanges && <div role="status" data-hci-region="settings-profile-draft" className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rule px-4 py-2 text-sm">
            <p className="text-ink">Perubahan profilmu belum disimpan.</p>
            <button type="button" onClick={onReturnToProfile} className="btn btn-ghost min-h-11 px-2 text-primary">Kembali ke profil</button>
        </div>}
        <div className="space-y-9">
            <SettingsSection id="settings-account" title="Akun" description="Dipakai untuk masuk dan menyimpan rencanamu.">
                <dl>
                    <SettingsRow label="Email" value={email ?? "Email tidak tersedia"} />
                    <SettingsRow label="Kata sandi" value="Pengaturan belum tersedia" unavailable />
                </dl>
                <div className="mt-4">{children}</div>
            </SettingsSection>
            <SettingsSection id="settings-plan" title="Paket">
                <div className="flex flex-wrap items-center gap-2 pb-3">
                    <h3 className="font-sans text-xl font-bold text-ink">{account?.planName ?? "Paket belum tersedia"}</h3>
                    {account?.planName && <span className="badge badge-sm border-ink bg-ink text-base-100">Paket saat ini</span>}
                </div>
                <dl className="border-t border-rule">
                    <SettingsRow label="Pemakaian paket" value="Rincian kuota belum tersedia" unavailable />
                </dl>
                <p className="mt-3 text-sm text-ink-muted">Paket tidak mengubah angka atau urutan rekomendasi.</p>
                <Link href="/pricing" onNavigate={onNavigate} className="btn btn-outline mt-4 min-h-11 rounded-xl border-ink text-ink hover:bg-ink hover:text-base-100">Lihat semua paket</Link>
            </SettingsSection>
            <SettingsSection id="settings-privacy" title="Privasi dan data" description="Kelola profil dan data rencana pindahmu.">
                <dl>
                    <SettingsRow label="Profil relokasi" value={hasSavedProfile === null ? "Belum tersedia" : hasSavedProfile
                        ? "Tersimpan"
                        : <Link href="/map?welcome=1" onNavigate={onCreateProfile} className="link link-primary font-semibold">Buat profil</Link>} unavailable={hasSavedProfile === null} />

                </dl>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button type="button" disabled className="btn btn-outline min-h-11 rounded-xl"><Download aria-hidden="true" className="size-4" />Unduh dataku</button>
                    <span className="text-xs text-ink-muted">Belum tersedia</span>
                </div>
                <details className="mt-5 border-t border-rule pt-3">
                    <summary className="link link-primary min-h-11 cursor-pointer py-2 text-sm font-semibold focus-visible:outline-primary">Hapus akun</summary>
                    <p className="pb-2 text-sm text-ink-muted">Penghapusan akun mandiri belum tersedia. Data akunmu tidak akan dihapus dari sini.</p>
                </details>
            </SettingsSection>
        </div>
    </div>;
}
