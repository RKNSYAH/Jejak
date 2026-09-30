import type { MapCategory, ZoneDetailResult } from "@/app/engine/types";
import { List } from "lucide-react";
import { type CellLayer, mapCategories } from "./mapMetrics";
import type { CellSummary } from "./zoneLayerData";
import { GLOW_RAMP, type MetricRange } from "./zoneLayers";

function describe(values: string[], fallback: string, multiple: string): string {
    if (values.length === 0) return fallback;
    return values.length === 1 ? values[0] : multiple;
}

function RangeKey({ range, format, scope = "in displayed zones" }: {
    range: NonNullable<MetricRange>; format: (value: number) => string; scope?: string;
}) {
    if (range.min === range.max) return <p className="mt-2 flex items-center gap-2 tabular-nums">
        <span className="size-3 rounded-sm bg-primary" aria-hidden="true" />{format(range.min)} {scope}
    </p>;
    return <>
        <div className="mt-2 h-3 rounded-field bg-linear-to-r from-accent to-primary" aria-hidden="true" />
        <div className="mt-1 flex flex-col gap-1 tabular-nums"><span>{format(range.min)}</span><span>{format(range.max)}</span></div>
    </>;
}

function CellKey({ layer, summary, zoneName }: { layer: CellLayer; summary: CellSummary; zoneName: string }) {
    const span = (bounds: { low: number; high: number } | null, value: number) =>
        bounds ? `${layer.format(bounds.low)}–${layer.format(bounds.high)}` : layer.format(value);
    return <>
        <p className="mt-1 text-xs text-ink-muted">H3 cells (~0.1 km²) · {describe(summary.sources, "Source unavailable", "Multiple sources")} · {describe(summary.periods, "Period unavailable", "Multiple periods")}</p>
        {layer.kind === "glow" ? <>
            <div className="mt-2 h-3 rounded-field" style={{ background: `linear-gradient(to right, ${GLOW_RAMP.join(", ")})` }} aria-hidden="true" />
            <div className="mt-1 flex flex-col gap-1 text-xs"><span>Fewer</span><span>More, relative within {zoneName}</span></div>
            <p className="mt-2 tabular-nums">Highest cell: {span(summary.maxBounds, summary.max)} {layer.unit}</p>
            <p className="tabular-nums">All shown cells: {span(summary.totalBounds, summary.total)} {layer.unit}</p>
        </> : <RangeKey range={{ min: summary.min, max: summary.max }} format={layer.format} scope="in shown cells" />}
        <p className="mt-2 text-xs text-ink-muted">{summary.withValue} of {summary.cells} cells have a value. {layer.hiddenNote ?? ""}</p>
        {summary.isSample && <p className="mt-1 text-xs text-ink-muted">Synthetic cell values, not observed evidence.</p>}
    </>;
}

export default function MapLegend({ category, range, detailsByZone, visibleZoneIds, selectedZoneName,
    cellLayerOptions, activeCellLayer, cellSummary, cellsLoading, cellsError, onCellLayerChange, companyPointShown }: {
    category: MapCategory;
    range: MetricRange;
    detailsByZone: Record<string, ZoneDetailResult>;
    visibleZoneIds: string[];
    selectedZoneName: string | null;
    cellLayerOptions: CellLayer[];
    activeCellLayer: CellLayer | null;
    cellSummary: CellSummary | null;
    cellsLoading: boolean;
    cellsError: string | null;
    onCellLayerChange: (id: string) => void;
    companyPointShown: boolean;
}) {
    const config = mapCategories[category];
    const facts = visibleZoneIds.flatMap((id) => detailsByZone[id]?.facts.filter((fact) => fact.metric === config.metric && fact.evidence_type !== "unavailable") ?? []);
    const sources = [...new Set(facts.map((fact) => fact.source))];
    const periods = [...new Set(facts.map((fact) => fact.period_end ?? "period unavailable"))];
    const hasSample = facts.some((fact) => fact.is_sample);
    const hasApproximate = facts.some((fact) => fact.approximate);

    return (
        <div data-hci-region="legend" className="flex w-11 flex-col items-center gap-2 font-body">
            <button type="button" aria-label="Legenda" title="Legenda" className="btn btn-square btn-outline btn-neutral size-11 min-h-11 min-w-11 bg-base-100 p-0 [anchor-name:--map-legend] hover:bg-neutral" popoverTarget="map-legend">
                <List aria-hidden="true" className="size-4" />
            </button>
            {cellSummary?.isSample && <span role="status" aria-label="Sample heatmap" title="Sample heatmap" className="badge badge-neutral size-11 rounded-field px-0 text-center text-[10px] leading-3 whitespace-normal">
                <span aria-hidden="true">Sample<br />heatmap</span>
            </span>}
            {cellLayerOptions.length > 1 && <div className="join join-vertical w-fit" role="group" aria-label="Cell layer">
                {cellLayerOptions.map((layer) => <button key={layer.id} type="button" onClick={() => onCellLayerChange(layer.id)}
                    aria-pressed={activeCellLayer?.id === layer.id} title={layer.label}
                    className={`btn btn-sm btn-square join-item size-11 min-h-11 min-w-11 whitespace-normal px-0 py-1 text-center text-[10px] leading-3 ${activeCellLayer?.id === layer.id ? "btn-primary" : "btn-outline btn-neutral bg-base-100"}`}>
                    {layer.shortLabel}
                </button>)}
            </div>}
             <div id="map-legend" popover="auto" className="map-legend-popover dropdown dropdown-top inset-auto mb-2 max-h-[min(65dvh,32rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-box border border-rule bg-base-100 p-4 text-sm text-ink shadow-overlay [position-anchor:--map-legend]">
                <h2 className="font-semibold">{config.label}</h2>
                {category === "summary" ? <p className="mt-2">Light blue: ranked or opened region. Selected region has a darker outline.</p> : <>
                    <p className="mt-1 text-xs text-ink-muted">District fill · {describe(sources, "Source unavailable", "Multiple sources")} · {describe(periods, "Period unavailable", "Multiple periods")}</p>
                    {range ? <RangeKey range={range} format={config.format} /> : <p className="mt-3">No supported district values in displayed regions.</p>}
                    <p className="mt-2 text-xs text-ink-muted">Unfilled boundaries: district value unavailable. {hasSample ? "Sample values are illustrative, not verified. " : ""}{hasApproximate ? "Counts found on monitored sources are approximate. " : ""}See region details for limitations.</p>
                    {companyPointShown && selectedZoneName && <p className="mt-2 flex items-center gap-2 text-xs"><span className="size-3 shrink-0 rounded-full bg-ink/85" aria-hidden="true" />Companies found in {selectedZoneName}, shown at the district centre</p>}
                    {selectedZoneName && activeCellLayer && <div className="mt-3 border-t border-rule pt-3">
                        <p className="font-semibold">{selectedZoneName} · {activeCellLayer.label}</p>
                        {cellsLoading ? <p className="mt-1 text-xs" role="status">Loading cells…</p>
                            : cellsError ? <p className="mt-1 text-xs" role="status">Heatmap unavailable.</p>
                            : cellSummary ? <CellKey layer={activeCellLayer} summary={cellSummary} zoneName={selectedZoneName} />
                            : <p className="mt-1 text-xs">No cell values for this zone yet.</p>}
                    </div>}
                </>}
            </div>
        </div>
    );
}
