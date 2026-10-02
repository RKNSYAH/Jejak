"use client";

import {
    useCallback,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type PointerEvent as ReactPointerEvent,
    type KeyboardEvent,
    type Ref,
} from "react";
import type { ZoneSummary } from "@/app/engine/types";
import type { LiveDistrictRecommendation } from "@/app/engine/onboarding/types";
import { formatRupiah } from "@/app/engine/onboarding/demoData";

const MIN_HEIGHT = 30;
const CENTER_HEIGHT = 290;
const DEFAULT_HEIGHT = MIN_HEIGHT;

function getMinHeight() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches ? 44 : MIN_HEIGHT;
}

function getMaxHeight() {
    if (typeof window === "undefined") return 600;
    return window.innerHeight * (window.innerWidth >= 768 ? 0.72 : 0.6);
}

function getCenterHeight() {
    return Math.min(CENTER_HEIGHT, Math.max(getMinHeight() + 1, getMaxHeight() * 0.6));
}

export type MapBottomSheetHandle = {
    collapse: () => void;
    focusHandle: () => void;
};

export type MapBottomSheetState = {
    height: number;
    isExpanded: boolean;
    isDragging: boolean;
};

export default function MapBottomSheet({
    zones,
    onSelect,
    onStateChange,
    onHeightChange,
    ref,
    recommendations,
    onEditPreferences,
}: {
    zones: ZoneSummary[];
    onSelect: (zone: ZoneSummary) => void;
    onStateChange: (state: MapBottomSheetState) => void;
    onHeightChange: (height: number) => void;
    ref: Ref<MapBottomSheetHandle>;
    recommendations?: LiveDistrictRecommendation[];
    onEditPreferences?: () => void;
}) {
    const [height, setHeight] = useState(DEFAULT_HEIGHT);
    const [isDragging, setIsDragging] = useState(false);
    const sheetRef = useRef<HTMLElement>(null);
    const dragHandleRef = useRef<HTMLDivElement>(null);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);
    const pendingHeight = useRef<number | null>(null);
    const dragFrame = useRef<number | null>(null);

    useEffect(() => {
        onHeightChange(getMinHeight());
        onStateChange({ height: getMinHeight(), isExpanded: false, isDragging: false });
    }, [onHeightChange, onStateChange]);

    const setSheetHeight = useCallback((nextHeight: number) => {
        if (sheetRef.current) sheetRef.current.style.height = `${nextHeight}px`;
        dragHandleRef.current?.setAttribute("aria-valuenow", String(Math.round(nextHeight)));
        onHeightChange(nextHeight);
        onStateChange({
            height: nextHeight,
            isExpanded: nextHeight > getCenterHeight(),
            isDragging: false,
        });
        setHeight(nextHeight);
    }, [onHeightChange, onStateChange]);

    useEffect(() => {
        const frame = requestAnimationFrame(() => setSheetHeight(getMinHeight()));
        return () => cancelAnimationFrame(frame);
    }, [setSheetHeight]);

    useEffect(() => {
        const onResize = () => {
            const nextHeight = height <= 44 ? getMinHeight() : Math.min(height, getMaxHeight());
            if (nextHeight !== height) setSheetHeight(nextHeight);
            dragHandleRef.current?.setAttribute("aria-valuemax", String(Math.round(getMaxHeight())));
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [height, setSheetHeight]);

    useImperativeHandle(ref, () => ({
        collapse: () => {
            setIsDragging(false);
            setSheetHeight(getMinHeight());
        },
        focusHandle: () => dragHandleRef.current?.focus(),
    }), [setSheetHeight]);

    const clampHeight = (value: number) => {
        return Math.min(Math.max(value, getMinHeight()), getMaxHeight());
    }

    const getSnapPoints = () => {
        const max = getMaxHeight();

        return [
            getMinHeight(),
            Math.min(getCenterHeight(), max),
            max,
        ];
    };

    const snapToNearestHeight = (currentHeight: number) => {
        const snapPoints = getSnapPoints();

        const nearest = snapPoints.reduce((prev, curr) => {
            return Math.abs(curr - currentHeight) < Math.abs(prev - currentHeight) ? curr : prev;
        }, snapPoints[0]);

        setSheetHeight(nearest);
    }

    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setIsDragging(true);
        dragStartY.current = event.clientY;
        dragStartHeight.current = height;
        pendingHeight.current = null;
        onStateChange({ height, isExpanded: height > getCenterHeight(), isDragging: true });
    }
    const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        const deltaY = event.clientY - dragStartY.current;
        pendingHeight.current = clampHeight(dragStartHeight.current - deltaY);
        if (dragFrame.current === null) {
            dragFrame.current = requestAnimationFrame(() => {
                dragFrame.current = null;
                if (pendingHeight.current !== null) {
                    if (sheetRef.current) sheetRef.current.style.height = `${pendingHeight.current}px`;
                    dragHandleRef.current?.setAttribute("aria-valuenow", String(Math.round(pendingHeight.current)));
                    onHeightChange(pendingHeight.current);
                }
            });
        }
    }
    const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDragging) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        setIsDragging(false);
        if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
        dragFrame.current = null;
        const releasedHeight = pendingHeight.current ?? height;
        pendingHeight.current = null;
        snapToNearestHeight(releasedHeight);
    }

    useEffect(() => () => {
        if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    }, []);
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = 40;

        if (event.key === "ArrowUp") {
            event.preventDefault();
            setSheetHeight(clampHeight(height + step));
        }

        if (event.key === "ArrowDown") {
            event.preventDefault();
            setSheetHeight(clampHeight(height - step));
        }

        if (event.key === "Home") {
            event.preventDefault();
            setSheetHeight(getMinHeight());
        }

        if (event.key === "End") {
            event.preventDefault();
            setSheetHeight(getMaxHeight());
        }
    };

    const isExpanded = height > getCenterHeight();

    return (
        <section ref={sheetRef} data-hci-region="zone-list" className={`absolute bottom-0 left-0 right-0 z-300 flex max-h-[60dvh] flex-col overflow-hidden rounded-t-box border border-b-0 border-rule bg-panel-surface shadow-xs md:max-h-[72dvh] ${isDragging ? "" : "transition-[height] duration-200 ease-out"}`} style={{ height }}>
            <div
                ref={dragHandleRef}
                role="separator"
                aria-label="Resize exploration panel"
                aria-orientation="horizontal"
                aria-valuemin={getMinHeight()}
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
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                    <h2 className="min-w-0 font-sans text-lg font-bold leading-tight text-ink">{recommendations ? "Kecamatan dalam pratinjau" : "Pilih kecamatan jejakmu selanjutnya"}</h2>
                    <p className="shrink-0 font-body text-xs font-medium text-ink-muted md:text-sm">{zones.length} kecamatan tersedia</p>
                </div>
                {onEditPreferences && <button type="button" className="btn btn-ghost mt-1 min-h-11 px-0 text-xs text-primary underline" onClick={onEditPreferences}>Ubah preferensi</button>}
            </div>
            <div inert={height <= getMinHeight()} className={`@container min-h-0 flex-1 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] scrollbar-gutter-stable ${isExpanded ? "overflow-y-auto overscroll-contain" : "overflow-x-auto overscroll-x-contain"}`}>
                {recommendations && !recommendations.length && <p role="status" className="py-2 text-sm text-ink-muted">Belum ada hasil yang dapat dirangking dari bukti tersedia. Waktu rute belum dinilai.</p>}
                <div className={isExpanded
                    ? "grid grid-cols-2 gap-2 @min-[480px]:grid-cols-3 @min-[768px]:grid-cols-4 @min-[768px]:gap-4 @min-[1200px]:grid-cols-5"
                    : "flex gap-2 snap-x snap-mandatory md:gap-8"}>
                    {zones.map((zone) => (
                        <RegionCard
                            key={zone.zone_id}
                            name={zone.zone_name}
                            cityName={zone.city_name}
                            isSample={zone.is_sample}
                            compact={!isExpanded}
                            recommendation={recommendations?.find((item) => item.district.zone_id === zone.zone_id)}
                            onClick={() => onSelect(zone)}
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}

function RegionCard({ name, cityName, isSample, compact, onClick, recommendation }: { name: string; cityName: string; isSample: boolean; compact: boolean; onClick: () => void; recommendation?: LiveDistrictRecommendation }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`card card-border min-h-24 min-w-0 cursor-pointer bg-base-100 text-left shadow-overlay hover:border-primary focus-visible:outline-primary md:min-h-28 ${compact ? "w-[min(10rem,calc((100cqi-0.5rem)/2))] shrink-0 snap-start md:w-[min(16rem,calc((100cqi-3rem)/5))]" : "w-full"}`}
        >
            <span className="card-body min-w-0 justify-between gap-1 p-2.5 md:gap-3 md:p-4">
                <span className="wrap-break-word font-body text-sm font-semibold leading-tight text-ink md:text-lg md:leading-snug">{recommendation?.rank ? `${recommendation.rank}. ` : ""}{name}</span>
                <span className="font-body text-xs text-ink-muted md:text-sm">{cityName}</span>
                <span className="font-body text-xs font-medium text-ink-muted md:text-sm">{isSample ? "Data contoh" : "Lihat data kecamatan"}</span>
                {recommendation && <span className="font-body text-xs leading-relaxed text-ink-muted">{recommendation.rent === null ? "Sewa belum tersedia" : `Median sewa Rp${formatRupiah(recommendation.rent)}`}{recommendation.eligible === false ? " · di luar batas" : recommendation.eligible === null ? " · belum terverifikasi" : ""}</span>}
                <span className="font-body text-xs font-semibold text-primary md:text-sm">
                    <span className="md:hidden">Jelajahi →</span>
                    <span className="hidden md:inline">Jelajahi area ini</span>
                </span>
            </span>
        </button>
    )
}
