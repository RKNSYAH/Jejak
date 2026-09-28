
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type Zone = {
  zone_id: string;
  zone_name: string;
  city_id: string;
  city_name: string;
};

export type ZoneGeometry = FeatureCollection<Polygon | MultiPolygon, {
  zone_id: string;
  zone_name: string;
  source_region_code?: string;
}>;

export type ZoneSummary = Zone & {
  is_sample: boolean;
  average_monthly_wage_idr: number | null;
  median_monthly_rent_idr: number | null;
  population: number | null;
  wage_to_rent_ratio: number | null;
};

export type ZoneListResponse = {
  is_sample: boolean;
  zones: ZoneSummary[];
};

export type RegionFact = {
  metric: string;
  value: number;
  unit: string | null;
  source: string;
  source_url?: string | null;
  period_start?: string | null;
  period_end: string | null;
  confidence?: number | null;
  evidence_type: "observed" | "estimated" | "derived" | "unavailable";
  limitations: string | null;
  is_sample: boolean;
};

export type RegionPlace = {
  id: number;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  source: string;
  observed_at: string | null;
  is_sample: boolean;
};

export type ZoneDetailResult = {
  is_sample: boolean;
  facts: RegionFact[];
  places: RegionPlace[];
};

export type MapCategory = "summary" | "employment" | "education" | "housing" | "mobility";

export type MapCellFact = {
  value: number;
  unit: string | null;
  evidence_type: RegionFact["evidence_type"];
  period_end: string | null;
  source: string;
  // Buildings or listings behind the value; the database hides values below 3.
  sample_size: number | null;
  limitations: string | null;
  is_sample: boolean;
};

// One H3 cell of a district, with the facts requested for a map category.
export type MapCell = {
  cell_code: string;
  parent_code: string;
  geometry: Polygon | MultiPolygon;
  centroid: [number, number];
  facts: Record<string, MapCellFact>;
  is_sample: boolean;
};

export type MapCellsResponse = {
  is_sample: boolean;
  zone_id: string;
  category: MapCategory;
  cells: MapCell[];
};

export type CityName =
  | "Jakarta Selatan"
  | "Jakarta Barat"
  | "Jakarta Pusat"
  | "Jakarta Timur"
  | "Jakarta Utara";

export type MissingEvidence =
  | "company_presence" | "active_openings" | "salary" | "headcount"
  | "news" | "kos" | "apartment" | "house" | "housing";

export type TargetSector =
  | "software_and_it_services"
  | "telecommunications"
  | "financial_technology"
  | "data_and_analytics"
  | "digital_commerce"
  | "cybersecurity"
  | "technology_consulting";

export interface LF01Input {
  run_id: string;
  zone_id: string;
  requested_at: string;

  zone_name: string;
  city_name: string;

  missing_evidence: MissingEvidence[];
  target_sectors?: string[];

  maximum_sources: number;

  search_query?: string;
  bounding_box?: [number, number, number, number];
  target_occupations?: string[];
  existing_entity_ids?: string[];
}

export type HciClick = {
  elapsed_ms: number;
  region: string;
  target: string;
  x: number | null;
  y: number | null;
  viewport_width: number;
  viewport_height: number;
  paint_ms: number;
  // Click-specific work through its result frame; null if cancelled or timed out.
  response_ms: number | null;
};

export type HciClickBatch = {
  session_id: string;
  participant: string | null;
  clicks: HciClick[];
};

export type UserProfile = {
  target_sectors: TargetSector[];
  monthly_budget: number;
  maximum_rent: number;
  maximum_commute_minutes: number;
  priorities: {
    career: number;
    education: number;
    affordability: number;
    mobility: number;
  };
};
