"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, BriefcaseBusiness, ChevronLeft, ChevronRight, ClipboardList, GraduationCap, House, RotateCcw, Search, TrainFront, User, X } from "lucide-react";
import type { MapCategory, Zone } from "@/app/engine/types";
import { getZoneSearchMatches, type ZoneSearchScope } from "./zoneSearch";

const categories = [
    { id: "summary", label: "Ringkasan", Icon: ClipboardList },
    { id: "employment", label: "Pekerjaan", Icon: BriefcaseBusiness },
    { id: "education", label: "Pendidikan", Icon: GraduationCap },
    { id: "housing", label: "Hunian", Icon: House },
    { id: "mobility", label: "Mobilitas", Icon: TrainFront },
];

type MapControlsProps = {
    showProfileReminder: boolean;
    onCompleteProfile: () => void;
    onDismissProfileReminder: () => void;
    zones: Zone[];
    searchScope: ZoneSearchScope | null;
    loading: boolean;
    error: string | null;
    hasActiveRegionLayers: boolean;
    onSelect: (zone: Zone) => void;
    onRetry: () => void;
    recommendationsLoading: boolean;
    recommendationsError: string | null;
    onRetryRecommendations: () => void;
    heatmapLoading: boolean;
    heatmapError: string | null;
    heatmapEmpty: boolean;
    onRetryHeatmap: () => void;
    onReset: () => void;
    category: MapCategory | null;
    onCategoryChange: (category: MapCategory) => void;
    sidebarWidth: number;
};

