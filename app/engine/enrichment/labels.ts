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
