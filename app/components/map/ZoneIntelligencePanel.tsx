"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { X } from "lucide-react";

import type { MapCategory, ZoneDetailResult } from "@/app/engine/types";

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

const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 720;
const DEFAULT_PANEL_WIDTH = 420;

function getMaxPanelWidth() {
  return Math.max(
    MIN_PANEL_WIDTH,
    Math.min(MAX_PANEL_WIDTH, Math.floor(window.innerWidth * 0.45)),
  );
}

const categoryMetrics: Record<MapCategory, string[]> = {
  summary: ["population", "employment_rate", "average_monthly_wage_idr", "company_count", "universities", "median_monthly_rent_idr", "public_transport_stops"],
  employment: ["employment_rate", "average_monthly_wage_idr", "company_count"],
  education: ["schools", "universities"],
  housing: ["median_monthly_rent_idr", "housing_price_index"],
  mobility: ["public_transport_stops", "transit_access"],
};

const metricLabels: Record<string, string> = {
  population: "Population",
  employment_rate: "Employment rate",
  average_monthly_wage_idr: "Average monthly wage",
  company_count: "Companies",
  universities: "Universities",
  schools: "Schools",
  median_monthly_rent_idr: "Median monthly rent",
  housing_price_index: "Housing price index",
  public_transport_stops: "Public transport stops",
  transit_access: "Transit access",
};

const categoryLabels: Record<MapCategory, string> = {
  summary: "Ringkasan", employment: "Pekerjaan", education: "Pendidikan",
  housing: "Hunian", mobility: "Mobilitas",
};

