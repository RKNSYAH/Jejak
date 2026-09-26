import type { MapCategory } from "@/app/engine/types";

const labels: Record<MapCategory, string> = {
    summary: "Displayed regions",
    employment: "Company count (companies)",
    education: "Universities (count)",
    housing: "Median monthly rent (IDR)",
    mobility: "Public transport stops (count)",
};

export default function MapLegend({ category, isSample }: { category: MapCategory; isSample: boolean }) {
    return (
        <div className="font-body">
            <button type="button" className="btn btn-outline btn-neutral min-h-11 bg-base-100 [anchor-name:--map-legend] hover:bg-neutral" popoverTarget="map-legend">Legenda</button>
            <div id="map-legend" popover="auto" className="map-legend-popover dropdown dropdown-top inset-auto mb-2 w-72 rounded-box border border-rule bg-base-100 p-4 text-sm text-ink shadow-overlay [position-anchor:--map-legend]">
                <h2 className="font-semibold">{labels[category]}</h2>
                <p className="mt-1 text-xs text-ink-muted">{isSample ? "Sample values. " : ""}Source and period are listed in the region panel.</p>
                <p className="mt-2">{category === "summary" ? "Light blue: ranked or opened region. Selected region has a darker outline." : "Blue: a value is available (including zero). Gray: unavailable. Fill does not encode magnitude."}</p>
            </div>
        </div>
    );
}
