"use client";

import { useEffect, useRef, type CSSProperties, type PointerEvent } from "react";
import { Bookmark, Briefcase, ChevronRight, GraduationCap, House, Info, Route, X } from "lucide-react";

import type { LiveDistrictRecommendation } from "@/app/engine/onboarding/types";
import type { MapCategory, RegionFact, ZoneDetailResult } from "@/app/engine/types";
import { formatFactValue, mapCategories, metricLabels } from "./mapMetrics";
import { SHEET_MIN_HEIGHT } from "./MapBottomSheet";
import { prefersReducedMotion } from "./viewport";

type ZoneIntelligencePanelProps = {
  zoneName: string;
  cityName: string;
  details: ZoneDetailResult | null;
  category: MapCategory;
  recommendation: LiveDistrictRecommendation | null;
  destinationName: string | null;
  commuteStale: boolean;
  loading: boolean;
  error: string | null;
  isSample: boolean;
  geometryMissing: boolean;
  onRetry: () => void;
  onClose: () => void;
  onSelectLens: (category: MapCategory) => void;
  mobileOpen: boolean;
};

const categoryMetrics: Record<MapCategory, string[]> = {
  summary: ["population", "employment_rate", "average_monthly_wage_idr", "company_count", "universities", "median_monthly_rent_idr", "public_transport_stops"],
  employment: ["employment_rate", "average_monthly_wage_idr", "company_count"],
  education: ["schools", "universities"],
  housing: ["median_monthly_rent_idr", "housing_price_index"],
  mobility: ["public_transport_stops", "transit_access"],
};

const detailLenses = [
  { category: "employment", label: "Pekerjaan", icon: Briefcase },
  { category: "education", label: "Pendidikan", icon: GraduationCap },
  { category: "housing", label: "Hunian", icon: House },
  { category: "mobility", label: "Mobilitas", icon: Route },
] satisfies { category: MapCategory; label: string; icon: typeof Briefcase }[];

const evidenceTypeLabels = {
  observed: "Teramati",
  estimated: "Estimasi",
  derived: "Turunan",
  unavailable: "Tidak tersedia",
} as const;

const sourceBrands: Record<string, string> = {
  "bps.go.id": "BPS",
  "mamikos.com": "Mamikos",
  "rumah123.com": "Rumah123",
  "travelio.com": "Travelio",
  "rukita.co": "Rukita",
  "rukita.com": "Rukita",
};

