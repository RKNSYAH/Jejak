// Observed counts cover the web sources Jejak monitored, not every company, job, or
// listing in an area, so they are never shown as exact totals: "sekitar 3 lowongan".
// No server-only imports, so the frontend can label snapshot counts the same way.
const nouns: Record<string, string> = {
    office_presence: "kantor",
    active_opening: "lowongan",
    salary_observation: "laporan gaji",
    local_employment: "laporan jumlah karyawan",
    kos_listing: "iklan kos",
    apartment_listing: "iklan apartemen",
    house_listing: "iklan rumah",
    observation: "pengamatan",
};

export function approxCount(count: number, noun: string): string {
    return `sekitar ${count} ${noun}`;
}

export function approxEvidenceLabel(evidenceType: string, count: number): string {
    return approxCount(count, nouns[evidenceType] ?? "data");
}
