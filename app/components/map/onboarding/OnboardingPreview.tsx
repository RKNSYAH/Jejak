import { useState } from "react";
import { displayStep } from "@/app/engine/onboarding/preview";
import type { FormSession, LiveOnboardingPreview as Preview } from "@/app/engine/onboarding/types";
import type { MapCategory } from "@/app/engine/types";
import DistrictListItem from "./DistrictListItem";
import { getCityAreaName } from "@/app/engine/lib/metroArea";
import { visiblePreviewDistricts } from "@/app/engine/onboarding/visibleDistricts";
import { TOP_RANK_COUNT, isTopRanked } from "@/app/engine/onboarding/livePreview";
import CommuteSummary from "./CommuteSummary";

const categoryHints: Record<MapCategory, string> = {
    summary: "Urutan memakai bukti yang tersedia",
    employment: "Peluang kerja belum tersedia untuk semua kecamatan",
    education: "Lokasi kampus dari basis data",
    housing: "Median sewa yang tercatat",
    mobility: "Perkiraan jangkauan sekitar tujuan · km",
};

export default function OnboardingPreview({ session, preview, geometryLoading, geometryError, onRetry, category,
    stepOverride, completedOverride, proposal = false, transportLabel, dataLoading, dataError, onRetryData, selectedDistrictId, onSelectDistrict, onEditPreferences, onExitPrototype,
    commuteLoading, commuteError, onRetryCommute }: {
    session: FormSession | null; preview: Preview; geometryLoading: boolean; geometryError: string | null; onRetry: () => void;
    category: MapCategory | null; dataLoading: boolean; dataError: string | null; onRetryData: () => void;
    selectedDistrictId: string | null; onSelectDistrict: (id: string) => void;
    stepOverride?: 1 | 2 | 3 | 4; completedOverride?: boolean; proposal?: boolean; transportLabel?: string;
    onEditPreferences: () => void; onExitPrototype: () => void;
    commuteLoading?: boolean; commuteError?: string | null; onRetryCommute?: () => void;
}) {
    const [listOpen, setListOpen] = useState(false);
    const completed = session ? session.status === "completed" : (completedOverride ?? true);
    const step = session ? displayStep(session) : (stepOverride ?? 4);
    const areaName = preview.city ? getCityAreaName(preview.city) : null;
    const hasBudgetCriteria = preview.preferences.monthlyBudget !== null || preview.preferences.maximumRent !== null;
    // Setup keeps the card short: the best three by name, while the map badges the top TOP_RANK_COUNT.
    const top = preview.ranked.filter(isTopRanked).slice(0, Math.min(3, TOP_RANK_COUNT));
    const hasDestination = preview.districts.some((item) => item.distanceKm !== null);
    // An unsaved LF-05 proposal and sample data are separate qualifiers.
    const badge = <>
        {proposal && <span className="badge badge-outline badge-xs border-ink-muted text-ink-muted">Usulan</span>}
        {preview.is_sample && <span className="badge badge-neutral badge-xs">Data contoh</span>}
    </>;

    return <section data-hci-region="onboarding-preview" aria-label="Pratinjau data wilayah" className={`@container absolute left-3 z-100 w-[min(25rem,calc(100%-1.5rem))] rounded-xl border border-rule bg-panel-surface p-3 font-body text-ink shadow-overlay md:left-5 md:rounded-2xl ${completed ? "bottom-[calc(var(--map-sheet-height,44px)+1rem)]" : "bottom-[calc(var(--onboarding-sheet-height,74dvh)+0.75rem)] md:bottom-4"}`}>
        <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
                {!completed && preview.available && <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:hidden" role="status">
                    <span>{step === 1 ? `${areaName} · ${preview.districts.length} kecamatan` : step === 2 ? <><strong className="text-base">{preview.affordableCount}</strong> kecamatan memenuhi batas data sewa</> : step === 3 ? <>Moda {transportLabel ?? (session ? session.answers.transport : "belum dipilih")}</> : <><strong>{hasBudgetCriteria ? preview.eligibleCount : preview.ranked.length}</strong> {hasBudgetCriteria ? "kecamatan sesuai data dan estimasi" : "kecamatan dirangking"}</>}</span>
                    {badge}
                </div>}
                <div className={`${completed || !preview.available ? "flex" : "hidden md:flex"} flex-wrap items-center gap-x-2 gap-y-1`}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{step === 3 ? "Perjalanan" : areaName ?? "Pratinjau kecamatan"}</p>
                    {badge}
                </div>
                {/* Sits beside the toggle button, in the header's spare height, so the card stays compact. */}
                {!completed && step >= 2 && top.length > 0 && <div data-hci-region="onboarding-top-ranking" className="mt-0.5 hidden items-baseline gap-2 text-sm leading-snug md:flex">
                    <span className="shrink-0 text-xs text-ink-muted">Teratas</span>
                    <ol aria-label="Peringkat teratas" className="min-w-0 truncate font-semibold">
                        {top.map((item) => <li key={item.district.zone_id} className="mr-3 inline"><strong className="tabular-nums">{item.rank}</strong> {item.district.zone_name}</li>)}
                    </ol>
                </div>}
            </div>
            {preview.available && !completed && <button type="button" aria-expanded={listOpen} aria-controls="onboarding-area-list" onClick={() => setListOpen(!listOpen)} className="btn btn-ghost h-11 min-h-11 shrink-0 px-0 text-xs text-primary underline">{listOpen ? "Tutup daftar kecamatan" : "Lihat daftar kecamatan"}</button>}
        </div>
        {dataLoading && <p role="status" className="mt-2 text-sm">Memuat data kecamatan…</p>}
        {dataError && <div role="alert" className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-error"><p className="min-w-0 flex-1">{dataError}</p><button type="button" onClick={onRetryData} className="btn btn-ghost h-11 min-h-11 shrink-0 px-1 text-xs text-primary underline">Coba lagi</button></div>}
        {!dataLoading && !dataError && !preview.available && <p role="status" className="mt-2 text-sm">{preview.city ? "Data kecamatan untuk kota ini belum tersedia." : "Pilih salah satu kota yang didukung untuk melihat kecamatan dan bukti yang tersedia."}</p>}
        <div className={completed || !preview.available ? "" : "hidden md:block"}>
            {preview.available && <>
                {step === 2 && <p role="status" className="mt-1 text-sm leading-snug"><strong className="font-sans text-base tabular-nums">{preview.affordableCount}</strong> kecamatan memenuhi batas sewa dan biaya.</p>}
                {step === 3 && <p className="mt-1 text-sm"><strong>Moda {transportLabel ?? (session ? session.answers.transport : "belum dipilih")}</strong></p>}
                {step === 4 && <p role="status" className="mt-1 text-sm leading-snug"><strong className="font-sans text-xl tabular-nums">{hasBudgetCriteria ? preview.eligibleCount : preview.ranked.length}</strong>{hasBudgetCriteria ? " kecamatan sesuai data dan estimasi." : " kecamatan dirangking · anggaran belum ditentukan."}</p>}
                {(step === 2 || step === 4) && <p className="mt-1 text-xs leading-snug text-ink-muted">
                    {step === 2 ? hasDestination ? "Urutan: sewa, biaya, jarak ke tujuan" : "Median sewa · estimasi biaya kota"
                        : completed ? categoryHints[category ?? "summary"] : "Skor memakai dimensi dengan data"}
                </p>}
                {(step === 2 || step === 4) && <div className="mt-2 hidden grid-cols-1 gap-x-3 gap-y-1 border-t border-rule pt-2 text-xs md:grid @min-[22rem]:grid-cols-2">
                    <p className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-4 shrink-0 rounded-xs border border-primary bg-primary/20" />{step >= 3 && preview.planningReach && (category === null || category === "summary" || category === "mobility") ? "Titik pusat dalam jangkauan" : hasBudgetCriteria ? step === 2 ? "Sewa dan biaya sesuai" : "Sesuai data dan estimasi" : "Data untuk dibandingkan"}</p>
                    <p className="flex items-center gap-1.5"><span aria-hidden="true" className="h-3 w-4 shrink-0 rounded-xs border border-secondary bg-accent/20" />{step >= 3 && preview.planningReach && (category === null || category === "summary" || category === "mobility") ? "Titik pusat di tepi jangkauan" : "Data kurang / di luar batas"}</p>
                </div>}
            </>}
        </div>
        {/* While setting up, the form explains the reach; the saved view keeps it because the ring stays on the map. */}
        {preview.available && completed && step >= 3 && <CommuteSummary preview={preview} loading={commuteLoading} error={commuteError} onRetry={onRetryCommute} />}
        {completed && <div className="mt-1 flex flex-wrap items-center gap-x-4">
            <button type="button" className="btn btn-ghost h-11 min-h-11 px-0 text-xs text-primary underline" onClick={onEditPreferences}>Sesuaikan rencana</button>
            <button type="button" className="btn btn-ghost h-11 min-h-11 px-0 text-xs text-ink underline" onClick={onExitPrototype}>Jelajahi data peta</button>
        </div>}
        {geometryLoading && <p role="status" className="mt-2 text-xs text-ink-muted">Memuat batas kecamatan…</p>}
        {geometryError && preview.available && <div role="status" className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-ink-muted"><p className="min-w-0 flex-1">{geometryError} Daftar tetap tersedia.</p><button type="button" onClick={onRetry} className="btn btn-ghost h-11 min-h-11 shrink-0 px-1 text-xs text-primary underline">Coba lagi</button></div>}
        {preview.available && !completed && listOpen && <ul id="onboarding-area-list" className="mt-2 max-h-40 space-y-2 overflow-y-auto border-t border-rule pt-2 text-xs" aria-label="Kecamatan dalam pratinjau">
            {visiblePreviewDistricts(preview, step >= 2).map((item) => <DistrictListItem key={item.district.zone_id} item={item} step={step}
                selected={selectedDistrictId === item.district.zone_id} onSelect={() => onSelectDistrict(item.district.zone_id)} />)}
        </ul>}
    </section>;
}
