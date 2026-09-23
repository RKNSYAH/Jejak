"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

import type { ZoneIntelligenceResponse } from "@/app/engine/types";

type ZoneIntelligencePanelProps = {
  zoneName: string;
  intelligence: ZoneIntelligenceResponse;
  onClose: () => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function StatusBadge({ children }: { children: ReactNode }) {
  return <span className="badge badge-outline badge-sm">{children}</span>;
}

function PanelContent({
  zoneName,
  intelligence,
  onClose,
  idPrefix,
}: ZoneIntelligencePanelProps & { idPrefix: string }) {
  const { snapshot } = intelligence;
  const confidence = Math.round(snapshot.evidence.confidence * 100);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-rule px-5 py-5">
        <div>
          <p className="font-body text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
            Zone intelligence
          </p>
          <h2
            id={`${idPrefix}-title`}
            className="mt-1 font-sans text-2xl font-bold text-ink"
          >
            {zoneName}
          </h2>
          <p className="mt-1 font-body text-sm text-ink-muted">
            Software and IT services
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm min-h-11 min-w-11 px-2 text-ink"
          onClick={onClose}
          aria-label={`Close ${zoneName} intelligence`}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 font-body">
        <div className="flex flex-wrap gap-2">
          <StatusBadge>{intelligence.coverage} coverage</StatusBadge>
          <StatusBadge>{intelligence.freshness}</StatusBadge>
          <StatusBadge>{intelligence.refresh.status}</StatusBadge>
        </div>

        <section className="mt-6" aria-labelledby={`${idPrefix}-activity-heading`}>
          <h3
            id={`${idPrefix}-activity-heading`}
            className="font-sans text-lg font-bold text-ink"
          >
            Observed activity
          </h3>
          <dl className="mt-3 grid grid-cols-3 divide-x divide-rule border-y border-rule py-4">
            <div className="pr-3">
              <dt className="text-xs leading-tight text-ink-muted">
                Organizations
              </dt>
              <dd className="mt-1 font-sans text-xl font-bold tabular-nums text-ink">
                {snapshot.observed_organizations}
              </dd>
            </div>
            <div className="px-3">
              <dt className="text-xs leading-tight text-ink-muted">
                Verified offices
              </dt>
              <dd className="mt-1 font-sans text-xl font-bold tabular-nums text-ink">
                {snapshot.verified_offices}
              </dd>
            </div>
            <div className="pl-3">
              <dt className="text-xs leading-tight text-ink-muted">
                Active openings
              </dt>
              <dd className="mt-1 font-sans text-xl font-bold tabular-nums text-ink">
                {snapshot.active_openings}
              </dd>
            </div>
          </dl>
        </section>

        <section className="mt-6" aria-labelledby={`${idPrefix}-indices-heading`}>
          <h3
            id={`${idPrefix}-indices-heading`}
            className="font-sans text-lg font-bold text-ink"
          >
            Sector indicators
          </h3>
          <dl className="mt-3 space-y-3">
            {[
              ["Sector presence", snapshot.indices.sector_presence],
              ["Hiring activity", snapshot.indices.hiring_activity],
              ["Employer diversity", snapshot.indices.employer_diversity],
            ].map(([label, value]) => (
              <div key={label}>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-ink-muted">{label}</dt>
                  <dd className="font-semibold tabular-nums text-ink">
                    {value}/100
                  </dd>
                </div>
                <div className="mt-1 h-2 rounded-full bg-primary-tint" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6" aria-labelledby={`${idPrefix}-evidence-heading`}>
          <h3
            id={`${idPrefix}-evidence-heading`}
            className="font-sans text-lg font-bold text-ink"
          >
            Evidence and freshness
          </h3>
          <dl className="mt-3 divide-y divide-rule border-y border-rule text-sm">
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-muted">Confidence</dt>
              <dd className="text-right font-semibold text-ink">
                {snapshot.evidence.confidence_label} ({confidence}%)
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-muted">Sources monitored</dt>
              <dd className="font-semibold tabular-nums text-ink">
                {snapshot.evidence.sources_monitored}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-muted">Snapshot</dt>
              <dd className="text-right font-semibold text-ink">
                {formatDate(snapshot.snapshot_at)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 py-3">
              <dt className="text-ink-muted">Oldest material evidence</dt>
              <dd className="text-right font-semibold text-ink">
                {formatDate(snapshot.evidence.oldest_material_evidence)}
              </dd>
            </div>
          </dl>
        </section>

        {snapshot.local_headcount && (
          <section
            className="mt-6 border-l-2 border-primary pl-3"
            aria-labelledby={`${idPrefix}-estimate-heading`}
          >
            <div className="flex items-center gap-2">
              <h3
                id={`${idPrefix}-estimate-heading`}
                className="font-sans text-lg font-bold text-ink"
              >
                Local headcount
              </h3>
              <span className="badge badge-info badge-sm">Estimated</span>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {snapshot.local_headcount.minimum.toLocaleString()}–
              {snapshot.local_headcount.maximum.toLocaleString()} people
            </p>
          </section>
        )}

        <section className="mt-6 border-t border-rule pt-4" aria-label="Data note">
          <p className="text-sm leading-6 text-ink-muted">
            This snapshot reflects monitored evidence, not every organization or
            opening in the zone. Housing, wage, and commute evidence is not
            available in this snapshot.
          </p>
        </section>
      </div>
    </div>
  );
}

export default function ZoneIntelligencePanel(
  props: ZoneIntelligencePanelProps,
) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ignoreProgrammaticClose = useRef(false);
  const closingRef = useRef(false);
  const closeTimer = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startTime: number } | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  function finishClose() {
    if (!closingRef.current) return;
    closingRef.current = false;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
    props.onClose();
  }

  function requestMobileClose() {
    if (closingRef.current) return;
    closingRef.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }

    dialogRef.current?.removeAttribute("data-dragging");
    setIsClosing(true);
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
    dialogRef.current?.setAttribute("data-dragging", "");
  }

  function handleGrabberPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const distance = Math.max(0, event.clientY - drag.startY);
    dialogRef.current?.style.setProperty("--sheet-drag", `${distance}px`);
  }

  function handleGrabberPointerEnd(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;

    const dialog = dialogRef.current;
    const distance = Math.max(0, event.clientY - drag.startY);
    const velocity = distance / Math.max(1, event.timeStamp - drag.startTime);
    dialog?.removeAttribute("data-dragging");

    if (
      event.type !== "pointercancel" &&
      (distance > Math.max(80, (dialog?.offsetHeight ?? 0) * 0.25) ||
        (distance > 30 && velocity > 0.6))
    ) {
      requestMobileClose();
    } else {
      dialog?.style.removeProperty("--sheet-drag");
    }
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const mobileViewport = window.matchMedia("(max-width: 767px)");
    const syncDialog = () => {
      if (mobileViewport.matches && !dialog.open) {
        dialog.showModal();
      } else if (!mobileViewport.matches && dialog.open) {
        if (closeTimer.current) window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
        closingRef.current = false;
        setIsClosing(false);
        dialog.style.removeProperty("--sheet-drag");
        dialog.removeAttribute("data-dragging");
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
  }, []);

  function handleDialogClose() {
    if (ignoreProgrammaticClose.current) {
      ignoreProgrammaticClose.current = false;
      return;
    }

    props.onClose();
  }

  return (
    <>
      <aside
        className="absolute inset-y-0 right-0 z-200 hidden w-[min(420px,30vw)] min-w-[360px] border-l border-t border-rule bg-panel-surface shadow-[0_2px_8px_rgba(8,9,53,0.08)] md:block"
        aria-labelledby="zone-intelligence-desktop-title"
      >
        <PanelContent {...props} idPrefix="zone-intelligence-desktop" />
      </aside>

      <dialog
        ref={dialogRef}
        className="zone-intelligence-sheet fixed top-auto inset-x-0 bottom-0 m-0 max-h-[60dvh] w-full max-w-none rounded-t-2xl border border-rule bg-panel-surface p-0 text-ink shadow-[0_2px_8px_rgba(8,9,53,0.08)] backdrop:bg-ink/30 md:hidden"
        aria-labelledby="zone-intelligence-mobile-title"
        data-closing={isClosing || undefined}
        onClose={handleDialogClose}
        onCancel={(event) => {
          event.preventDefault();
          requestMobileClose();
        }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === "transform") {
            finishClose();
          }
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;

          const bounds = event.currentTarget.getBoundingClientRect();
          const clickedInsideDialog =
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom;

          if (!clickedInsideDialog) {
            requestMobileClose();
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
      </dialog>
    </>
  );
}