export default function MapControls(props: MapControlsProps) {
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [categoryOverflow, setCategoryOverflow] = useState({ overflowing: false, left: false, right: false });
    const categoriesRef = useRef<HTMLDivElement>(null);
    const categoryContentRef = useRef<HTMLDivElement>(null);
    const matches = getZoneSearchMatches(props.zones, query, props.searchScope);

    useEffect(() => {
        const viewport = categoriesRef.current;
        const content = categoryContentRef.current;
        if (!viewport || !content) return;

        const desktop = window.matchMedia("(min-width: 768px)");
        let frame = 0;

        function updateOverflow() {
            frame = 0;
            const maxScroll = viewport!.scrollWidth - viewport!.clientWidth;
            const overflowing = desktop.matches && maxScroll > 1;
            const left = overflowing && viewport!.scrollLeft > 1;
            const right = overflowing && viewport!.scrollLeft < maxScroll - 1;
            setCategoryOverflow((previous) => previous.overflowing === overflowing && previous.left === left && previous.right === right
                ? previous : { overflowing, left, right });
        }

        function scheduleUpdate() {
            if (!frame) frame = window.requestAnimationFrame(updateOverflow);
        }

        const observer = new ResizeObserver(scheduleUpdate);
        observer.observe(viewport);
        observer.observe(content);
        viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
        desktop.addEventListener("change", scheduleUpdate);
        scheduleUpdate();

        return () => {
            observer.disconnect();
            viewport.removeEventListener("scroll", scheduleUpdate);
            desktop.removeEventListener("change", scheduleUpdate);
            window.cancelAnimationFrame(frame);
        };
    }, []);

    useEffect(() => {
        const active = categoriesRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
        active?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [props.category]);

    function scrollCategories(direction: -1 | 1) {
        const viewport = categoriesRef.current;
        if (!viewport) return;
        viewport.scrollBy({
            left: direction * viewport.clientWidth * 0.8,
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        });
    }

    function selectZone(zone: Zone) {
        setQuery("");
        setSearchOpen(false);
        props.onSelect(zone);
    }

    function handleReset() {
        setQuery("");
        setSearchOpen(false);
        props.onReset();
    }

    return (
        <div data-hci-region="controls" className="pointer-events-none absolute top-[max(1rem,env(safe-area-inset-top))] left-[max(0.75rem,env(safe-area-inset-left))] z-100 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 md:inset-x-3 md:top-4 md:flex md:flex-row md:gap-3 md:items-start" style={{ right: props.sidebarWidth + 12 }}>
            <div className="contents md:flex md:w-full md:min-w-0 md:flex-row md:items-center md:gap-3">
            <search data-hci-region="search" className={`dropdown pointer-events-auto z-10 min-w-0 md:w-80 md:shrink-0 ${searchOpen ? "dropdown-open" : "dropdown-close"}`}
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
                    <form onSubmit={(event) => { event.preventDefault(); if (matches[0]) selectZone(matches[0]); }}>
                        <label className="input h-11 min-h-11 w-full shadow-sm rounded-3xl md:gap-3">
                            <Search aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                            <span className="sr-only">Cari zona yang didukung</span>
                            <input type="search" placeholder="Cari zona..." value={query}
                                onFocus={() => setSearchOpen(true)}
                                onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
                                onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }}
                                aria-controls={searchOpen ? "zone-search-results" : undefined}
                                className="min-w-0 flex-1 text-base md:text-sm" />
                        </label>
                    </form>
                    <div id="zone-search-results" className="dropdown-content mt-2 max-h-[min(16rem,40dvh)] w-full overflow-y-auto overscroll-contain rounded-2xl border border-rule bg-base-100 p-2 font-body shadow-overlay">
                        {props.loading && <p role="status" className="p-2 text-sm">Loading supported regions…</p>}
                        {props.error && <div role="status" className="p-2 text-sm">{props.error}<button className="btn btn-sm btn-outline btn-neutral mt-2" onClick={props.onRetry}>Retry</button></div>}
                        {!props.loading && !props.error && matches.length === 0 && <p role="status" className="p-2 text-sm">Tidak ada kecamatan yang cocok. Coba kata lain.</p>}
                        <ul className="menu w-full p-0" aria-label="Supported zones">
                            {matches.map((zone) => <li key={zone.zone_id}>
                                <button type="button" className="min-h-11" onClick={() => selectZone(zone)}>
                                    {zone.zone_name}<span className="text-xs text-ink-muted">{zone.city_name}</span>
                                </button>
                            </li>)}
                        </ul>
                    </div>
            </search>
            <div data-hci-region="categories" className="pointer-events-auto relative col-span-2 row-start-2 flex min-w-0 w-full items-center rounded-3xl border border-rule bg-panel-surface px-2 py-1 shadow-sm md:col-auto md:row-auto md:-my-1 md:w-auto" role="group" aria-label="Kategori peta">
                <button type="button" onClick={() => scrollCategories(-1)} aria-label="Gulir kategori ke kiri" aria-controls="map-category-scroll" disabled={!categoryOverflow.left}
                    className={`btn btn-square btn-ghost absolute left-1 top-1/2 z-10 -translate-y-1/2 size-11 border-0 bg-transparent text-ink-muted shadow-none hover:bg-transparent active:bg-transparent focus-visible:-outline-offset-2 hidden ${categoryOverflow.overflowing ? "md:flex" : ""} ${categoryOverflow.left ? "" : "invisible"}`}>
                    <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                <div id="map-category-scroll" ref={categoriesRef} className="map-category-scroll min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
                    <div ref={categoryContentRef} className="flex w-max flex-nowrap gap-2">
                    {categories.map(({ id, label, Icon }) => <button key={id} onClick={() => props.onCategoryChange(id as MapCategory)} type="button"
                        aria-pressed={props.category === id} title={label}
                        className={`btn btn-sm min-h-11 shrink-0 whitespace-nowrap px-3 text-sm font-normal rounded-3xl focus-visible:-outline-offset-2 md:h-9 md:min-h-9 md:px-2.5 ${props.category === id ? "btn-primary font-semibold" : "border-rule bg-panel-surface font-semibold text-ink-muted"}`}>
                        <Icon aria-hidden="true" className="size-3.5" />{label}
                    </button>)}
                    {props.hasActiveRegionLayers && <button type="button" onClick={handleReset} aria-label="Reset semua lapisan peta"
                        className="btn btn-sm btn-outline btn-neutral pointer-events-auto min-h-11 shrink-0 rounded-3xl bg-base-100 px-3 text-sm hover:bg-neutral md:h-9 md:min-h-9 md:px-2.5">
                        <RotateCcw aria-hidden="true" className="size-3.5" />Reset
                    </button>}
                    </div>
                </div>
                <button type="button" onClick={() => scrollCategories(1)} aria-label="Gulir kategori ke kanan" aria-controls="map-category-scroll" disabled={!categoryOverflow.right}
                    className={`btn btn-square btn-ghost absolute right-1 top-1/2 z-10 -translate-y-1/2 size-11 border-0 bg-transparent text-ink-muted shadow-none hover:bg-transparent active:bg-transparent focus-visible:-outline-offset-2 hidden ${categoryOverflow.overflowing ? "md:flex" : ""} ${categoryOverflow.right ? "" : "invisible"}`}>
                    <ChevronRight aria-hidden="true" className="size-4" />
                </button>
            </div>
            </div>
            {(props.recommendationsLoading || props.recommendationsError) && <div role="status" className="pointer-events-auto col-span-2 row-start-3 min-w-0 rounded-box border border-rule bg-panel-surface px-3 py-2 font-body text-sm text-ink-muted wrap-break-word md:row-auto">
                {props.recommendationsLoading ? "Memuat area peringkat…" : props.recommendationsError}
                {props.recommendationsError && <button type="button" className="btn btn-sm btn-outline btn-neutral ml-2" onClick={props.onRetryRecommendations}>Retry</button>}
            </div>}
            {props.category && props.category !== "summary" && (props.heatmapLoading || props.heatmapError || props.heatmapEmpty) &&
                <div role="status" className="pointer-events-auto col-span-2 min-w-0 rounded-box border border-rule bg-panel-surface px-3 py-2 font-body text-sm text-ink-muted wrap-break-word md:row-auto md:w-80">
                    {props.heatmapLoading ? "Memuat heatmap…" : props.heatmapError ?? "Belum ada data sel untuk zona ini."}
                    {props.heatmapError && <button type="button" className="btn btn-sm btn-outline btn-neutral ml-2" onClick={props.onRetryHeatmap}>Retry</button>}
                </div>}
            <div className="pointer-events-auto col-start-2 row-start-1 flex items-start gap-2 md:col-auto md:row-auto md:gap-3">
                <button type="button" title="Area tersimpan" aria-label="Area tersimpan" className="btn btn-square size-11 shrink-0 rounded-2xl border border-rule bg-panel-surface shadow-sm focus-visible:outline-primary md:size-9">
                    <Bookmark aria-hidden="true" className="size-4" />
                </button>
                <Link href="/user" title="Profil" aria-label="Profil" className="btn btn-square size-11 shrink-0 rounded-2xl border border-rule bg-panel-surface shadow-sm focus-visible:outline-primary md:size-9">
                    <User aria-hidden="true" className="size-4" />
                </Link>
            </div>
            {props.showProfileReminder && <aside aria-label="Profile completion reminder" data-hci-region="profile-completion-banner"
                className="alert pointer-events-auto absolute left-1/2 top-full mt-2 grid w-[min(30rem,100%)] -translate-x-1/2 grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-0 rounded-xl border-neutral bg-neutral p-2 text-neutral-content shadow-overlay md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                <p className="min-w-0 font-body text-xs font-semibold">Complete your profile to show your recommendations.</p>
                <button type="button" onClick={props.onCompleteProfile}
                    className="btn btn-sm btn-ghost col-start-1 row-start-2 min-h-11 justify-self-start px-2 text-xs text-neutral-content underline underline-offset-4 hover:bg-neutral hover:text-accent border-none hover:shadow-none focus-visible:outline-neutral-content md:col-start-2 md:row-start-1">
                    Complete profile
                </button>
                <button type="button" onClick={props.onDismissProfileReminder} aria-label="Dismiss profile reminder"
                    className="btn btn-square btn-ghost col-start-2 row-start-1 size-11 self-start text-neutral-content hover:bg-neutral focus-visible:outline-neutral-content md:col-start-3">
                    <X aria-hidden="true" className="size-4" />
                </button>
            </aside>}
        </div>
    );
}
