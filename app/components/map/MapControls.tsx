"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, MapPin, RotateCcw, Search, X } from "lucide-react";
import type { MapCategory, Zone } from "@/app/engine/types";
import type { AccountSummary } from "@/app/engine/controller/userServerController";
import { mapCategories } from "./mapMetrics";
import { prefersReducedMotion } from "./viewport";
import { getZoneSearchMatches, type ZoneSearchScope } from "./zoneSearch";
import { getMetroArea, metroAreas, type MetroArea } from "@/app/engine/lib/metroArea";
import BrandLogo from "../BrandLogo";
import AccountCluster, { ACCOUNT_CLUSTER_WIDTH } from "../AccountCluster";
import HeaderCluster from "../HeaderCluster";

const categories: MapCategory[] = ["summary", "employment", "education", "housing", "mobility"];

const scrollButtons = [
    { direction: -1, side: "left", position: "left-1", label: "Gulir kategori ke kiri", Icon: ChevronLeft },
    { direction: 1, side: "right", position: "right-1", label: "Gulir kategori ke kanan", Icon: ChevronRight },
] as const;

type MapControlsProps = {
    showProfileReminder: boolean;
    onCompleteProfile: () => void;
    onDismissProfileReminder: () => void;
    zones: Zone[];
    searchScope: ZoneSearchScope | null;
    onAreaChange: (area: MetroArea) => void;
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
    onRetryHeatmap: () => void;
    onReset: () => void;
    category: MapCategory | null;
    onCategoryChange: (category: MapCategory) => void;
    sidebarWidth: number;
    account: AccountSummary | null;
};

