"use client";

import { useState } from "react";
import { BriefcaseBusiness, ClipboardList, GraduationCap, House, RotateCcw, Search, TrainFront } from "lucide-react";
import type { MapCategory, Zone } from "@/app/engine/types";

const categories = [
    { id: "summary", label: "Ringkasan", Icon: ClipboardList },
    { id: "employment", label: "Pekerjaan", Icon: BriefcaseBusiness },
    { id: "education", label: "Pendidikan", Icon: GraduationCap },
    { id: "housing", label: "Hunian", Icon: House },
    { id: "mobility", label: "Mobilitas", Icon: TrainFront },
];

type MapControlsProps = {
    zones: Zone[];
    loading: boolean;
    error: string | null;
    hasActiveRegionLayers: boolean;
    onSelect: (zone: Zone) => void;
    onRetry: () => void;
    recommendationsLoading: boolean;
    recommendationsError: string | null;
    onRetryRecommendations: () => void;
    onReset: () => void;
    category: MapCategory | null;
    onCategoryChange: (category: MapCategory) => void;
};

export default function MapControls(props: MapControlsProps) {
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const matches = props.zones.filter((zone) => `${zone.zone_name} ${zone.city_name}`.toLowerCase().includes(query.trim().toLowerCase()));

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
        <div data-hci-region="controls" className="pointer-events-none absolute inset-x-3 top-4 z-100 flex flex-col gap-3 md:items-start">
            <div className="flex w-full min-w-0 flex-col items-start gap-2 md:flex-row md:items-center md:gap-3">
                <search data-hci-region="search" className={`dropdown pointer-events-auto z-10 w-full md:w-80 md:shrink-0 ${searchOpen ? "dropdown-open" : "dropdown-close"}`}
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
                    <form onSubmit={(event) => { event.preventDefault(); if (matches[0]) selectZone(matches[0]); }}>
                        <label className="input w-full shadow-sm rounded-2xl md:h-11 md:gap-3">
                            <Search aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                            <span className="sr-only">Cari zona yang didukung</span>
                            <input type="search" placeholder="Cari zona..." value={query}
                                onFocus={() => setSearchOpen(true)}
                                onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
                                onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }}
                                aria-controls={searchOpen ? "zone-search-results" : undefined}
                                className="min-w-0 flex-1 text-sm" />
                        </label>
                    </form>
                    <div id="zone-search-results" className="dropdown-content mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-rule bg-base-100 p-2 font-body shadow-overlay">
                        {props.loading && <p role="status" className="p-2 text-sm">Loading supported regions…</p>}
                        {props.error && <div role="status" className="p-2 text-sm">{props.error}<button className="btn btn-sm btn-outline btn-neutral mt-2" onClick={props.onRetry}>Retry</button></div>}
                        {!props.loading && !props.error && matches.length === 0 && <p className="p-2 text-sm">No regions match this search.</p>}
                        <ul className="menu w-full p-0" aria-label="Supported zones">
                            {matches.map((zone) => <li key={zone.zone_id}>
                                <button type="button" className="min-h-11" onClick={() => selectZone(zone)}>
                                    {zone.zone_name}<span className="text-xs text-ink-muted">{zone.city_name}</span>
                                </button>
                            </li>)}
                        </ul>
                    </div>
                </search>
                <div data-hci-region="categories" className="map-category-scroll pointer-events-auto -my-1 flex w-full min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain py-1 md:w-auto" role="group" aria-label="Kategori peta">
                    {categories.map(({ id, label, Icon }) => <button key={id} onClick={() => props.onCategoryChange(id as MapCategory)} type="button"
                        aria-pressed={props.category === id} title={label}
                        className={`btn btn-sm shadow-sm rounded-2xl h-9 whitespace-nowrap px-2.5 text-sm font-normal focus-visible:-outline-offset-2 ${props.category === id ? "btn-primary font-semibold" : "border-rule bg-panel-surface font-semibold text-ink-muted"}`}>
                        <Icon aria-hidden="true" className="size-3.5" />{label}
                    </button>)}
                </div>
                {props.hasActiveRegionLayers && <button type="button" onClick={handleReset} aria-label="Reset semua lapisan peta"
                    className="btn btn-sm btn-outline rounded-2xl btn-neutral pointer-events-auto h-9 self-start bg-base-100 px-2.5 text-sm shadow-sm hover:bg-neutral md:self-center">
                    <RotateCcw aria-hidden="true" className="size-3.5" />Reset
                </button>}
            </div>
            {(props.recommendationsLoading || props.recommendationsError) && <div role="status" className="pointer-events-auto rounded-box border border-rule bg-panel-surface px-3 py-2 font-body text-sm text-ink-muted">
                {props.recommendationsLoading ? "Memuat area peringkat…" : props.recommendationsError}
                {props.recommendationsError && <button type="button" className="btn btn-sm btn-outline btn-neutral ml-2" onClick={props.onRetryRecommendations}>Retry</button>}
            </div>}
        </div>
    );
}
