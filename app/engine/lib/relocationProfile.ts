import { onboardingTaxonomy } from "../extractUserProfile";
import { validateLF05Proposal, type LF05ProposedProfile } from "./lf05Validation";

export const RELOCATION_PROFILE_NAME = "primary";
export const RELOCATION_PROFILE_SCHEMA_VERSION = "relocation-profile-v1" as const;

export type PersistedRelocationProfile = {
  schema_version: typeof RELOCATION_PROFILE_SCHEMA_VERSION;
  hard_constraints: Record<string, unknown>;
  soft_preferences: Record<string, unknown>;
  priority_weights: Record<string, number>;
  taxonomy_version: string;
  contract_version: LF05ProposedProfile["contract_version"];
};

export type StoredRelocationProfile = {
  id: string;
  profile_name: string;
  revision: number;
  profile: PersistedRelocationProfile;
  confirmed_at: string;
  updated_at: string;
};

export function buildPersistedRelocationProfile(
  proposalValue: unknown,
  confirmedFieldsValue: unknown,
): PersistedRelocationProfile {
  const proposal = validateLF05Proposal(proposalValue, onboardingTaxonomy);
  if (
    !Array.isArray(confirmedFieldsValue) ||
    confirmedFieldsValue.length > proposal.inferred_fields.length ||
    confirmedFieldsValue.some((field) => typeof field !== "string")
  ) {
    throw new Error("INVALID_PROFILE_CONFIRMATION");
  }

  const confirmedFields = new Set(confirmedFieldsValue as string[]);
  if (
    confirmedFields.size !== confirmedFieldsValue.length ||
    confirmedFields.size !== proposal.inferred_fields.length ||
    proposal.inferred_fields.some((field) => !confirmedFields.has(field))
  ) {
    throw new Error("PROFILE_CONFIRMATION_REQUIRED");
  }

  return {
    schema_version: RELOCATION_PROFILE_SCHEMA_VERSION,
    hard_constraints: { ...proposal.hard_constraints },
    soft_preferences: { ...proposal.soft_preferences },
    priority_weights: { ...proposal.priority_weights },
    taxonomy_version: proposal.taxonomy_version,
    contract_version: proposal.contract_version,
  };
}
