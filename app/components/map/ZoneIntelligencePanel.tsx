"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import { X } from "lucide-react";

import type { MapCategory, ZoneDetailResult } from "@/app/engine/types";
import { formatFactValue, mapCategories, metricLabels } from "./mapMetrics";
import { SHEET_MIN_HEIGHT } from "./MapBottomSheet";
import { prefersReducedMotion } from "./viewport";

type ZoneIntelligencePanelProps = {
  zoneName: string;
  details: ZoneDetailResult | null;
  category: MapCategory;
  loading: boolean;
  error: string | null;
  isSample: boolean;
  geometryMissing: boolean;
  onRetry: () => void;
  onClose: () => void;
  mobileOpen: boolean;
};

const categoryMetrics: Record<MapCategory, string[]> = {
  summary: ["population", "employment_rate", "average_monthly_wage_idr", "company_count", "universities", "median_monthly_rent_idr", "public_transport_stops"],
  employment: ["employment_rate", "average_monthly_wage_idr", "company_count"],
  education: ["schools", "universities"],
  housing: ["median_monthly_rent_idr", "housing_price_index"],
  mobility: ["public_transport_stops", "transit_access"],
};

function PanelContent({ zoneName, details, category, loading, error, isSample, geometryMissing, onRetry, onClose, idPrefix }: ZoneIntelligencePanelProps & { idPrefix: string }) {
  const facts = categoryMetrics[category].flatMap((metric) => details?.facts.find((fact) => fact.metric === metric && fact.evidence_type !== "unavailable") ?? []);
  const metricRows = categoryMetrics[category].flatMap((metric) => {
    const fact = facts.find((item) => item.metric === metric);
    return fact || category === "education" ? [{ metric, fact }] : [];
  });
  const campuses = category === "education" ? details?.places.filter((place) => place.category === "campus") ?? [] : [];

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col font-body" aria-busy={loading}>
      <div className="flex items-start justify-between gap-4 px-5 py-5 shadow-xs">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{mapCategories[category].panelLabel}</p>
          <h2 id={`${idPrefix}-title`} className="mt-1 font-sans text-2xl font-bold text-ink">{zoneName}</h2>
        </div>
        <button type="button" className="btn btn-ghost btn-square size-11" onClick={onClose} aria-label={`Tutup detail ${zoneName}`}>
          <X aria-hidden="true" className="size-5" />
        </button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 pb-[max(1rem,env(safe-area-inset-bottom))] wrap-break-word md:px-5 md:pb-5">
        {isSample && <p className="mb-4"><span className="badge badge-neutral badge-sm font-semibold">Data contoh</span></p>}
        <div role="status" aria-live="polite" className="text-sm">
          {loading && <p className="mb-3">Memuat data kecamatan…</p>}
          {error && <p className="mb-3">{error}</p>}
          {geometryMissing && <p className="mb-3">Batas kecamatan tidak tersedia.</p>}
        </div>
        {!loading && (error || geometryMissing) && <button type="button" className="btn btn-sm btn-outline btn-neutral mb-4 min-h-11" onClick={onRetry}>Coba lagi</button>}
        {!loading && !facts.length && !campuses.length && <p className="text-sm text-ink-muted">Belum ada data {mapCategories[category].panelLabel.toLowerCase()} untuk kecamatan ini.</p>}
        {metricRows.length > 0 && <dl className="grid gap-3">
          {metricRows.map(({ metric, fact }) => (
            <div key={metric} className="card border border-rule shadow-sm p-4">
              <dt className="text-sm text-ink-muted">{metricLabels[metric] ?? metric}</dt>
              <dd className="font-sans text-xl font-semibold tabular-nums text-ink">{fact ? formatFactValue(fact) : loading ? "Memuat…" : "Belum tersedia"}</dd>
              {fact && <dd className="mt-1 text-xs text-ink-muted">{fact.is_sample ? "Data contoh · " : ""}{fact.period_end ?? "Periode belum tersedia"}</dd>}
              {fact?.source_url && <dd className="mt-1 text-xs text-ink-muted">
                <a className="link link-hover" href={fact.source_url} target="_blank" rel="noreferrer">Sumber</a>
              </dd>}
            </div>
          ))}
        </dl>}
        {campuses.length > 0 && <section className="mt-6" aria-labelledby={`${idPrefix}-campuses`}>
          <h3 id={`${idPrefix}-campuses`} className="font-sans text-lg font-bold">Kampus</h3>
          <ul className="mt-2 space-y-3 text-sm">{campuses.map((place) => <li key={place.id}>
            <p className="font-semibold">{place.name}</p>
            {place.is_sample && <p className="text-xs text-ink-muted">Data contoh</p>}
          </li>)}</ul>
        </section>}
      </div>
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
      {/* Floating card below the top-right account cluster and above the collapsed bottom sheet. */}
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
