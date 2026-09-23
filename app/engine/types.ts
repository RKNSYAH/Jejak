import { create } from 'zustand';

type ZoneSectorSnapshot = {
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
    status: "queued" | "running" | "partial" | "completed" | "failed";
    run_id: string;
  };
};

export type CityName =
  | "Jakarta Selatan"
  | "Jakarta Barat"
  | "Jakarta Pusat"
  | "Jakarta Timur"
  | "Jakarta Utara";

export type MissingEvidence =
  | "active_opening"
  | "office_presence"
  | "local_employment"
  | "kos_listing"
  | "apartment_listing"
  | "house_listing";

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

  zone_name: string;
  city_name: CityName;

  missing_evidence: MissingEvidence[];
  target_sectors: TargetSector[];

  needed_count: number;

  query?: string;
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

