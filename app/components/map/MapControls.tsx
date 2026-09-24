"use client";

import { useState } from "react";
import { BriefcaseBusiness, GraduationCap, House, Search, TrainFront } from "lucide-react";
import type { Zone, ZoneMetric } from "@/app/engine/types";

const categories = [
    { label: "Pekerjaan", Icon: BriefcaseBusiness, available: true },
    { label: "Kampus", Icon: GraduationCap, available: true },
    { label: "Transportasi", Icon: TrainFront, available: true },
    { label: "Kos", Icon: House, available: true },
];

type MapControlsProps = {
    zones: Zone[];
    loading: boolean;
    error: string | null;
    metric: ZoneMetric;
    onMetricChange: (metric: ZoneMetric) => void;
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

    return (
        <div className="pointer-events-none absolute inset-x-3 top-4 z-100 flex flex-col gap-3 md:items-start">
            <div className="flex w-full flex-col gap-3 md:flex-row md:items-start">
                <div className="pointer-events-auto relative w-full md:w-80 md:shrink-0"
                    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
                    <form onSubmit={(event) => { event.preventDefault(); if (matches[0]) selectZone(matches[0]); }}>
                        <label className="input flex min-h-11 w-full gap-3 rounded-lg border-rule bg-panel-surface">
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
                        {props.error && <div role="status" className="p-2 text-sm">{props.error}<button className="btn btn-sm mt-2" onClick={props.onRetry}>Retry</button></div>}
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
                <div className="pointer-events-auto flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Kategori peta">
                    {categories.map(({ label, Icon, available }) => <button key={label} onClick={() => handleCategoryChange(label)} type="button"
                        disabled={!available} aria-pressed={selectedCategory === label} title={available ? label : `${label}: data belum tersedia`}
                        className={`btn min-h-11 shrink-0 gap-2 rounded-lg px-3 font-body text-sm font-normal ${selectedCategory === label ? "border-primary bg-primary text-primary-content" : "border-rule bg-panel-surface text-ink-muted"}`}>
                        <Icon aria-hidden="true" className="size-4" />{label}{!available && <span className="sr-only"> — data belum tersedia</span>}
                    </button>)}
                </div>
            </div>
            {/* <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-rule bg-panel-surface p-2 font-body">
                <label className="text-sm" htmlFor="zone-metric">Pekerjaan</label>
                <select id="zone-metric" className="min-h-11 rounded border border-rule bg-base-100 px-2 text-sm"
                    value={props.metric} onChange={(event) => props.onMetricChange(event.target.value === "hiring_activity" ? "hiring_activity" : "sector_presence")}>
                    <option value="sector_presence">Sector presence</option>
                    <option value="hiring_activity">Hiring activity</option>
                </select>
                <button type="button" className="btn btn-ghost min-h-11" onClick={props.onReset}>Reset</button>
            </div> */}
        </div>
    );
}