function shortSourceLabel(fact: RegionFact) {
  const host = fact.source_url?.match(/^https?:\/\/(?:www\.)?([^/:?#]+)/i)?.[1]?.toLowerCase();
  const domain = Object.keys(sourceBrands).find((name) => host === name || host?.endsWith(`.${name}`));
  if (domain) return sourceBrands[domain];

  const source = fact.source.toLowerCase();
  if (source.includes("mamikos")) return "Mamikos";
  if (source.includes("badan pusat statistik") || source.includes("bps")) return "BPS";
  if (source.includes("monitored by jejak")) return "Jejak";
  if (source.includes("profil perkembangan kependudukan provinsi dki jakarta")) return "Pemprov DKI Jakarta";
  return "Sumber";
}

function shortFactLabel(fact: RegionFact) {
  const [metric, dimension] = fact.metric.split(":");
  const housingType = fact.dimension_value ?? dimension;
  if (metric.endsWith("_monthly_rent_idr")) {
    const type = housingType === "apartment" ? "apartemen" : housingType === "house" ? "rumah" : housingType;
    return type ? `Sewa ${type}` : "Rata-rata sewa bulanan";
  }
  if (metric === "population" || metric === "female_population" || metric === "male_population") return "Penduduk";
  if (metric === "households") return "Keluarga terdaftar";
  return metricLabels[metric] ?? metric.replaceAll("_", " ");
}

function PanelContent({ zoneName, cityName, details, category, recommendation, destinationName, commuteStale, loading, error, isSample, geometryMissing, onRetry, onClose, onSelectLens, idPrefix }: ZoneIntelligencePanelProps & { idPrefix: string }) {
  const sourceDisclosureRef = useRef<HTMLDetailsElement>(null);
  const facts = categoryMetrics[category].flatMap((metric) => details?.facts.find((fact) => fact.metric === metric && fact.evidence_type !== "unavailable")
    ?? recommendation?.district.facts.find((fact) => fact.metric === metric && fact.evidence_type !== "unavailable") ?? []);
  const metricRows = categoryMetrics[category].flatMap((metric) => {
    const fact = facts.find((item) => item.metric === metric);
    return fact || category === "education" ? [{ metric, fact }] : [];
  });
  const campuses = category === "education"
    ? details?.places.length ? details.places.filter((place) => place.category === "campus") : recommendation?.district.campuses ?? []
    : [];
  const rentFact = facts.find((fact) => fact.metric === "median_monthly_rent_idr") ?? recommendation?.rentFact;
  const companyFact = facts.find((fact) => fact.metric === "company_count");
  const educationFacts = ["schools", "universities"].flatMap((metric) => details?.facts.find((fact) => fact.metric === metric && fact.evidence_type !== "unavailable")
    ?? recommendation?.district.facts.find((fact) => fact.metric === metric && fact.evidence_type !== "unavailable") ?? []);
  const transitFact = facts.find((fact) => fact.metric === "public_transport_stops" || fact.metric === "transit_access");
  const commuteRange = !commuteStale && recommendation?.commuteEstimate?.status === "ok"
    ? recommendation.commuteEstimate.minutes
    : null;
  const note = recommendation?.warnings[0] ?? recommendation?.exclusions[0] ?? recommendation?.unknowns[0] ?? null;
  const availableFacts = details?.facts.filter((fact) => fact.evidence_type !== "unavailable") ?? [];
  const sourceFacts = availableFacts.length ? availableFacts
    : recommendation?.district.facts.filter((fact) => fact.evidence_type !== "unavailable") ?? [];
  const sourceEntries = new Map<string, { fact: RegionFact; labels: Set<string>; source: string }>();
  for (const fact of sourceFacts) {
    const label = shortFactLabel(fact);
    const source = shortSourceLabel(fact);
    const key = fact.source_url ?? `${label}:${source}`;
    const entry = sourceEntries.get(key);
    if (entry) entry.labels.add(label);
    else sourceEntries.set(key, { fact, labels: new Set([label]), source });
  }
  const cleanCityName = cityName.replace(/^Kota Administrasi\s+/i, "").replace(/^Kota\s+/i, "");

  const lensDetails: Record<Exclude<MapCategory, "summary">, string> = {
    employment: companyFact ? `${formatFactValue(companyFact)} terdata` : "Data perusahaan belum tersedia",
    education: educationFacts.length
      ? educationFacts.map((fact) => `${formatFactValue(fact)} ${metricLabels[fact.metric]?.toLowerCase()}`).join(" · ")
      : campuses.length ? `${campuses.length} lokasi kampus terdata` : "Data pendidikan belum tersedia",
    housing: rentFact ? `Sewa ${formatFactValue(rentFact)}` : "Data sewa belum tersedia",
    mobility: commuteRange
      ? `${commuteRange.low === commuteRange.high ? commuteRange.high : `${commuteRange.low}–${commuteRange.high}`} mnt${destinationName ? ` ke ${destinationName}` : ""}`
      : transitFact ? formatFactValue(transitFact) : "Data mobilitas belum tersedia",
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col font-body" aria-busy={loading}>
      <div className="flex items-start justify-between gap-4 px-5 py-5 shadow-xs">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{category === "summary" ? `Kecamatan · ${cleanCityName}` : mapCategories[category].panelLabel}</p>
          <h2 id={`${idPrefix}-title`} className="mt-1 font-sans text-2xl font-bold text-ink">{zoneName}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {category === "summary" && <button type="button" disabled title="Simpan area, segera hadir" aria-label="Simpan area, segera hadir" className="btn btn-ghost btn-square size-11 disabled:opacity-100 disabled:text-ink-muted">
            <Bookmark aria-hidden="true" className="size-5" />
          </button>}
          <button type="button" className="btn btn-ghost btn-square size-11" onClick={onClose} aria-label={`Tutup detail ${zoneName}`}>
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-5 pb-[max(1rem,env(safe-area-inset-bottom))] wrap-break-word">
        <div role="status" aria-live="polite" className="text-sm">
          {loading && <p className="mb-3">Memuat data kecamatan…</p>}
          {error && <p className="mb-3">{error}</p>}
          {geometryMissing && <p className="mb-3">Batas kecamatan tidak tersedia.</p>}
        </div>
        {!loading && (error || geometryMissing) && <button type="button" className="btn btn-sm btn-outline btn-neutral mb-4 min-h-11" onClick={onRetry}>Coba lagi</button>}
        {category === "summary" ? <>
          <div className="flex items-center gap-4 border-b-2 border-ink pb-5">
            {recommendation?.score !== null && recommendation?.score !== undefined
              ? <div className="radial-progress shrink-0 text-primary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={recommendation.score} aria-label={`Kecocokan ${recommendation.score} dari 100`} style={{ "--value": recommendation.score, "--size": "4.25rem", "--thickness": "0.35rem" } as CSSProperties}>{recommendation.score}</div>
              : <div role="img" aria-label="Skor kecocokan belum tersedia" className="flex size-[4.25rem] shrink-0 items-center justify-center rounded-full border-[6px] border-rule font-sans text-xl font-semibold text-ink">—</div>}
            <div className="min-w-0">
              <p className="font-sans font-semibold text-ink">{recommendation?.rank ? `Cocok, urutan ke-${recommendation.rank}` : "Urutan kecocokan belum tersedia"}</p>
              <p className="mt-1 text-sm leading-snug text-ink">{recommendation?.reasons.find((reason) => !reason.startsWith("Rata-rata sewa")) ?? (recommendation?.score == null ? "Lengkapi profilmu untuk melihat skor kecocokan." : "Alasan kecocokan belum tersedia.")}</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-rule border-b border-rule py-3">
            <div className="min-w-0 pr-2">
              <dt className="text-xs text-ink-muted">Perjalanan</dt>
              <dd className="mt-1 break-words font-sans text-base font-semibold tabular-nums text-ink">{commuteRange ? `${commuteRange.low === commuteRange.high ? commuteRange.high : `${commuteRange.low}–${commuteRange.high}`} mnt` : "Belum tersedia"}</dd>
              <dd className="text-xs text-ink-muted">{destinationName ? `ke ${destinationName}` : "ke tujuanmu"}</dd>
            </div>
            <div className="min-w-0 px-2">
              <dt className="text-xs text-ink-muted">{rentFact?.dimension_value === "kos" ? "Kos per bulan" : "Sewa per bulan"}</dt>
              <dd className="mt-1 break-words font-sans text-base font-semibold tabular-nums text-ink">{rentFact ? formatFactValue(rentFact).replace(/\/bulan$/, "") : "Belum tersedia"}</dd>
            </div>
            <div className="min-w-0 pl-2">
              <dt className="text-xs text-ink-muted">Perusahaan</dt>
              <dd className="mt-1 break-words font-sans text-base font-semibold tabular-nums text-ink">{companyFact ? formatFactValue(companyFact) : "Belum tersedia"}</dd>
            </div>
          </dl>
          {note && <p className="flex items-start gap-2 border-b border-rule py-4 text-sm leading-snug text-ink"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span><strong>Perlu tahu:</strong> {note}</span></p>}
          <section className="mt-4" aria-labelledby={`${idPrefix}-lenses`}>
            <h3 id={`${idPrefix}-lenses`} className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-ink-muted">Lihat lebih dalam</h3>
            <ul>{detailLenses.map(({ category: lens, label, icon: Icon }) => <li key={lens} className="border-b border-rule">
              <button type="button" className="flex min-h-12 w-full items-center gap-3 px-0.5 py-2 text-left hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => onSelectLens(lens)}>
                <span className="flex size-9 shrink-0 items-center justify-center rounded-field bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-4" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{label}</span>
                  <span className="block truncate text-xs text-ink-muted">{lensDetails[lens]}</span>
                </span>
                <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink" />
              </button>
            </li>)}</ul>
          </section>
          {sourceEntries.size > 0 && <details ref={sourceDisclosureRef} className="mt-3 pt-3">
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Sumber</summary>
            <ul className="space-y-3 pb-2 text-xs text-ink">
              {[...sourceEntries].map(([key, { fact, labels, source }]) => <li key={key}>
                <p className="font-semibold">{[...labels].join(", ")}: {fact.source_url
                  ? <a className="link link-hover" href={fact.source_url} target="_blank" rel="noreferrer">{source}</a>
                  : source}</p>
              </li>)}
            </ul>
          </details>}
        </> : <>
          {isSample && <p className="mb-4"><span className="badge badge-neutral badge-sm font-semibold">Data contoh</span></p>}
          {!loading && !facts.length && !campuses.length && <p className="text-sm text-ink-muted">Belum ada data {mapCategories[category].panelLabel.toLowerCase()} untuk kecamatan ini.</p>}
          {metricRows.length > 0 && <dl className="grid gap-3">
            {metricRows.map(({ metric, fact }) => {
              const confidence = fact?.confidence;
              const validConfidence = typeof confidence === "number" && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1;
              return <div key={metric} className="card border border-rule p-4 shadow-sm">
                <dt className="text-sm text-ink-muted">{metricLabels[metric] ?? metric}</dt>
                <dd className="font-sans text-xl font-semibold tabular-nums text-ink">{fact ? formatFactValue(fact) : loading ? "Memuat…" : "Belum tersedia"}</dd>
                {fact?.source_url && <dd className="mt-1 text-xs text-ink-muted">
                  <a className="link link-hover" href={fact.source_url} target="_blank" rel="noreferrer">{shortSourceLabel(fact)}</a>
                </dd>}
                {fact && <dd className="mt-1">
                  <details className="text-xs text-ink-muted">
                    <summary className="min-h-11 cursor-pointer py-3 font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">Tentang data ini</summary>
                    <dl className="space-y-1 pb-2">
                      <div className="flex gap-1"><dt>Jenis:</dt><dd>{evidenceTypeLabels[fact.evidence_type]}</dd></div>
                      {fact.geographic_level === "zone" && <div className="flex gap-1"><dt>Cakupan:</dt><dd>Kecamatan</dd></div>}
                      {fact.freshness && <div className="flex gap-1"><dt>Pembaruan:</dt><dd>{fact.freshness === "fresh" ? "Data terbaru" : "Perlu diperbarui"}{fact.retrieved_at ? ` · ${fact.retrieved_at.slice(0, 10)}` : ""}</dd></div>}
                      {validConfidence && <div className="flex gap-1"><dt>Skor keyakinan sumber Jejak:</dt><dd>{Math.round(confidence * 100)}/100</dd></div>}
                      {fact.limitations && <div><dt className="font-semibold">Batasan</dt><dd>{fact.limitations}</dd></div>}
                    </dl>
                  </details>
                </dd>}
              </div>;
            })}
          </dl>}
          {campuses.length > 0 && <section className="mt-6" aria-labelledby={`${idPrefix}-campuses`}>
            <h3 id={`${idPrefix}-campuses`} className="font-sans text-lg font-bold">Kampus</h3>
            <ul className="mt-2 space-y-3 text-sm">{campuses.map((place) => <li key={place.id}>
              <p className="font-semibold">{place.name}</p>
              {place.is_sample && <p className="text-xs text-ink-muted">Data contoh</p>}
            </li>)}</ul>
          </section>}
        </>}
      </div>
      {category === "summary" && <footer className="flex shrink-0 items-center gap-2 border-t border-rule px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {isSample && <span className="badge badge-neutral badge-sm shrink-0 font-semibold">Data contoh</span>}
        <button type="button" disabled title="Segera hadir" aria-label="Bandingkan kecamatan, segera hadir" className="btn btn-outline btn-sm min-h-11 min-w-0 flex-1 flex-col gap-0 border-ink px-2 text-xs disabled:border-rule disabled:bg-base-200 disabled:text-ink-muted disabled:opacity-100">
          <span>Bandingkan</span><span className="text-[11px] leading-none">Segera hadir</span>
        </button>
        <button type="button" disabled title="Segera hadir" aria-label="Simpan kecamatan, segera hadir" className="btn btn-primary btn-sm min-h-11 min-w-0 flex-1 flex-col gap-0 px-2 text-xs disabled:border-rule disabled:bg-base-200 disabled:text-ink-muted disabled:opacity-100">
          <span>Simpan</span><span className="text-[11px] leading-none">Segera hadir</span>
        </button>
      </footer>}
    </div>
  );
}

export default function ZoneIntelligencePanel(props: ZoneIntelligencePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const ignoreProgrammaticClose = useRef(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startTime: number } | null>(null);

  function clearCloseTimer() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }

  function finishClose() {
    if (!closingRef.current) return;
    closingRef.current = false;
    clearCloseTimer();
    props.onClose();
  }

  const requestMobileClose = () => dialogRef.current?.close();

  // Every user close (close button, backdrop, Escape, drag) closes the native dialog.
  // daisyUI's modal transition slides the sheet out; the parent is told once it finishes.
  function handleDialogClose() {
    if (ignoreProgrammaticClose.current) {
      ignoreProgrammaticClose.current = false;
      return;
    }
    if (closingRef.current) return;
    closingRef.current = true;

    if (prefersReducedMotion()) {
      finishClose();
      return;
    }

    // The transition normally finishes first; this also handles interrupted transitions.
    closeTimer.current = window.setTimeout(finishClose, 350);
  }

  function handleGrabberPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (closingRef.current || !event.isPrimary) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTime: event.timeStamp,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    sheetRef.current?.setAttribute("data-dragging", "");
  }

  function handleGrabberPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.max(0, event.clientY - drag.startY);
    sheetRef.current?.style.setProperty("translate", `0 ${distance}px`);
  }

  function handleGrabberPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    const sheet = sheetRef.current;
    const distance = Math.max(0, event.clientY - drag.startY);
    const velocity = distance / Math.max(1, event.timeStamp - drag.startTime);
    // Clearing the drag offset in the same frame as close() lets the sheet
    // animate from where it was released: back to rest, or down and out.
    sheet?.removeAttribute("data-dragging");
    sheet?.style.removeProperty("translate");

    if (
      event.type !== "pointercancel" &&
      (distance > Math.max(80, (sheet?.offsetHeight ?? 0) * 0.25) ||
        (distance > 30 && velocity > 0.6))
    ) {
      requestMobileClose();
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    const sheet = sheetRef.current;
    if (!dialog) return;

    const mobileViewport = window.matchMedia("(max-width: 767px)");
    const syncDialog = () => {
      const shouldOpen = mobileViewport.matches && props.mobileOpen;
      if (shouldOpen === dialog.open) return;
      closingRef.current = false;
      sheet?.style.removeProperty("translate");
      sheet?.removeAttribute("data-dragging");
      if (shouldOpen) {
        dialog.showModal();
        return;
      }
      clearCloseTimer();
      ignoreProgrammaticClose.current = true;
      dialog.close();
    };

    syncDialog();
    mobileViewport.addEventListener("change", syncDialog);

    return () => {
      mobileViewport.removeEventListener("change", syncDialog);
      clearCloseTimer();
      if (dialog.open) {
        ignoreProgrammaticClose.current = true;
        dialog.close();
      }
    };
  }, [props.mobileOpen]);

  return (
    <>
      <aside
        id="zone-intelligence-desktop"
        data-hci-region="zone-panel"
        className="absolute top-22 right-4 z-200 hidden w-100 max-w-[calc(100%-2rem)] overflow-hidden rounded-box border border-rule bg-base-100 shadow-overlay md:block"
        aria-labelledby="zone-intelligence-desktop-title"
        style={{ bottom: SHEET_MIN_HEIGHT + 16 }}
      >
        <PanelContent {...props} idPrefix="zone-intelligence-desktop" />
      </aside>

      <dialog
        ref={dialogRef}
        data-hci-region="zone-panel"
        className="modal modal-bottom open:bg-ink/30 md:hidden"
        aria-labelledby="zone-intelligence-mobile-title"
        onClose={handleDialogClose}
      >
        <div
          ref={sheetRef}
          className="zone-intelligence-sheet modal-box flex h-[60dvh] max-h-[60dvh] w-full max-w-none flex-col overflow-hidden border border-rule p-0 shadow-overlay data-dragging:transition-none"
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === "translate") {
              finishClose();
            }
          }}
        >
          <div
            className="flex h-11 shrink-0 touch-none items-center justify-center cursor-grab active:cursor-grabbing"
            aria-hidden="true"
            onPointerDown={handleGrabberPointerDown}
            onPointerMove={handleGrabberPointerMove}
            onPointerUp={handleGrabberPointerEnd}
            onPointerCancel={handleGrabberPointerEnd}
          >
            <span className="h-1 w-10 rounded-full bg-ink/30" />
          </div>
          <div className="min-h-0 flex-1">
            <PanelContent {...props} onClose={requestMobileClose} idPrefix="zone-intelligence-mobile" />
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button>Tutup</button>
        </form>
      </dialog>
    </>
  );
}
