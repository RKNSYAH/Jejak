import type { LF01Input, MissingEvidence } from "../types";
import { isRecord } from "./zoneGeometry";

const evidenceTypes: MissingEvidence[] = [
    "company_presence", "active_openings", "salary", "headcount",
    "news", "kos", "apartment", "house", "housing",
];

function readString(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a non-empty string`);
    return value;
}

function readStrings(value: unknown, name: string): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
    return value.map((item) => readString(item, name));
}

export function validateLF01Input(value: unknown): LF01Input {
    if (!isRecord(value)) throw new Error("Expected a JSON object");
    for (const key of Object.keys(value)) {
        if (key.startsWith("fixture") || key === "mode" || key === "cached_content_hashes") {
            throw new Error(`Rejected field: ${key}`);
        }
    }

    const requestedAt = readString(value.requested_at, "requested_at");
    const dateParts = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(requestedAt);
    if (!dateParts || !Number.isFinite(Date.parse(requestedAt))) {
        throw new Error("requested_at must be an ISO-8601 timestamp");
    }
    const [, year, month, day] = dateParts;
    const daysInMonth = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > daysInMonth) {
        throw new Error("requested_at contains an invalid calendar date");
    }

    const maximumSources = value.maximum_sources === undefined ? 10 : value.maximum_sources;
    if (typeof maximumSources !== "number" || !Number.isInteger(maximumSources) || maximumSources < 1 || maximumSources > 10) {
        throw new Error("maximum_sources must be an integer from 1 to 10");
    }
    const missingEvidence = readStrings(value.missing_evidence, "missing_evidence") ?? ["company_presence", "active_openings"];
    const validatedEvidence = missingEvidence.map((item) => {
        const evidence = evidenceTypes.find((type) => type === item);
        if (!evidence) throw new Error(`Unsupported missing_evidence: ${item}`);
        return evidence;
    });

    let boundingBox: LF01Input["bounding_box"];
    if (value.bounding_box !== undefined) {
        const box = value.bounding_box;
        if (!Array.isArray(box) || box.length !== 4 || box.some((n) => typeof n !== "number" || !Number.isFinite(n))) {
            throw new Error("bounding_box must contain four finite coordinates");
        }
        const [west, south, east, north] = box as number[];
        if (west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) {
            throw new Error("bounding_box must be [west, south, east, north]");
        }
        boundingBox = [west, south, east, north];
    }
    if (value.search_query !== undefined && typeof value.search_query !== "string") {
        throw new Error("search_query must be a string");
    }

    // Construct the outbound contract explicitly; UI-only fields never reach the flow.
    return {
        run_id: readString(value.run_id, "run_id"),
        zone_id: readString(value.zone_id, "zone_id"),
        zone_name: readString(value.zone_name, "zone_name"),
        city_name: readString(value.city_name, "city_name"),
        requested_at: requestedAt,
        maximum_sources: maximumSources,
        missing_evidence: validatedEvidence,
        bounding_box: boundingBox,
        target_sectors: readStrings(value.target_sectors, "target_sectors"),
        target_occupations: readStrings(value.target_occupations, "target_occupations"),
        existing_entity_ids: readStrings(value.existing_entity_ids, "existing_entity_ids"),
        search_query: value.search_query,
    };
}
