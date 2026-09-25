"use client";

import {
    useImperativeHandle,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type KeyboardEvent,
    type Ref,
} from "react";
import type { Zone } from "@/app/engine/types";

const MIN_HEIGHT = 30;
const CENTER_HEIGHT = 260;
const DEFAULT_HEIGHT = MIN_HEIGHT;

export type MapBottomSheetHandle = { collapse: () => void };

export default function MapBottomSheet({
    zones,
    onSelect,
    ref,
}: {
    zones: Zone[];
    onSelect: (zone: Zone) => void;
    ref: Ref<MapBottomSheetHandle>;
}) {
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);
    useImperativeHandle(ref, () => ({
        collapse: () => {
            setIsDragging(false);
            setHeight(MIN_HEIGHT);
        },
    }), []);
    const getMaxHeight = () => {
        if (typeof window === "undefined") return 600;
        return window.innerHeight * (window.innerWidth >= 768 ? 0.72 : 0.6);
    };

    const clampHeight = (value: number) => {
        return Math.min(Math.max(value, MIN_HEIGHT), getMaxHeight());
    }

    const getSnapPoints = () => {
        const max = getMaxHeight();

        return [
            MIN_HEIGHT,
            Math.min(CENTER_HEIGHT, max),
            max,
        ];
    };

    const snapToNearestHeight = (currentHeight: number) => {
        const snapPoints = getSnapPoints();

        const nearest = snapPoints.reduce((prev, curr) => {
            return Math.abs(curr - currentHeight) < Math.abs(prev - currentHeight) ? curr : prev;
        }, snapPoints[0]);

        setHeight(nearest);
    }

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
        dragStartY.current = event.clientY;
        dragStartHeight.current = height;
    }
    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        const deltaY = event.clientY - dragStartY.current;
        const newHeight = dragStartHeight.current - deltaY;
        setHeight(clampHeight(newHeight));
    }
    const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        event.currentTarget.releasePointerCapture(event.pointerId);
        setIsDragging(false);
        snapToNearestHeight(height);
    }
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = 40;

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setHeight((current) => clampHeight(current + step));
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setHeight((current) => clampHeight(current - step));
        }

        if (event.key === "Home") {
            event.preventDefault();
            setHeight(MIN_HEIGHT);
        }

        if (event.key === "End") {
            event.preventDefault();
            setHeight(getMaxHeight());
        }
    };

    const isExpanded = height > CENTER_HEIGHT;

    return (
        <section className={`absolute bottom-0 left-0 right-0 z-300 flex max-h-[60dvh] flex-col overflow-hidden rounded-t-2xl border border-b-0 border-ink/10 bg-panel-surface shadow-xs md:max-h-[72dvh] ${isDragging ? "" : "transition-[height] duration-200 ease-out"}`} style={{ height }}>
            <div
                role="separator"
                aria-label="Resize exploration panel"
                aria-orientation="horizontal"
                aria-valuemin={MIN_HEIGHT}
                aria-valuemax={Math.round(getMaxHeight())}
                aria-valuenow={Math.round(height)}
                tabIndex={0}
                className="
          flex h-11 shrink-0
          cursor-ns-resize
          touch-none
          items-center
          justify-center
          outline-none
          focus-visible:ring-2
          focus-visible:ring-primary
        "
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onKeyDown={handleKeyDown}
            >
                <div className="h-1 w-10 rounded-full bg-ink/20" />
            </div>
            <div className="shrink-0 px-4 pb-3">
                <p className="font-body text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">Ringkasan - Jakarta</p>
                <div className="mt-1 flex items-center justify-between">
                <h2 className="font-bold font-heading text-lg text-ink">Pilih area jejakmu selanjutnya</h2>
                <p className="font-body text-xs font-medium text-ink-muted md:text-sm">3 area dengan data terbaru</p>
                </div>
            </div>
            <div inert={height === MIN_HEIGHT} className={`@container min-h-0 flex-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-gutter:stable] ${isExpanded ? "overflow-y-auto overscroll-contain md:overflow-x-auto md:overflow-y-hidden" : "overflow-x-auto overscroll-x-contain"}`}>
                <div className={isExpanded
                    ? "flex flex-wrap gap-2 md:flex-nowrap md:gap-8 md:[&>*]:shrink-0"
                    : "flex gap-2 snap-x snap-mandatory md:gap-8"}>
                    {zones.map((zone) => (
                        <RegionCard
                            key={zone.zone_id}
                            name={zone.zone_name}
                            compact={!isExpanded}
                            onClick={() => {
                                onSelect(zone);
                            }}
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}

function RegionCard({ name, compact, onClick }: { name: string; compact: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`card card-border shadow-md min-h-24 min-w-0 w-[min(10rem,calc((100cqi-0.5rem)/2))] cursor-pointer rounded-md bg-white text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:min-h-28 md:w-[min(16rem,calc((100cqi-3rem)/5))] md:rounded-lg ${compact ? "shrink-0 snap-start" : ""}`}
        >
            <span className="card-body min-w-0 justify-between gap-1 p-2.5 md:gap-3 md:p-4">
                <span className="break-words font-body text-sm font-semibold leading-tight text-ink md:text-lg md:leading-snug">{name}</span>
                <span className="font-body text-xs font-medium text-ink-muted md:text-sm">~45rb pekerja</span>
                <span className="font-body text-xs font-semiboldS text-primary md:text-sm md:font-semibold">
                    <span className="md:hidden">Jelajahi →</span>
                    <span className="hidden md:inline">Jelajahi area ini</span>
                </span>
            </span>
        </button>
    )
}
