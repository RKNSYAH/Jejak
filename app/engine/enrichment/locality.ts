import type { GeocodeResult } from "./geocoder";
import type { Precision } from "./lf01Contract";

export type LocalityTier = "zone" | "city" | "region" | "national";

const precisionRank: Record<Precision, number> = {
    building: 0, street: 1, neighborhood: 2, district: 3, city: 4, region: 5, unknown: 6,
};

export function coarserPrecision(left: Precision, right: Precision): Precision {
    return precisionRank[left] >= precisionRank[right] ? left : right;
}

export function normalizePlaceName(name: string): string {
    return name.toLowerCase()
        .replace(/^(kota administrasi|kota adm\.|kota|kabupaten administrasi|kabupaten|kab\.)\s+/, "")
        .replace(/\s+/g, " ")
        .trim();
}

type LocalityInput = {
    // Precision LF-01 read from the source; "unknown" defers to the geocoder.
    statedPrecision: Precision;
    geocode: GeocodeResult;
    // Tier from trusted district boundaries, or null when no boundary covers the point.
    boundaryTier: LocalityTier | null;
    cityName: string;
    // The zone's province (ISO 3166-2 code, or state name) for the region tier.
    zoneRegion: string | null;
    // Finest precision the matched query may claim (a city-only fallback caps at city).
    capPrecision?: Precision | null;
};

// Jakarta results carry the province only as an ISO 3166-2 code, not a state name.
export function regionKey(geocode: GeocodeResult): string | null {
    return geocode.provinceCode ?? geocode.state;
}

// A source that only names a city never becomes a zone-level point, whatever
// district the geocoder's city centroid happens to fall in.
export function resolveLocality(input: LocalityInput): { precision: Precision; tier: LocalityTier } | { reason: string } {
    const { geocode } = input;
    if (geocode.countryCode && geocode.countryCode !== "id") return { reason: "outside_indonesia" };

    let precision = input.statedPrecision === "unknown"
        ? geocode.precision
        : coarserPrecision(input.statedPrecision, geocode.precision);
    if (input.capPrecision) precision = coarserPrecision(precision, input.capPrecision);
    if (precision === "unknown") return { reason: "imprecise_location" };

    let tier = input.boundaryTier;
    if (!tier) {
        const city = normalizePlaceName(input.cityName);
        if (geocode.placeNames.some((name) => normalizePlaceName(name) === city)) tier = "city";
        else if (input.zoneRegion && regionKey(geocode)?.toLowerCase() === input.zoneRegion.toLowerCase()) tier = "region";
        else tier = "national";
    }
    if (precision === "region" && (tier === "zone" || tier === "city")) tier = "region";
    else if (precision === "city" && tier === "zone") tier = "city";
    return { precision, tier };
}
