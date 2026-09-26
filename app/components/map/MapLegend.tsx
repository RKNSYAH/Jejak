import type { MapCategory, ZoneDetailResult } from "@/app/engine/types";
import { mapCategories } from "./mapMetrics";
import type { MetricRange } from "./zoneLayers";

function describeCoverage(values: string[], fallback: string, multiple: string): string {
    if (values.length === 0) return fallback;
    return values.length === 1 ? values[0] : multiple;
}

function RangeKey({ range, format }: { range: NonNullable<MetricRange>; format: (value: number) => string }) {
    if (range.min === range.max) {
        return <p className="mt-3 flex items-center gap-2 tabular-nums">
            <span className="size-3 rounded-sm bg-primary" aria-hidden="true" />
            {format(range.min)} in displayed zones
        </p>;
    }

    return <>
        <div className="mt-3 h-3 rounded-field [background:linear-gradient(to_right,#B5E1FB,#098DEC)]" aria-hidden="true" />
        <div className="mt-1 flex justify-between gap-2 tabular-nums">
            <span>{format(range.min)}</span><span>{format(range.max)}</span>
        </div>
    </>;
}

export default function MapLegend({ category, range, detailsByZone, visibleZoneIds }: {
    category: MapCategory;
    range: MetricRange;
    detailsByZone: Record<string, ZoneDetailResult>;
    visibleZoneIds: string[];
}) {
    const config = mapCategories[category];
    const facts = visibleZoneIds.flatMap((id) => detailsByZone[id]?.facts.filter((fact) => fact.metric === config.metric && fact.evidence_type !== "unavailable") ?? []);
    const sources = [...new Set(facts.map((fact) => fact.source))];
    const periods = [...new Set(facts.map((fact) => fact.period_end ?? "period unavailable"))];
    const hasSample = facts.some((fact) => fact.is_sample);

    return (
        <div data-hci-region="legend" className="font-body">
            <button type="button" className="btn btn-outline btn-neutral min-h-11 bg-base-100 [anchor-name:--map-legend] hover:bg-neutral" popoverTarget="map-legend">Legenda</button>
            <div id="map-legend" popover="auto" className="map-legend-popover dropdown dropdown-top inset-auto mb-2 w-72 rounded-box border border-rule bg-base-100 p-4 text-sm text-ink shadow-overlay [position-anchor:--map-legend]">
                <h2 className="font-semibold">{config.label}</h2>
                {category === "summary" ? <p className="mt-2">Light blue: ranked or opened region. Selected region has a darker outline.</p> : <>
                    <p className="mt-1 text-xs text-ink-muted">District (kecamatan) · {describeCoverage(sources, "Source unavailable", "Multiple sources")} · {describeCoverage(periods, "Period unavailable", "Multiple periods")}</p>
                    {range ? <RangeKey range={range} format={config.format} /> : <p className="mt-3">No supported values in displayed regions.</p>}
                    <p className="mt-2 text-xs text-ink-muted">Unfilled boundaries: data unavailable. Values include zero when observed. {hasSample ? "Sample values are illustrative, not verified. " : ""}See region details for sources and limitations.</p>
                </>}
            </div>
        </div>
    );
}
