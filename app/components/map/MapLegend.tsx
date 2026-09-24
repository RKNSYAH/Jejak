import type { ZoneMetric } from "@/app/engine/types";

export default function MapLegend({ metric }: { metric: ZoneMetric; }) {
    return (
        <div className="absolute bottom-8 left-4 z-100 font-body">
            <button type="button" className="btn min-h-11 bg-panel-surface" popoverTarget="map-legend">Legenda</button>
            <div id="map-legend" popover="auto" className="fixed inset-auto bottom-24 left-4 m-0 max-w-72 rounded-lg border border-rule bg-panel-surface p-4 text-sm text-ink">
                <h2 className="font-semibold">{metric === "sector_presence" ? "Sector presence" : "Hiring activity"} index</h2>
                <p className="mt-1 text-xs text-ink-muted">Period and monitored-source coverage are shown in each zone’s detail panel.</p>
                <div className="mt-3 h-2 rounded-full bg-[linear-gradient(to_right,#DCEEFF,#71B9EF,#098DEC)]" aria-hidden="true" />
                <div className="mt-1 flex justify-between"><span>0</span><span>100</span></div>
                <p className="mt-2">Gray: unavailable.</p>
                <p className="mt-1">Zero: an available value of 0</p>
            </div>
        </div>
    );
}
