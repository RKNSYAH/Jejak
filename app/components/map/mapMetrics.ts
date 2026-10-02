import type { MapCategory, RegionFact } from "@/app/engine/types";
import { approxCount } from "@/app/engine/enrichment/labels";

const number = (value: number) => value.toLocaleString("id-ID");
const rupiah = (value: number) => `Rp${number(value)}`;

export function rentSharePercent(wageToRentRatio: number | null): number | null {
    if (wageToRentRatio === null || !Number.isFinite(wageToRentRatio) || wageToRentRatio <= 0) return null;
    return Math.round(100 / wageToRentRatio);
}

export const mapCategories: Record<MapCategory, {
    label: string;
    panelLabel: string;
    popupLabel: string;
    metric: string | null;
    format: (value: number) => string;
}> = {
    summary: { label: "Kecamatan yang ditampilkan", panelLabel: "Ringkasan", popupLabel: "Sewa", metric: null, format: (value) => `${number(value)}%` },
    employment: { label: "Jumlah perusahaan", panelLabel: "Pekerjaan", popupLabel: "Perusahaan", metric: "company_count", format: number },
    education: { label: "Jumlah universitas", panelLabel: "Pendidikan", popupLabel: "Universitas", metric: "universities", format: number },
    housing: { label: "Median sewa bulanan", panelLabel: "Hunian", popupLabel: "Median sewa bulanan", metric: "median_monthly_rent_idr", format: rupiah },
    mobility: { label: "Jumlah halte transportasi umum", panelLabel: "Mobilitas", popupLabel: "Halte transportasi umum", metric: "public_transport_stops", format: number },
};

// Per-cell layers shown inside the selected district. A glow suits counts that
// add up across nearby cells; a median (rent) is a value per cell and is filled.
export type CellLayer = {
    id: string;
    kind: "glow" | "fill";
    label: string;
    shortLabel: string;
    metric: string;
    unit: string;
    format: (value: number) => string;
    bounds?: { low: string; high: string };
    hiddenNote?: string;
};

export const cellLayers: Partial<Record<MapCategory, CellLayer[]>> = {
    employment: [{
        id: "workers", kind: "glow", label: "Estimated office workers", shortLabel: "Workers",
        metric: "estimated_office_workers", unit: "workers", format: number,
        bounds: { low: "estimated_office_workers_low", high: "estimated_office_workers_high" },
        hiddenNote: "Cells estimated from fewer than 3 buildings are hidden.",
    }],
    housing: [{
        id: "rent", kind: "fill", label: "Median monthly rent", shortLabel: "Median rent",
        metric: "median_monthly_rent_idr", unit: "IDR/month", format: rupiah,
        hiddenNote: "Cells with fewer than 3 listings are left blank.",
    }, {
        id: "listings", kind: "glow", label: "Rental listings", shortLabel: "Listings",
        metric: "housing_listing_count", unit: "listings", format: number,
    }],
};

export function cellMetrics(category: MapCategory): string[] {
    return [...new Set((cellLayers[category] ?? []).flatMap((layer) =>
        [layer.metric, ...(layer.bounds ? [layer.bounds.low, layer.bounds.high] : [])]))];
}

export const metricLabels: Record<string, string> = {
    population: "Population",
    employment_rate: "Employment rate",
    average_monthly_wage_idr: "Average monthly wage",
    company_count: "Companies",
    universities: "Universities",
    schools: "Schools",
    median_monthly_rent_idr: "Median monthly rent",
    housing_price_index: "Housing price index",
    public_transport_stops: "Public transport stops",
    transit_access: "Transit access",
};

export function formatFactValue(fact: RegionFact): string {
    if (fact.approximate && fact.metric === "company_count") return approxCount(fact.value, "company", "companies");
    if (fact.approximate) return `approx. ${formatFactValue({ ...fact, approximate: false })}`;
    if (fact.metric === "employment_rate") return `${number(fact.value * 100)}%`;
    if (fact.metric === "median_monthly_rent_idr" || fact.metric === "average_monthly_wage_idr") return `${rupiah(fact.value)}/month`;
    return `${number(fact.value)}${fact.unit === "stops_within_500m" ? " stops within 500 m" : ""}`;
}
