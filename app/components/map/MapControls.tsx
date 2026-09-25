"use client";

import { useState } from "react";
import { BriefcaseBusiness, ClipboardList, GraduationCap, House, RotateCcw, Search, TrainFront } from "lucide-react";
import type { Zone } from "@/app/engine/types";

const categories = [
    { label: "Ringkasan", Icon: ClipboardList, available: true },
    { label: "Pekerjaan", Icon: BriefcaseBusiness, available: true },
    { label: "Kampus", Icon: GraduationCap, available: true },
    { label: "Transportasi", Icon: TrainFront, available: true },
    { label: "Kos", Icon: House, available: true },
];

type MapControlsProps = {
    zones: Zone[];
    loading: boolean;
    error: string | null;
    hasActiveRegionLayers: boolean;
    onSelect: (zone: Zone) => void;
    onRetry: () => void;
    onReset: () => void;
};

export default function MapControls(props: MapControlsProps) {
    const [query, setQuery] = useState("");
    const [searchOpen, setSearchOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const matches = props.zones.filter((zone) => `${zone.zone_name} ${zone.city_name}`.toLowerCase().includes(query.trim().toLowerCase()));

    function selectZone(zone: Zone) {
        setQuery("");
        setSearchOpen(false);
        props.onSelect(zone);
    }

    function handleCategoryChange(category: string) {
        if (selectedCategory === category) {
            setSelectedCategory(null);
        }
        else {
            setSelectedCategory(category);
        }
    }

    function handleReset() {
        setQuery("");
        setSearchOpen(false);
        setSelectedCategory(null);
        props.onReset();
    }

    return (
        <div className="pointer-events-none absolute inset-x-3 top-4 z-100 flex flex-col gap-3 md:items-start">
            <div className="flex w-full min-w-0 flex-col items-start gap-2 md:flex-row md:items-center md:gap-3">
                <div className="pointer-events-auto relative z-10 w-full md:w-80 md:shrink-0"
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
                    <form onSubmit={(event) => { event.preventDefault(); if (matches[0]) selectZone(matches[0]); }}>
                        <label className="input flex h-10 min-h-10 w-full gap-2 rounded-2xl border-rule bg-panel-surface md:h-11 md:min-h-11 md:gap-3">
                            <Search aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
                            <span className="sr-only">Cari zona yang didukung</span>
                            <input type="search" placeholder="Cari zona..." value={query}
                                onFocus={() => setSearchOpen(true)}
                                onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
                                onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); }}
                                aria-controls={searchOpen ? "zone-search-results" : undefined}
                                className="min-w-0 flex-1 font-body text-sm" />
                        </label>
                    </form>
                    {searchOpen && <div id="zone-search-results" className="absolute top-full mt-2 max-h-64 w-full overflow-y-auto rounded-lg border border-rule bg-panel-surface p-2 font-body">
                        {props.loading && <p role="status" className="p-2 text-sm">Loading supported zones…</p>}
                        {props.error && <div role="status" className="p-2 text-sm">{props.error}<button className="btn btn-sm mt-2 border-ink bg-transparent text-ink hover:bg-ink hover:text-on-ink" onClick={props.onRetry}>Retry</button></div>}
                        {!props.loading && !props.error && matches.length === 0 && <p className="p-2 text-sm">No supported zones match. Try Pancoran or Setiabudi.</p>}
                        <ul aria-label="Supported zones">
                            {matches.map((zone) => <li key={zone.zone_id}>
                                <button type="button" className="btn btn-ghost min-h-11 w-full justify-start font-normal" onClick={() => selectZone(zone)}>
                                    {zone.zone_name}<span className="text-xs text-ink-muted">{zone.city_name}</span>
                                </button>
                            </li>)}
                        </ul>
                    </div>}
                </div>
                <div className="map-category-scroll pointer-events-auto -my-1 flex w-full min-w-0 max-w-full flex-nowrap gap-2 overflow-x-auto overscroll-x-contain py-1 md:w-auto" role="group" aria-label="Kategori peta">
                    {categories.map(({ label, Icon, available }) => <button key={label} onClick={() => handleCategoryChange(label)} type="button"
                        disabled={!available} aria-pressed={selectedCategory === label} title={available ? label : `${label}: data belum tersedia`}
                        className={`btn btn-sm h-9 min-h-9 shrink-0 gap-1.5 whitespace-nowrap rounded-2xl px-2.5 font-body text-sm font-normal focus-visible:outline-offset-[-2px] ${selectedCategory === label ? "border-primary bg-primary text-base-100" : "border-rule bg-panel-surface text-ink-muted"}`}>
                        <Icon aria-hidden="true" className="size-3.5" />{label}{!available && <span className="sr-only"> — data belum tersedia</span>}
                    </button>)}
                </div>
                {props.hasActiveRegionLayers && <button type="button" onClick={handleReset} aria-label="Reset semua lapisan peta"
                    className="map-reset-button btn btn-sm pointer-events-auto h-9 min-h-9 shrink-0 self-start gap-1.5 rounded-2xl border-ink bg-base-100 px-2.5 font-body text-sm font-semibold text-ink hover:bg-ink hover:text-on-ink shadow-[0_2px_8px_rgba(8,9,53,0.08)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:self-center">
                    <RotateCcw aria-hidden="true" className="size-3.5" />Reset
                </button>}
            </div>
        </div>
    );
}
