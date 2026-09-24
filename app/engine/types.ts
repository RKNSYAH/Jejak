
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

export type ZoneSectorSnapshot = {
  zone_id: string;
  sector_id: string;
  snapshot_at: string;
  observed_organizations: number;
  verified_offices: number;
  active_openings: number;
  local_headcount?: {
    minimum: number;
    maximum: number;
    status: "estimated";
    method_version: string;
  };
  indices: {
    sector_presence: number;
    hiring_activity: number;
    employer_diversity: number;
  };
  evidence: {
    sources_monitored: number;
    organizations_without_headcount: number;
    oldest_material_evidence: string;
    confidence: number;
    confidence_label: "high" | "medium" | "low" | "insufficient";
  };
};

export type ZoneIntelligenceResponse = {
  snapshot: ZoneSectorSnapshot;
  freshness: "fresh" | "stale";
  coverage: "complete" | "partial";
  refresh: {
    status: "unavailable" | "queued" | "running" | "partial" | "completed" | "failed";
    run_id: string | null;
  };
};

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
  intelligence: ZoneIntelligenceResponse | null;
};

export type ZoneListResponse = {
  is_sample: boolean;
  zones: ZoneSummary[];
};

export type ZoneIntelligenceResult = {
  is_sample: boolean;
  intelligence: ZoneIntelligenceResponse | null;
};

export type ZoneMetric = "sector_presence" | "hiring_activity";

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

