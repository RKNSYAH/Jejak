import type { MapCategory, RegionFact } from "@/app/engine/types";

const number = (value: number) => value.toLocaleString("id-ID");
const rupiah = (value: number) => `Rp${number(value)}`;

export const mapCategories: Record<MapCategory, {
    label: string;
    panelLabel: string;
    popupLabel: string;
    metric: string | null;
    format: (value: number) => string;
}> = {
    summary: { label: "Displayed regions", panelLabel: "Ringkasan", popupLabel: "Wage-to-rent ratio", metric: null, format: (value) => `${number(value)}×` },
    employment: { label: "Company count (companies)", panelLabel: "Pekerjaan", popupLabel: "Companies", metric: "company_count", format: number },
    education: { label: "Universities (count)", panelLabel: "Pendidikan", popupLabel: "Universities", metric: "universities", format: number },
    housing: { label: "Median monthly rent (IDR)", panelLabel: "Hunian", popupLabel: "Median monthly rent", metric: "median_monthly_rent_idr", format: rupiah },
    mobility: { label: "Public transport stops (count)", panelLabel: "Mobilitas", popupLabel: "Public transport stops", metric: "public_transport_stops", format: number },
};

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
    if (fact.metric === "employment_rate") return `${number(fact.value * 100)}%`;
    if (fact.metric === "median_monthly_rent_idr" || fact.metric === "average_monthly_wage_idr") return `${rupiah(fact.value)}/month`;
    return `${number(fact.value)}${fact.unit === "stops_within_500m" ? " stops within 500 m" : ""}`;
}