function PanelContent({ zoneName, details, category, loading, error, isSample, geometryMissing, onRetry, onClose, idPrefix }: ZoneIntelligencePanelProps & { idPrefix: string }) {
  const facts = categoryMetrics[category].map((metric) => details?.facts.find((fact) => fact.metric === metric));
  const campuses = category === "education" ? details?.places.filter((place) => place.category === "campus") ?? [] : [];
  const available = facts.some(Boolean) || campuses.length > 0;

  return <div className="flex h-full min-h-0 flex-col font-body" aria-busy={loading}>
    <div className="flex items-start justify-between gap-4 px-5 py-5 shadow-xs">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{categoryLabels[category]}</p>
        <h2 id={`${idPrefix}-title`} className="mt-1 font-sans text-2xl font-bold text-ink">{zoneName}</h2>
      </div>
      <button type="button" className="btn btn-ghost btn-square size-11" onClick={onClose} aria-label={`Close ${zoneName} details`}>
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-15">
      {isSample && <p className="mb-4 text-sm text-ink"><span className="badge badge-neutral badge-sm font-semibold">Sample data</span> Illustrative values, not verified observations.</p>}
      <div role="status" aria-live="polite" className="text-sm">
        {loading && <p className="mb-3">Loading regional data…</p>}
        {error && <p className="mb-3">{error} Previously loaded data may still be shown.</p>}
        {geometryMissing && <p className="mb-3">A boundary is not available for this region.</p>}
      </div>
      {!loading && (error || geometryMissing) && <button type="button" className="btn btn-sm btn-outline btn-neutral mb-4 min-h-11" onClick={onRetry}>Retry</button>}
      {!loading && !available && <p className="text-sm text-ink-muted">No {categoryLabels[category].toLowerCase()} data is available for this region yet.</p>}
      {available && <dl className="divide-y divide-rule border-y border-rule">
        {categoryMetrics[category].map((metric, index) => {
          const fact = facts[index];
          if (!fact) return null;
          const value = metric === "employment_rate" ? `${(fact.value * 100).toLocaleString()}%`
            : metric === "median_monthly_rent_idr" || metric === "average_monthly_wage_idr" ? `Rp${fact.value.toLocaleString("id-ID")}/month`
            : `${fact.value.toLocaleString()}${fact.unit === "stops_within_500m" ? " stops within 500 m" : ""}`;
          return <div key={metric} className="py-3">
            <dt className="text-sm text-ink-muted">{metricLabels[metric] ?? metric}</dt>
            <dd className="font-sans text-xl font-semibold tabular-nums text-ink">{value}</dd>
            <dd className="mt-1 text-xs text-ink-muted">{fact.is_sample ? "Sample · " : ""}{fact.evidence_type} · {fact.source}{fact.period_end ? ` · ${fact.period_end}` : " · period unavailable"}{fact.confidence != null ? ` · ${Math.round(fact.confidence * 100)}% confidence` : ""}</dd>
            {fact.source_url && <dd className="mt-1 text-xs"><a className="link link-primary" href={fact.source_url} target="_blank" rel="noopener noreferrer">View source</a></dd>}
            {fact.limitations && <dd className="mt-1 text-xs text-ink-muted">{fact.limitations}</dd>}
          </div>;
        })}
      </dl>}
      {campuses.length > 0 && <section className="mt-6" aria-label="Campuses">
        <h3 className="font-sans text-lg font-bold">Campuses</h3>
        <ul className="mt-2 space-y-3 text-sm">{campuses.map((place) => <li key={place.id}>
          <p className="font-semibold">{place.name}</p>
          <p className="text-xs text-ink-muted">{place.is_sample ? "Sample · " : ""}{place.source}{place.observed_at ? ` · ${place.observed_at.slice(0, 10)}` : ""}</p>
        </li>)}</ul>
      </section>}
      <p className="mt-6 text-xs text-ink-muted">Missing figures are unavailable, not zero. Regional totals do not imply a precise location or a personal fit score.</p>
    </div>
  </div>;
}
export default function ZoneIntelligencePanel(
  props: ZoneIntelligencePanelProps,
) {
  const panelRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const ignoreProgrammaticClose = useRef(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startTime: number } | null>(null);
  const resizeRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [maxPanelWidth, setMaxPanelWidth] = useState(MAX_PANEL_WIDTH);

  useEffect(() => {
    function syncWidth() {
      if (window.innerWidth < 768) return;
      const maximum = getMaxPanelWidth();
      setMaxPanelWidth(maximum);
      setPanelWidth((width) => Math.min(width, maximum));
    }

    syncWidth();
    window.addEventListener("resize", syncWidth);
    return () => window.removeEventListener("resize", syncWidth);
  }, []);

  function handleResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0) return;
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelRef.current?.getBoundingClientRect().width ?? panelWidth,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = resizeRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setPanelWidth(Math.max(
      MIN_PANEL_WIDTH,
      Math.min(getMaxPanelWidth(), Math.round(drag.startWidth + drag.startX - event.clientX)),
    ));
  }

  function handleResizePointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const maximum = getMaxPanelWidth();
    if (event.key === "ArrowLeft") setPanelWidth((width) => Math.min(maximum, width + 20));
    else if (event.key === "ArrowRight") setPanelWidth((width) => Math.max(MIN_PANEL_WIDTH, width - 20));
    else if (event.key === "Home") setPanelWidth(MIN_PANEL_WIDTH);
    else if (event.key === "End") setPanelWidth(maximum);
    else return;
    event.preventDefault();
  }

  function finishClose() {
    if (!closingRef.current) return;
    closingRef.current = false;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    props.onClose();
  }

  function requestMobileClose() {
    dialogRef.current?.close();
  }

  // Every user close (close button, backdrop, Escape, drag) closes the native dialog.
  // daisyUI's modal transition slides the sheet out; the parent is told once it finishes.
  function handleDialogClose() {
    if (ignoreProgrammaticClose.current) {
      ignoreProgrammaticClose.current = false;
      return;
    }
    if (closingRef.current) return;
    closingRef.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
      if (shouldOpen && !dialog.open) {
        closingRef.current = false;
        sheet?.style.removeProperty("translate");
        sheet?.removeAttribute("data-dragging");
        dialog.showModal();
        return;
      }
      if (!shouldOpen && dialog.open) {
        if (closeTimer.current) {
          window.clearTimeout(closeTimer.current);
        }

        closeTimer.current = null;
        closingRef.current = false;
        sheet?.style.removeProperty("translate");
        sheet?.removeAttribute("data-dragging");

        ignoreProgrammaticClose.current = true;
        dialog.close();
      }
    };

    syncDialog();
    mobileViewport.addEventListener("change", syncDialog);

    return () => {
      mobileViewport.removeEventListener("change", syncDialog);
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
      if (dialog.open) {
        ignoreProgrammaticClose.current = true;
        dialog.close();
      }
    };
  }, [props.mobileOpen]);

  return (
    <>
      <aside
        ref={panelRef}
        id="zone-intelligence-desktop"
        className="absolute inset-y-0 right-0 z-200 hidden min-w-[320px] max-w-[min(45vw,720px)] border-l border-t border-rule bg-panel-surface shadow-overlay md:block"
        aria-labelledby="zone-intelligence-desktop-title"
        style={{ width: panelWidth }}
      >
        <div
          role="separator"
          tabIndex={0}
          aria-label="Resize panel"
          aria-orientation="vertical"
          aria-controls="zone-intelligence-desktop"
          aria-valuemin={MIN_PANEL_WIDTH}
          aria-valuemax={maxPanelWidth}
          aria-valuenow={panelWidth}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          onLostPointerCapture={() => { resizeRef.current = null; }}
          onKeyDown={handleResizeKeyDown}
          className="absolute top-1/2 left-0 z-10 flex h-16 w-5 -translate-y-1/2 touch-none cursor-col-resize items-center justify-center gap-1 rounded-md bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className="h-6 w-0.75 mr-2 rounded-full bg-ink-muted" aria-hidden="true" />
        </div>
        <PanelContent {...props} idPrefix="zone-intelligence-desktop" />
      </aside>

      <dialog
        ref={dialogRef}
        className="modal modal-bottom open:bg-ink/30 md:hidden"
        aria-labelledby="zone-intelligence-mobile-title"
        onClose={handleDialogClose}
      >
        <div
          ref={sheetRef}
          className="zone-intelligence-sheet modal-box flex h-[60dvh] flex-col overflow-hidden border border-rule p-0 shadow-overlay data-dragging:transition-none"
          onTransitionEnd={(event) => {
            if (event.target === event.currentTarget && event.propertyName === "translate") {
              finishClose();
            }
          }}
        >
          <div
            className="flex h-8 shrink-0 touch-none items-center justify-center cursor-grab active:cursor-grabbing"
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
          <button>Close</button>
        </form>
      </dialog>
    </>
  );
}
