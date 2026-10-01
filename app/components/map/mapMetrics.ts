import type { MapCategory, RegionFact } from "@/app/engine/types";
import { approxCount } from "@/app/engine/enrichment/labels";

const number = (value: number) => value.toLocaleString("id-ID");
const rupiah = (value: number) => `Rp${number(value)}`;

export const mapCategories: Record<MapCategory, {
    label: string;
    panelLabel: string;
    popupLabel: string;
    metric: string | null;
    format: (value: number) => string;
}> = {
    summary: { label: "Kecamatan yang ditampilkan", panelLabel: "Ringkasan", popupLabel: "Rasio upah terhadap sewa", metric: null, format: (value) => `${number(value)}×` },
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
};

export const cellLayers: Partial<Record<MapCategory, CellLayer[]>> = {
    employment: [{
        id: "workers", kind: "glow", label: "Perkiraan pekerja kantor", shortLabel: "Pekerja",
        metric: "estimated_office_workers", unit: "pekerja", format: number,
        bounds: { low: "estimated_office_workers_low", high: "estimated_office_workers_high" },
    }],
    housing: [{
        id: "rent", kind: "fill", label: "Median sewa bulanan", shortLabel: "Median sewa",
        metric: "median_monthly_rent_idr", unit: "per bulan", format: rupiah,
    }, {
        id: "listings", kind: "glow", label: "Iklan sewa", shortLabel: "Iklan",
        metric: "housing_listing_count", unit: "iklan", format: number,
    }],
};

export function cellMetrics(category: MapCategory): string[] {
    return [...new Set((cellLayers[category] ?? []).flatMap((layer) =>
        [layer.metric, ...(layer.bounds ? [layer.bounds.low, layer.bounds.high] : [])]))];
}

export const metricLabels: Record<string, string> = {
    population: "Populasi",
    employment_rate: "Tingkat kesempatan kerja",
    average_monthly_wage_idr: "Rata-rata upah bulanan",
    company_count: "Perusahaan",
    universities: "Universitas",
    schools: "Sekolah",
    median_monthly_rent_idr: "Median sewa bulanan",
    housing_price_index: "Indeks harga hunian",
    public_transport_stops: "Halte transportasi umum",
    transit_access: "Akses transit",
};

export function formatFactValue(fact: RegionFact): string {
    if (fact.approximate && fact.metric === "company_count") return approxCount(fact.value, "perusahaan");
    if (fact.approximate) return `sekitar ${formatFactValue({ ...fact, approximate: false })}`;
    if (fact.metric === "employment_rate") return `${number(fact.value * 100)}%`;
    if (fact.metric === "median_monthly_rent_idr" || fact.metric === "average_monthly_wage_idr") return `${rupiah(fact.value)}/bulan`;
    return `${number(fact.value)}${fact.unit === "stops_within_500m" ? " halte dalam 500 m" : ""}`;
}
