import type { MapCategory, ZoneDetailResult } from "@/app/engine/types";
import { List } from "lucide-react";
import { type CellLayer, type EducationMetric, educationMetrics, getMapMetricConfig } from "./mapMetrics";
import { type CellSummary, summarizeFacts } from "./zoneLayerData";
import { GLOW_RAMP, type MetricRange } from "./zoneLayers";

function describe(values: string[], fallback: string, multiple: string): string {
    if (values.length === 0) return fallback;
    return values.length === 1 ? values[0] : multiple;
}

function provenance(sources: string[], periods: string[]): string {
    return `${describe(sources, "Sumber tidak tersedia", "Beberapa sumber")} · ${describe(periods, "Periode tidak tersedia", "Beberapa periode")}`;
}

function RangeKey({ range, format, scope = "di kecamatan yang ditampilkan" }: {
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
        <p className="mt-1 text-xs text-ink-muted">Sel H3 (~0,1 km²) · {provenance(summary.sources, summary.periods)}</p>
        {layer.kind === "glow" ? <>
            <div className="mt-2 h-3 rounded-field" style={{ background: `linear-gradient(to right, ${GLOW_RAMP.join(", ")})` }} aria-hidden="true" />
            <div className="mt-1 flex flex-col gap-1 text-xs"><span>Lebih sedikit</span><span>Lebih banyak, relatif di {zoneName}</span></div>
            <p className="mt-2 tabular-nums">Sel tertinggi: {span(summary.maxBounds, summary.max)} {layer.unit}</p>
            <p className="tabular-nums">Semua sel: {span(summary.totalBounds, summary.total)} {layer.unit}</p>
        </> : <RangeKey range={{ min: summary.min, max: summary.max }} format={layer.format} scope="di sel yang ditampilkan" />}
        <p className="mt-2 text-xs text-ink-muted">{summary.withValue} dari {summary.cells} sel memiliki nilai.</p>
    </>;
}

function CellStatus({ layer, summary, loading, error, zoneName }: {
    layer: CellLayer; summary: CellSummary | null; loading: boolean; error: string | null; zoneName: string;
}) {
    if (loading) return <p className="mt-1 text-xs" role="status">Memuat sel…</p>;
    if (error) return <p className="mt-1 text-xs" role="status">Heatmap tidak tersedia.</p>;
    if (!summary) return <p className="mt-1 text-xs">Belum ada nilai sel untuk kecamatan ini.</p>;
    return <CellKey layer={layer} summary={summary} zoneName={zoneName} />;
}

// Swatches mirror the summary fill and selected outline in zoneLayers.ts.
function SummaryKey() {
    return <ul className="mt-2 space-y-2 text-xs">
        <li className="flex items-center gap-2">
            <span className="h-3 w-4 shrink-0 rounded-xs border border-[#5F84B1]/60 bg-[#9ED9EB]/40" aria-hidden="true" />Kecamatan rekomendasi
        </li>
        <li className="flex items-center gap-2">
            <span className="h-3 w-4 shrink-0 rounded-xs border-2 border-[#006AD8] outline-[1.5px] outline-[#21297C]" aria-hidden="true" />Kecamatan dipilih
        </li>
    </ul>;
}

export default function MapLegend({ category, range, detailsByZone, visibleZoneIds, selectedZoneName,
    cellLayerOptions, activeCellLayer, cellSummary, cellsLoading, cellsError, onCellLayerChange, companyPointShown,
    educationMetric, onEducationMetricChange }: {
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
    educationMetric: EducationMetric;
    onEducationMetricChange: (metric: EducationMetric) => void;
}) {
    const config = getMapMetricConfig(category, educationMetric);
    const missingCount = visibleZoneIds.filter((id) => !detailsByZone[id]?.facts.some((fact) =>
        fact.metric === config.metric && fact.evidence_type !== "unavailable")).length;
    const { sources, periods, isSample } = summarizeFacts(visibleZoneIds.flatMap((id) =>
        detailsByZone[id]?.facts.filter((fact) => fact.metric === config.metric && fact.evidence_type !== "unavailable") ?? []));

    return (
        <div data-hci-region="legend" className="flex w-11 flex-col items-center gap-2 font-body">
            <button type="button" aria-label="Legenda" title="Legenda" className="btn btn-square btn-outline btn-neutral size-11 min-h-11 min-w-11 bg-base-100 p-0 [anchor-name:--map-legend] hover:bg-neutral" popoverTarget="map-legend">
                <List aria-hidden="true" className="size-4" />
            </button>
            {cellSummary?.isSample && <span role="status" aria-label="Heatmap contoh" title="Heatmap contoh" className="badge badge-neutral size-11 rounded-field px-0 text-center text-[10px] leading-3 whitespace-normal">
                <span aria-hidden="true">Data<br />contoh</span>
            </span>}
            {cellLayerOptions.length > 1 && <div className="join join-vertical w-fit" role="group" aria-label="Lapisan sel">
                {cellLayerOptions.map((layer) => <button key={layer.id} type="button" onClick={() => onCellLayerChange(layer.id)}
                    aria-pressed={activeCellLayer?.id === layer.id} title={layer.label}
                    className={`btn btn-sm btn-square join-item size-11 min-h-11 min-w-11 whitespace-normal px-0 py-1 text-center text-[10px] leading-3 ${activeCellLayer?.id === layer.id ? "btn-primary" : "btn-outline btn-neutral bg-base-100"}`}>
                    {layer.shortLabel}
                </button>)}
            </div>}
            <div id="map-legend" popover="auto" className="map-legend-popover dropdown dropdown-top dropdown-end inset-auto mb-2 max-h-[min(65dvh,32rem)] w-[min(18rem,calc(100vw-1.5rem))] overflow-y-auto overscroll-contain rounded-box border border-rule bg-base-100 p-4 text-sm text-ink shadow-overlay [position-anchor:--map-legend]">
                <h2 className="font-semibold">{config.label}</h2>
                {category === "education" && isSample && <span className="badge badge-neutral badge-sm mt-2">Data contoh</span>}
                {category === "education" && <fieldset className="mt-3" data-hci-region="education-metric">
                    <legend className="text-xs text-ink-muted">Metrik pendidikan</legend>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        {(Object.keys(educationMetrics) as EducationMetric[]).map((metric) => <label key={metric} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                            <input type="radio" name="education-metric" value={metric} className="radio radio-sm radio-primary"
                                checked={educationMetric === metric} onChange={() => onEducationMetricChange(metric)} />
                            {educationMetrics[metric].popupLabel}
                        </label>)}
                    </div>
                </fieldset>}
                {category === "summary" ? <SummaryKey /> : <>
                    <p className="mt-1 text-xs text-ink-muted">Warna kecamatan · {provenance(sources, periods)}</p>
                    {range ? <RangeKey range={range} format={config.format} /> : <p className="mt-3">Belum ada nilai kecamatan yang ditampilkan.</p>}
                    {category === "education" && <>
                        <p className="mt-2 text-xs text-ink-muted">{visibleZoneIds.length - missingCount} dari {visibleZoneIds.length} kecamatan memiliki data.</p>
                        {missingCount > 0 && <p className="mt-1 text-xs text-ink-muted">Tanpa warna: data belum tersedia.</p>}
                    </>}
                    {companyPointShown && selectedZoneName && <p className="mt-2 flex items-center gap-2 text-xs"><span className="size-3 shrink-0 rounded-full bg-ink/85" aria-hidden="true" />Perusahaan di {selectedZoneName}, ditampilkan di titik tengah kecamatan</p>}
                    {selectedZoneName && activeCellLayer && <div className="mt-3 border-t border-rule pt-3">
                        <p className="font-semibold">{selectedZoneName} · {activeCellLayer.label}</p>
                        <CellStatus layer={activeCellLayer} summary={cellSummary} loading={cellsLoading} error={cellsError} zoneName={selectedZoneName} />
                    </div>}
                </>}
            </div>
        </div>
    );
}
