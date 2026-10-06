"use client";

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { clamp } from "../viewport";

// Handle (44) + step header (~60) + borders. ponytail: fixed px, not measured; measure if the header grows.
const PEEK_HEIGHT = 112;
const maxHeight = () => window.innerHeight * 0.74;

// Mobile bottom sheet: drag or tap the handle to shrink the form so the map shows. Height lives in `--sheet-h`
// on the panel, which only its mobile height class reads, so desktop layout is untouched.
export function useSheetDrag(panelRef: RefObject<HTMLElement | null>) {
    const [collapsed, setCollapsed] = useState(false);
    const drag = useRef<{ y: number; height: number; moved: boolean } | null>(null);
    const suppressClick = useRef(false);

    function resize(height: number, animate: boolean) {
        const panel = panelRef.current;
        if (!panel) return;
        panel.style.transition = animate ? "" : "none";
        panel.style.setProperty("--sheet-h", `${height}px`);
    }

    function settle(target: number) {
        resize(target, true);
        setCollapsed(target === PEEK_HEIGHT);
    }

    useEffect(() => {
        const media = window.matchMedia("(min-width: 768px)");
        const reset = () => {
            if (!media.matches) return;
            panelRef.current?.style.removeProperty("--sheet-h");
            setCollapsed(false);
        };
        media.addEventListener("change", reset);
        return () => media.removeEventListener("change", reset);
    }, [panelRef]);

    const handleProps = {
        onPointerDown(event: PointerEvent<HTMLElement>) {
            const panel = panelRef.current;
            if (!panel) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            suppressClick.current = false;
            drag.current = { y: event.clientY, height: panel.getBoundingClientRect().height, moved: false };
            // JejakMap skips re-measuring the panel while this is set, so the map isn't re-rendered every frame.
            panel.dataset.dragging = "true";
        },
        onPointerMove(event: PointerEvent<HTMLElement>) {
            const current = drag.current;
            if (!current) return;
            const delta = event.clientY - current.y;
            if (Math.abs(delta) > 4) current.moved = true;
            if (current.moved) resize(clamp(current.height - delta, PEEK_HEIGHT, maxHeight()), false);
        },
        onPointerUp(event: PointerEvent<HTMLElement>) {
            const current = drag.current;
            const panel = panelRef.current;
            drag.current = null;
            if (!current || !panel) return;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            delete panel.dataset.dragging;
            suppressClick.current = current.moved;
            if (!current.moved) return;
            // Snap to whichever end is closer.
            const height = panel.getBoundingClientRect().height;
            settle(height - PEEK_HEIGHT < maxHeight() - height ? PEEK_HEIGHT : maxHeight());
        },
        onClick() {
            if (suppressClick.current) {
                suppressClick.current = false;
                return;
            }
            settle(collapsed ? maxHeight() : PEEK_HEIGHT);
        },
    };

    return { collapsed, handleProps: { ...handleProps, onPointerCancel: handleProps.onPointerUp } };
}