export default function MapControls(props: MapControlsProps) {
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [areaOpen, setAreaOpen] = useState(false);
    const [categoryOverflow, setCategoryOverflow] = useState({ overflowing: false, left: false, right: false });
    const categoriesRef = useRef<HTMLDivElement>(null);
    const categoryContentRef = useRef<HTMLDivElement>(null);
    const matches = getZoneSearchMatches(props.zones, query, props.searchScope);
    const area = getMetroArea(props.searchScope);

    useEffect(() => {
        const viewport = categoriesRef.current;
        const content = categoryContentRef.current;
        if (!viewport || !content) return;

        const desktop = window.matchMedia("(min-width: 768px)");
        let frame = 0;

        const updateOverflow = () => {
            frame = 0;
            const maxScroll = viewport.scrollWidth - viewport.clientWidth;
            const overflowing = desktop.matches && maxScroll > 1;
            const left = overflowing && viewport.scrollLeft > 1;
            const right = overflowing && viewport.scrollLeft < maxScroll - 1;
            setCategoryOverflow((previous) => previous.overflowing === overflowing && previous.left === left && previous.right === right
                ? previous : { overflowing, left, right });
        };
        const scheduleUpdate = () => {
            if (!frame) frame = window.requestAnimationFrame(updateOverflow);
        };

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
        viewport?.scrollBy({ left: direction * viewport.clientWidth * 0.8, behavior: prefersReducedMotion() ? "instant" : "smooth" });
    }

    function scrollButton({ direction, side, position, label, Icon }: typeof scrollButtons[number]) {
        return <button type="button" onClick={() => scrollCategories(direction)} aria-label={label} aria-controls="map-category-scroll" disabled={!categoryOverflow[side]}
            className={`btn btn-square btn-ghost absolute ${position} top-1/2 z-10 -translate-y-1/2 size-11 border-0 bg-transparent text-ink-muted shadow-none hover:bg-transparent active:bg-transparent focus-visible:-outline-offset-2 hidden ${categoryOverflow.overflowing ? "md:flex" : ""} ${categoryOverflow[side] ? "" : "invisible"}`}>
            <Icon aria-hidden="true" className="size-4" />
        </button>;
    }

    function closeSearch() {
        setQuery("");
        setSearchOpen(false);
    }

    return (
        <div data-hci-region="controls" className="pointer-events-none absolute top-[max(1rem,env(safe-area-inset-top))] right-3 left-[max(0.75rem,env(safe-area-inset-left))] z-100 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 @container md:top-4 md:right-(--controls-right) md:left-4 md:flex md:flex-col md:items-start"
            style={{ "--controls-right": `${Math.max(props.sidebarWidth, ACCOUNT_CLUSTER_WIDTH + 16) + 12}px` } as CSSProperties}>
            {/* Header and lens row share one width on desktop; on mobile they are grid rows beside the account cluster. */}
            <div className="contents md:flex md:w-full md:max-w-128 md:flex-col md:gap-2">
            <HeaderCluster region="map-header" className="pointer-events-auto col-start-1 row-start-1">
                <div className="hidden shrink-0 md:flex"><BrandLogo border={false} /></div>
                <span aria-hidden="true" className="hidden h-7 w-px shrink-0 bg-rule md:block" />
                <div data-hci-region="area-picker" className={`dropdown shrink-0 ${areaOpen ? "dropdown-open" : "dropdown-close"}`}
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setAreaOpen(false); }}>
                    <button type="button" onClick={() => setAreaOpen((open) => !open)} onKeyDown={(event) => { if (event.key === "Escape") setAreaOpen(false); }}
                        aria-label={`Wilayah: ${area?.name ?? "belum dipilih"}`} aria-expanded={areaOpen} aria-controls="map-area-options"
                        className="btn btn-ghost h-9 min-h-9 gap-1 rounded-xl px-2 text-sm font-semibold text-ink focus-visible:-outline-offset-2 md:h-11 md:min-h-11">
                        <MapPin aria-hidden="true" className="size-4 md:hidden" />
                        <span className="hidden md:inline">{area?.name ?? "Pilih wilayah"}</span>
                        <ChevronDown aria-hidden="true" className="size-4 text-ink-muted" />
                    </button>
                    <ul id="map-area-options" aria-label="Pilih wilayah" className="dropdown-content menu mt-2 w-52 gap-2 rounded-2xl border border-rule bg-base-100 p-2 font-body shadow-overlay">
                        {metroAreas.map((item) => <li key={item.id}>
                            <button type="button" aria-current={item.id === props.searchScope} onClick={() => { setAreaOpen(false); props.onAreaChange(item); }}
                                className="min-h-11 flex items-center gap-2 rounded-lg px-2 py-2 text-left leading-relaxed">
                                {item.name}
                            </button>
                        </li>)}
                    </ul>
                </div>
                <search data-hci-region="search" className={`dropdown min-w-0 flex-1 ${searchOpen ? "dropdown-open" : "dropdown-close"}`}
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
                    <form onSubmit={(event) => { event.preventDefault(); if (matches[0]) { closeSearch(); props.onSelect(matches[0]); } }}>
                        <label className="input h-9 min-h-9 w-full rounded-xl border-0 px-2 shadow-none md:h-11 md:min-h-11 md:gap-3 md:border md:border-rule md:px-3">
                            <Search aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                            <span className="sr-only">Cari kecamatan</span>
                            <input type="search" placeholder="Cari kecamatan…" value={query}
                                onFocus={() => setSearchOpen(true)}
                                onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
                                onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }}
                                aria-controls={searchOpen ? "zone-search-results" : undefined}
                                className="min-w-0 flex-1 text-base md:text-sm" />
                        </label>
                    </form>
                    <div id="zone-search-results" className="dropdown-content mt-2 max-h-[min(16rem,40dvh)] w-full min-w-64 overflow-y-auto overscroll-contain rounded-2xl border border-rule bg-base-100 p-2 font-body shadow-overlay">
                        {props.loading && <p role="status" className="p-2 text-sm">Memuat kecamatan…</p>}
                        {props.error && <div role="status" className="p-2 text-sm">{props.error}<button className="btn btn-sm btn-outline btn-neutral mt-2" onClick={props.onRetry}>Coba lagi</button></div>}
                        {!props.loading && !props.error && matches.length === 0 && <p role="status" className="p-2 text-sm">Tidak ada kecamatan yang cocok. Coba kata lain.</p>}
                        <ul className="menu w-full p-0" aria-label="Hasil pencarian kecamatan">
                            {matches.map((zone) => <li key={zone.zone_id}>
                                <button type="button" className="min-h-11" onClick={() => { closeSearch(); props.onSelect(zone); }}>
                                    {zone.zone_name}<span className="text-xs text-ink-muted">{zone.city_name}</span>
                                </button>
                            </li>)}
                        </ul>
                    </div>
                </search>
            </HeaderCluster>
                {/* Beside the search bar when the controls row has room (32rem header + gap + banner); otherwise centered below. */}
                {props.showProfileReminder && <aside aria-label="Pengingat profil" data-hci-region="profile-completion-banner"
                    className="alert pointer-events-auto absolute left-1/2 top-full mt-2 grid w-[min(30rem,100%)] -translate-x-1/2 grid-cols-[minmax(0,1fr)_auto] gap-x-1 gap-y-0 rounded-xl border-neutral bg-neutral p-2 text-neutral-content shadow-overlay md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center @min-[52rem]:top-0 @min-[52rem]:left-[calc(32rem+0.75rem)] @min-[52rem]:mt-0 @min-[52rem]:min-h-15 @min-[52rem]:py-1.5 @min-[52rem]:w-[min(34rem,calc(100%-32.75rem))] @min-[52rem]:translate-x-0">
                    <p className="min-w-0 font-body text-xs font-semibold">Lengkapi profilmu untuk melihat rekomendasi.</p>
                    <button type="button" onClick={props.onCompleteProfile}
                        className="btn btn-sm btn-ghost col-start-1 row-start-2 min-h-11 justify-self-start px-2 text-xs text-neutral-content underline underline-offset-4 hover:bg-neutral hover:text-accent border-none hover:shadow-none focus-visible:outline-neutral-content md:col-start-2 md:row-start-1">
                        Lengkapi profil
                    </button>
                    <button type="button" onClick={props.onDismissProfileReminder} aria-label="Tutup pengingat profil"
                        className="btn btn-square btn-ghost col-start-2 row-start-1 size-11 self-start text-neutral-content hover:bg-neutral focus-visible:outline-neutral-content md:col-start-3">
                        <X aria-hidden="true" className="size-4" />
                    </button>
                </aside>}
            <div data-hci-region="categories" className="pointer-events-auto col-span-2 row-start-2 flex w-full min-w-0 items-center gap-1 rounded-2xl border border-rule bg-base-100 p-1 shadow-overlay md:p-1.5" role="group" aria-label="Kategori peta">
                <div className="relative flex min-w-0 flex-1 items-center">
                    {scrollButton(scrollButtons[0])}
                    <div id="map-category-scroll" ref={categoriesRef} className="map-category-scroll min-w-0 flex-1 overflow-x-auto overscroll-x-contain">
                        <div ref={categoryContentRef} className="flex w-max flex-nowrap gap-1">
                        {categories.map((id) => <button key={id} onClick={() => props.onCategoryChange(id)} type="button"
                            aria-pressed={props.category === id} title={mapCategories[id].panelLabel}
                            className={`btn btn-sm min-h-11 shrink-0 whitespace-nowrap rounded-xl px-3 text-sm font-semibold focus-visible:-outline-offset-2 md:h-9 md:min-h-9 ${props.category === id ? "btn-primary" : "btn-ghost text-ink"}`}>
                            {mapCategories[id].panelLabel}
                        </button>)}
                        </div>
                    </div>
                    {scrollButton(scrollButtons[1])}
                </div>
                {props.hasActiveRegionLayers && <button type="button" onClick={() => { closeSearch(); props.onReset(); }} aria-label="Reset semua lapisan peta" title="Reset"
                    className="btn btn-square btn-ghost size-11 shrink-0 rounded-xl text-ink focus-visible:-outline-offset-2 md:size-9">
                    <RotateCcw aria-hidden="true" className="size-4" />
                </button>}
            </div>
            {(props.recommendationsLoading || props.recommendationsError) && <div role="status" className="pointer-events-auto col-span-2 row-start-3 min-w-0 rounded-box border border-rule bg-panel-surface px-3 py-2 font-body text-sm text-ink-muted wrap-break-word md:w-full">
                {props.recommendationsLoading ? "Memuat rekomendasi…" : props.recommendationsError}
                {props.recommendationsError && <button type="button" className="btn btn-sm btn-outline btn-neutral ml-2" onClick={props.onRetryRecommendations}>Coba lagi</button>}
            </div>}
            {props.category && props.category !== "summary" && (props.heatmapLoading || props.heatmapError) &&
                <div role="status" className="pointer-events-auto col-span-2 min-w-0 rounded-box border border-rule bg-panel-surface px-3 py-2 font-body text-sm text-ink-muted wrap-break-word md:w-full">
                    {props.heatmapLoading ? "Memuat heatmap…" : props.heatmapError}
                    {props.heatmapError && <button type="button" className="btn btn-sm btn-outline btn-neutral ml-2" onClick={props.onRetryHeatmap}>Coba lagi</button>}
                </div>}
            </div>
            {/* In the grid beside search on mobile; on desktop it sits 16px from the map's top-right corner, above the detail card. */}
            <AccountCluster account={props.account}
                className="pointer-events-auto col-start-2 row-start-1 md:absolute md:top-0 md:right-[calc(1rem-var(--controls-right))]" />
            
        </div>
    );
}
