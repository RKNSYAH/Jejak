"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSheetDrag } from "./useSheetDrag";

export default function StoryReviewPanel({ header, children, footer, saving, onDismiss, onSubmit }: {
    header: ReactNode; children: ReactNode; footer: ReactNode; saving: boolean;
    onDismiss: () => void; onSubmit: () => void;
}) {
    const panelRef = useRef<HTMLDialogElement>(null);
    const titleRef = useRef<HTMLHeadingElement>(null);
    const { collapsed, handleProps } = useSheetDrag(panelRef);

    useEffect(() => {
        // Non-modal, like the form path: the map remains available for picking.
        const panel = panelRef.current;
        panel?.show();
        titleRef.current?.focus({ preventScroll: true });
        return () => panel?.close();
    }, []);

    return <dialog ref={panelRef} aria-labelledby="onboarding-step-three-title" data-hci-region="relocation-onboarding-step-3"
        className="onboarding-story-panel absolute inset-x-0 bottom-0 z-200 m-0 flex h-[var(--sheet-h,74dvh)] max-h-[74dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-rule bg-base-100 p-0 font-body text-ink shadow-overlay max-md:transition-[height] max-md:duration-200 max-md:ease-out motion-reduce:transition-none md:inset-y-4 md:left-auto md:right-4 md:h-auto md:max-h-none md:w-[min(26.5rem,43vw)] md:rounded-2xl"
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); if (!saving) onDismiss(); } }}>
        <button type="button" {...handleProps} disabled={saving} aria-expanded={!collapsed}
            aria-label={collapsed ? "Buka prioritas" : "Perkecil prioritas untuk melihat peta"}
            className="flex h-11 w-full shrink-0 cursor-ns-resize touch-pan-x items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary md:hidden">
            <span aria-hidden="true" className="h-1 w-9 rounded-full bg-ink/20" />
        </button>
        {header}
        <form aria-busy={saving} className={`flex min-h-0 flex-1 flex-col ${collapsed ? "invisible" : ""}`}
            onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
            <fieldset disabled={saving} className="@container min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2 md:px-5 md:pt-3">
                <h1 id="onboarding-step-three-title" ref={titleRef} tabIndex={-1} className="font-sans text-2xl font-bold leading-tight focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="hidden md:inline">Sudah sesuai? </span>Atur prioritasmu
                </h1>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted md:text-xs">Terisi dari ceritamu. Geser, nomor di peta ikut bergeser.</p>
                {children}
            </fieldset>
            <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-rule px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3 md:py-3">
                {footer}
            </footer>
        </form>
    </dialog>;
}
