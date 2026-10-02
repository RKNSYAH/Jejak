import { useState } from "react";
import { displayStep } from "@/app/engine/onboarding/preview";
import type { FormSession, LiveOnboardingPreview as Preview } from "@/app/engine/onboarding/types";
import type { MapCategory } from "@/app/engine/types";
import DistrictListItem from "./DistrictListItem";

const categoryHints: Record<MapCategory, string> = {
    summary: "Urutan memakai bukti yang tersedia",
    employment: "Peluang kerja belum tersedia untuk semua kecamatan",
    education: "Lokasi kampus dari basis data",
    housing: "Median sewa yang tercatat",
    mobility: "Halte yang tercatat, bukan waktu rute",
};

export default function OnboardingPreview({ session, preview, geometryLoading, geometryError, onRetry, category,
    stepOverride, completedOverride, proposal = false, transportLabel, dataLoading, dataError, onRetryData, selectedDistrictId, onSelectDistrict, onEditPreferences, onExitPrototype }: {
    session: FormSession | null; preview: Preview; geometryLoading: boolean; geometryError: string | null; onRetry: () => void;
    category: MapCategory | null; dataLoading: boolean; dataError: string | null; onRetryData: () => void;
    selectedDistrictId: string | null; onSelectDistrict: (id: string) => void;
    stepOverride?: 1 | 2 | 3 | 4; completedOverride?: boolean; proposal?: boolean; transportLabel?: string;
    onEditPreferences: () => void; onExitPrototype: () => void;
}) {
    const [listOpen, setListOpen] = useState(false);
    const completed = session ? session.status === "completed" : (completedOverride ?? true);
    const step = session ? displayStep(session) : (stepOverride ?? 4);
    const unknownCount = preview.districts.filter((item) => item.eligible === null).length;
    const hasBudgetCriteria = preview.preferences.monthlyBudget !== null || preview.preferences.maximumRent !== null;
    // An unsaved LF-05 proposal and sample data are separate qualifiers.
    const badge = <>
        {proposal && <span className="badge badge-outline badge-xs border-ink-muted text-ink-muted">Usulan</span>}
        {preview.is_sample && <span className="badge badge-neutral badge-xs">Data contoh</span>}
    </>;

    return <section data-hci-region="onboarding-preview" aria-label="Pratinjau data wilayah" className={`@container absolute left-3 z-100 w-[min(25rem,calc(100%-1.5rem))] rounded-xl border border-rule bg-panel-surface p-3 font-body text-ink shadow-overlay md:left-5 md:rounded-2xl ${completed ? "bottom-[calc(var(--map-sheet-height,44px)+1rem)]" : "bottom-[calc(var(--onboarding-sheet-height,74dvh)+0.75rem)] md:bottom-4"}`}>
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
                {!completed && preview.available && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:hidden" role="status">
                    <span>{step === 1 ? `${preview.city?.city_name} · ${preview.districts.length} kecamatan` : step === 2 ? <><strong className="text-base">{preview.affordableCount}</strong> kecamatan memenuhi batas data sewa</> : step === 3 ? <>Moda {transportLabel ?? (session ? session.answers.transport : "belum dipilih")} · Rute belum tersedia tanpa graf rute</> : <><strong>{hasBudgetCriteria ? preview.eligibleCount : preview.ranked.length}</strong> {hasBudgetCriteria ? "kecamatan lolos batas terverifikasi" : "kecamatan dirangking"}</>}</span>
                    {badge}
                </div>}
                <div className={`${completed || !preview.available ? "flex" : "hidden md:flex"} flex-wrap items-center gap-x-2 gap-y-1`}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{step === 3 ? "Perjalanan" : preview.city?.city_name ?? "Pratinjau kecamatan"}</p>
                    {badge}
                </div>
            </div>
            {preview.available && !completed && <button type="button" aria-expanded={listOpen} aria-controls="onboarding-area-list" onClick={() => setListOpen(!listOpen)} className="btn btn-ghost h-11 min-h-11 shrink-0 px-0 text-xs text-primary underline">{listOpen ? "Tutup daftar kecamatan" : "Lihat daftar kecamatan"}</button>}
        </div>
        {dataLoading && <p role="status" className="mt-2 text-sm">Memuat data kecamatan…</p>}
        {dataError && <div role="alert" className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-error"><p className="min-w-0 flex-1">{dataError}</p><button type="button" onClick={onRetryData} className="btn btn-ghost h-11 min-h-11 shrink-0 px-1 text-xs text-primary underline">Coba lagi</button></div>}
        {!dataLoading && !dataError && !preview.available && <p role="status" className="mt-2 text-sm">{preview.city ? "Data kecamatan untuk kota ini belum tersedia." : "Pilih salah satu kota yang didukung untuk melihat kecamatan dan bukti yang tersedia."}</p>}
        <div className={completed || !preview.available ? "" : "hidden md:block"}>
            {preview.available && <>
                {step === 2 && <p role="status" className="mt-1 text-sm leading-snug"><strong className="font-sans text-xl tabular-nums">{preview.affordableCount}</strong> kecamatan memenuhi batas sewa dan biaya.</p>}
                {step === 3 && <p role="status" className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm leading-snug"><strong>Moda {transportLabel ?? (session ? session.answers.transport : "belum dipilih")}</strong><span className="text-xs text-ink-muted">Estimasi perjalanan dan jangkauan belum tersedia tanpa graf rute.</span></p>}
                {step === 4 && <p role="status" className="mt-1 text-sm leading-snug"><strong className="font-sans text-xl tabular-nums">{hasBudgetCriteria ? preview.eligibleCount : preview.ranked.length}</strong>{hasBudgetCriteria ? " kecamatan memenuhi batas sewa dan biaya." : " kecamatan dirangking · anggaran belum ditentukan."}</p>}
                {step >= 2 && <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs leading-snug text-ink-muted">
                    {step === 2 && <span>Median sewa · estimasi biaya kota</span>}
                    {step === 3 && <><span>Halte: akses tercatat, bukan waktu tempuh</span><span>Tujuan: titik tersimpan</span></>}
                    {step === 4 && <><span>Waktu rute belum dinilai</span><span>{completed ? categoryHints[category ?? "summary"] : "Skor memakai dimensi dengan data"}</span></>}
                    {hasBudgetCriteria && unknownCount > 0 && <span>{unknownCount} kecamatan belum terverifikasi</span>}
                </p>}
                {(step === 2 || step === 4) && <div className="mt-2 hidden grid-cols-1 gap-x-3 gap-y-1 border-t border-rule pt-2 text-xs md:grid @min-[22rem]:grid-cols-2">
                    <p className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-4 shrink-0 rounded-xs border border-primary bg-primary/20" />{hasBudgetCriteria ? "Sewa dan biaya sesuai" : "Data untuk dibandingkan"}</p>
                    <p className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-4 shrink-0 rounded-xs border border-ink/25 bg-base-200" />Data kurang / di luar batas</p>
                </div>}
            </>}
        </div>
        {completed && <div className="mt-1 flex flex-wrap items-center gap-x-4">
            <button type="button" className="btn btn-ghost h-11 min-h-11 px-0 text-xs text-primary underline" onClick={onEditPreferences}>Sesuaikan rencana</button>
            <button type="button" className="btn btn-ghost h-11 min-h-11 px-0 text-xs text-ink underline" onClick={onExitPrototype}>Jelajahi data peta</button>
        </div>}
        {geometryLoading && <p role="status" className="mt-2 text-xs text-ink-muted">Memuat batas kecamatan…</p>}
        {geometryError && preview.available && <div role="status" className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted"><p className="min-w-0 flex-1">{geometryError} Daftar tetap tersedia.</p><button type="button" onClick={onRetry} className="btn btn-ghost h-11 min-h-11 shrink-0 px-1 text-xs text-primary underline">Coba lagi</button></div>}
        {preview.available && !completed && listOpen && <ul id="onboarding-area-list" className="mt-2 max-h-40 space-y-2 overflow-y-auto border-t border-rule pt-2 text-xs" aria-label="Kecamatan dalam pratinjau">
            {preview.districts.map((item) => <DistrictListItem key={item.district.zone_id} item={item} step={step}
                selected={selectedDistrictId === item.district.zone_id} onSelect={() => onSelectDistrict(item.district.zone_id)} />)}
        </ul>}
    </section>;
}
