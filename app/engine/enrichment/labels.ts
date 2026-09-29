// Observed counts cover the web sources Jejak monitored, not every company, job, or
// listing in an area, so they are never shown as exact totals: "approx. 3 openings".
// No server-only imports, so the frontend can label snapshot counts the same way.
const nouns: Record<string, [string, string]> = {
    office_presence: ["office", "offices"],
    active_opening: ["opening", "openings"],
    salary_observation: ["salary report", "salary reports"],
    local_employment: ["headcount report", "headcount reports"],
    kos_listing: ["kos listing", "kos listings"],
    apartment_listing: ["apartment listing", "apartment listings"],
    house_listing: ["house listing", "house listings"],
    observation: ["observation", "observations"],
};

export function approxCount(count: number, singular: string, plural: string): string {
    return `approx. ${count} ${count === 1 ? singular : plural}`;
}

export function approxEvidenceLabel(evidenceType: string, count: number): string {
    const [singular, plural] = nouns[evidenceType] ?? ["item", "items"];
    return approxCount(count, singular, plural);
}
