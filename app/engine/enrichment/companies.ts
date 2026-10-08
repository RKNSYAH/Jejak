import type { ZoneEvidenceCandidate, Precision } from "./zoneEvidenceDiscoveryContract";
import { normalizePlaceName } from "./locality";

// Legal forms and parenthesised aliases vary between sources for one company:
// "PT. Radius Data Indonesia", "Radius Data", "YOKESEN (PT. Yokesen Teknologi)".
const legalForms = /\b(?:pt|cv|tbk|persero|perseroan terbatas|ltd|inc|corp|co)\b\.?/gi;

export function companyKey(name: string | null): string | null {
    if (!name) return null;
    const key = name.toLowerCase()
        .replace(/\(.*?\)/g, " ")
        .replace(legalForms, " ")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
    return key.length >= 2 ? key : null;
}

// "radius data" matches "radius data indonesia": every word of the shorter name
// appears in the longer one. A single short word is too ambiguous to match on.
export function sameCompany(left: string, right: string): boolean {
    if (left === right) return true;
    const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
    const words = shorter.split(" ").filter(Boolean);
    if (words.length < 2 && shorter.length < 5) return false;
    const longerWords = new Set(longer.split(" "));
    return words.every((word) => longerWords.has(word));
}

type CompanyOffice = {
    companyKey: string;
    rawAddress: string;
    buildingName: string | null;
    precision: Precision;
    sourceUrl: string;
};

// Discovered office addresses, grouped by company.
export function officesByCompany(candidates: ZoneEvidenceCandidate[]): Map<string, CompanyOffice[]> {
    const offices = new Map<string, CompanyOffice[]>();
    for (const candidate of candidates) {
        const key = companyKey(candidate.subjectName);
        if (candidate.claimType !== "office_location" || !key || !candidate.rawAddress) continue;
        const list = offices.get(key) ?? [];
        if (!list.some((office) => office.rawAddress === candidate.rawAddress)) {
            list.push({
                companyKey: key, rawAddress: candidate.rawAddress, buildingName: candidate.buildingName,
                precision: candidate.precision, sourceUrl: candidate.canonicalUrl,
            });
        }
        offices.set(key, list);
    }
    return offices;
}

export function officesFor(offices: Map<string, CompanyOffice[]>, key: string): CompanyOffice[] {
    const result: CompanyOffice[] = [];
    for (const [officeKey, list] of offices) if (sameCompany(officeKey, key)) result.push(...list);
    return result;
}

// A posting without a precise location borrows its company's office. A posting
// that names a city only takes an office in that city (a Bandung job never borrows
// the Jakarta head office). One that names nothing takes the office in the zone's
// city, else the company's only office; with several and no way to choose, none.
export function officeForPosting(offices: CompanyOffice[], postingAddress: string | null, zoneCity: string): CompanyOffice | null {
    const mentions = (office: CompanyOffice, city: string) => normalizePlaceName(office.rawAddress).includes(normalizePlaceName(city));
    const postingCity = postingAddress?.trim();
    if (postingCity) return offices.find((office) => mentions(office, postingCity)) ?? null;
    return offices.find((office) => mentions(office, zoneCity)) ?? (offices.length === 1 ? offices[0] : null);
}

// Postings whose own location can't place them below city level.
export function needsCompanyOffice(candidate: ZoneEvidenceCandidate): boolean {
    return (!candidate.rawAddress && !candidate.buildingName) || ["city", "region", "unknown"].includes(candidate.precision);
}
