import { isRecord } from "../lib/zoneGeometry";

// The public snapshot JSON contract, shared by the server that builds snapshots and
// the browser that reads them. It has no server-only imports.
const countKeys = new Set([
    "observed_office_count", "observed_organizations", "offices_with_local_headcount_evidence",
    "organizations_without_headcount", "sources_monitored", "opening_count", "housing_count",
]);
const rangeKeys = new Set(["estimated_employment", "monthly_rent_idr", "salary_idr"]);

// Mirrors private.is_public_snapshot() so a contract violation fails in tests, not in Postgres.
export function isPublicSnapshot(payload: Record<string, unknown>): boolean {
    return Object.entries(payload).every(([key, value]) => {
        if (countKeys.has(key)) return typeof value === "number" && Number.isInteger(value) && value >= 0;
        if (rangeKeys.has(key)) {
            if (!isRecord(value) || Object.keys(value).some((field) => !["minimum", "maximum", "status", "method_version"].includes(field))) return false;
            if ("method_version" in value && (key !== "estimated_employment" || typeof value.method_version !== "string" ||
                !/^[a-z0-9][a-z0-9_-]{0,49}$/.test(value.method_version))) return false;
            if (value.status === "unavailable") return !("minimum" in value || "maximum" in value || "method_version" in value);
            return (value.status === "observed" || value.status === "estimated") &&
                typeof value.minimum === "number" && typeof value.maximum === "number" && value.minimum >= 0 && value.maximum >= value.minimum;
        }
        if (key === "limitations") return Array.isArray(value) && value.every((item) => typeof item === "string");
        if (key === "coverage") return value === "complete" || value === "partial" || value === "unavailable";
        if (key === "confidence") return typeof value === "number" && value >= 0 && value <= 1;
        if (key === "as_of" || key === "oldest_material_evidence") return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
        return false;
    });
}
