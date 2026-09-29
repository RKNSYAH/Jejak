import { isRecord } from "../lib/zoneGeometry";
import type { Precision } from "./lf01Contract";
import { sha256Hex } from "./scopes";

export type GeocodeResult = {
    latitude: number;
    longitude: number;
    precision: Precision;
    countryCode: string | null;
    // City, regency, and district names the geocoder reports, for tier fallback.
    placeNames: string[];
    state: string | null;
    // ISO 3166-2 province (e.g. ID-JK). Jakarta results carry no state field.
    provinceCode?: string | null;
};

export type GeocodeCache = {
    get(queryHash: string): Promise<{ result: GeocodeResult | null } | null>;
    put(queryHash: string, query: string, result: GeocodeResult | null): Promise<void>;
};

export type Geocoder = { geocode(query: string): Promise<GeocodeResult | null> };

export class GeocodeBudgetError extends Error {
    constructor() {
        super("Geocoding budget for this run is spent");
        this.name = "GeocodeBudgetError";
    }
}

export class GeocoderUnavailableError extends Error {
    constructor(message = "Geocoder is unavailable") {
        super(message);
        this.name = "GeocoderUnavailableError";
    }
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Nominatim addresstype → the evidence cache's geographic precision. In Indonesia
// Nominatim reports a kelurahan as village, a kecamatan as suburb, and a kota
// such as Jakarta Selatan as city_district, so city_district must stay city-level.
// Areas and stations are neighbourhood-level: they don't place a specific building.
const precisionByAddressType: Record<string, Precision> = {
    building: "building", house: "building", amenity: "building", office: "building", shop: "building",
    tourism: "building", leisure: "building", man_made: "building", craft: "building", healthcare: "building",
    road: "street", street: "street", highway: "street",
    neighbourhood: "neighborhood", quarter: "neighborhood", village: "neighborhood", hamlet: "neighborhood",
    residential: "neighborhood", commercial: "neighborhood", retail: "neighborhood", industrial: "neighborhood",
    city_block: "neighborhood", isolated_dwelling: "neighborhood", railway: "neighborhood",
    public_transport: "neighborhood", aeroway: "neighborhood",
    suburb: "district", district: "district", borough: "district", subdistrict: "district",
    city_district: "city", city: "city", town: "city", municipality: "city", county: "city",
    state_district: "region", state: "region", region: "region", province: "region",
};

export function normalizeGeocodeQuery(query: string): string {
    return query.replace(/\s+/g, " ").trim().slice(0, 300);
}

// Floor, unit, lot, house-number, RT/RW, and postal-code detail that Nominatim
// cannot match ("Satrio Tower Floor 26 Unit C-D ... Kav. C4", "RT.000 RW.000").
const addressNoise = [
    /\b(?:floor|fl\.|lantai|lt\.)\s*[\w-]+/gi,
    /\b(?:unit|suite|ruang)\s*[\w./-]+/gi,
    /\bL\d+[\w-]*/g,
    /\bkav(?:ling)?\.?\s*[\w./-]+/gi,
    /\bblok\s*[\w./-]+/gi,
    /\bno\.?\s*\d+[\w/-]*/gi,
    /\brt\.?\s*\d+/gi,
    /\brw\.?\s*\d+/gi,
    /\b\d{5}\b/g,
];
const cityPattern = /\b(?:jakarta(?:\s+(?:selatan|pusat|barat|timur|utara))?|tangerang(?:\s+selatan)?|bekasi|depok|bogor|bandung|surabaya|yogyakarta|semarang|medan|denpasar|makassar|batam|malang)\b/gi;
// "JI." is a common slip for "Jl."; OSM names streets in full ("Jalan ...").
const streetPattern = /\b(?:jalan|jln\.?|jl\.?|ji\.)\s*(.+?)(?=\s*(?:,|\s-\s|\s-$|\bno\b|\bnomor\b|\bkav|\bblok\b|\brt\b|\brw\b|\bkel(?:urahan)?\b|\bkec(?:amatan)?\b|\bkawasan\b|\d{5}|$))/i;
const kelurahanPattern = /\b(?:kelurahan|kel\.)\s*([^,\d]+?)(?=\s*(?:,|\bkec(?:amatan)?\b|\bkota\b|$))/i;
const kecamatanPattern = /\b(?:kecamatan|kec\.)\s*([^,\d]+?)(?=\s*(?:,|\bkota\b|$))/i;
const areaPattern = /\bkawasan\s+([^,\d]+?)(?=\s*(?:,|\bkel(?:urahan)?\b|\bkec(?:amatan)?\b|$))/i;

// One geocoder query and the finest precision a match on it may claim.
export type AddressQuery = { query: string; cap: Precision | null };

// Queries to try in order. Forms that resolved Jakarta offices live come first:
// "building, city", then kelurahan/kecamatan, street, and area names with the
// city, then the cleaned address, then the city alone. Each fallback caps the
// precision it can claim, so a city-only match never passes for a building.
export function addressQueries(buildingName: string | null, rawAddress: string | null): AddressQuery[] {
    const address = rawAddress?.trim() ?? "";
    // Addresses often already start with the building name; don't repeat it.
    const text = buildingName && !address.toLowerCase().includes(buildingName.toLowerCase())
        ? [buildingName, address].filter(Boolean).join(", ") : address || buildingName || "";
    const city = [...text.matchAll(cityPattern)].map((match) => match[0]).sort((left, right) => right.length - left.length)[0] ?? null;
    const withCity = (...parts: (string | null | undefined)[]) => [...parts, city].filter(Boolean).join(", ");
    const kelurahan = kelurahanPattern.exec(address)?.[1]?.trim();
    const kecamatan = kecamatanPattern.exec(address)?.[1]?.trim();
    const street = streetPattern.exec(address)?.[1]?.replace(cityPattern, " ").replace(/\s+/g, " ").trim();
    const area = areaPattern.exec(address)?.[1]?.trim();
    const cleaned = addressNoise.reduce((value, pattern) => value.replace(pattern, " "), text)
        .replace(/\b(?:kelurahan|kel\.|kecamatan|kec\.|kawasan)\s*/gi, "")
        .replace(/\s+-\s+|\s+-$/g, ", ")
        .replace(/(^|\s)\/+(?=\s|,|$)/g, " ")
        .split(",").map((segment) => segment.replace(/\s+/g, " ").trim()).filter(Boolean).join(", ");

    const queries: AddressQuery[] = [
        { query: buildingName ? withCity(buildingName) : "", cap: null },
        { query: kelurahan ? withCity(kelurahan, kecamatan) : "", cap: "neighborhood" },
        { query: kecamatan ? withCity(kecamatan) : "", cap: "district" },
        { query: street ? withCity(`Jalan ${street}`) : "", cap: "street" },
        { query: area ? withCity(area) : "", cap: "neighborhood" },
        { query: cleaned, cap: null },
        { query: city ?? "", cap: "city" },
    ];
    const seen = new Set<string>();
    return queries
        .map((item) => ({ ...item, query: normalizeGeocodeQuery(item.query) }))
        .filter((item) => {
            const key = item.query.toLowerCase();
            if (item.query.length < 3 || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

export type Viewbox = [number, number, number, number];

// The viewbox changes Nominatim's ranking, so it is part of the cache key.
export function geocodeQueryHash(query: string, viewbox: Viewbox | null = null): string {
    const bias = viewbox ? viewbox.map((value) => value.toFixed(2)).join(",") : "none";
    // v2: results parsed with the Indonesian precision mapping and a province code.
    return sha256Hex(`nominatim-v2|id|${bias}|${normalizeGeocodeQuery(query).toLowerCase()}`);
}

export function parseNominatimResult(item: unknown): GeocodeResult | null {
    if (!isRecord(item)) return null;
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    const address = isRecord(item.address) ? item.address : {};
    const kind = typeof item.addresstype === "string" ? item.addresstype : typeof item.category === "string" ? item.category : "";
    const names = ["city", "town", "municipality", "county", "city_district", "suburb", "state_district"]
        .map((key) => address[key])
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
    return {
        latitude,
        longitude,
        precision: precisionByAddressType[kind] ?? "unknown",
        countryCode: typeof address.country_code === "string" ? address.country_code.toLowerCase() : null,
        placeNames: names,
        state: typeof address.state === "string" ? address.state : null,
        provinceCode: typeof address["ISO3166-2-lvl4"] === "string" ? address["ISO3166-2-lvl4"] : null,
    };
}

// Nominatim allows one request per second per application; reserve slots across
// every run in this process, not only within one run.
let nextRequestAt = 0;

async function takeSlot(spacingMs: number, wait: (ms: number) => Promise<void>) {
    const now = Date.now();
    const slot = Math.max(now, nextRequestAt);
    nextRequestAt = slot + spacingMs;
    if (slot > now) await wait(slot - now);
}

export type NominatimOptions = {
    userAgent: string;
    cache: GeocodeCache;
    // [west, south, east, north] around the zone: preferred, not enforced, so an
    // address in another city still resolves there.
    viewbox?: Viewbox | null;
    maxLookups?: number;
    spacingMs?: number;
    fetchImpl?: typeof fetch;
    wait?: (ms: number) => Promise<void>;
};

// One geocoder per enrichment run: maxLookups bounds uncached provider calls.
export function createNominatimGeocoder(options: NominatimOptions): Geocoder {
    const { userAgent, cache, viewbox = null, maxLookups = 60, spacingMs = 1100, fetchImpl = fetch } = options;
    const wait = options.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const memo = new Map<string, Promise<GeocodeResult | null>>();
    let lookups = 0;

    async function lookup(query: string, queryHash: string): Promise<GeocodeResult | null> {
        const cached = await cache.get(queryHash);
        if (cached) return cached.result;
        if (lookups >= maxLookups) throw new GeocodeBudgetError();
        lookups += 1;
        await takeSlot(spacingMs, wait);

        const url = new URL(NOMINATIM_URL);
        url.search = new URLSearchParams({
            q: query, format: "jsonv2", countrycodes: "id", addressdetails: "1", limit: "1",
            ...(viewbox ? { viewbox: viewbox.join(","), bounded: "0" } : {}),
        }).toString();
        let response: Response;
        try {
            response = await fetchImpl(url, {
                headers: { "User-Agent": userAgent, "Accept-Language": "id,en" },
                signal: AbortSignal.timeout(10_000),
            });
        } catch {
            throw new GeocoderUnavailableError("Could not reach the geocoder");
        }
        if (!response.ok) throw new GeocoderUnavailableError(`Geocoder returned HTTP ${response.status}`);
        const body: unknown = await response.json().catch(() => null);
        if (!Array.isArray(body)) throw new GeocoderUnavailableError("Geocoder returned an invalid response");

        const result = parseNominatimResult(body[0]);
        await cache.put(queryHash, query, result);
        return result;
    }

    return {
        geocode(rawQuery: string) {
            const query = normalizeGeocodeQuery(rawQuery);
            const queryHash = geocodeQueryHash(query, viewbox);
            let pending = memo.get(queryHash);
            if (!pending) {
                pending = lookup(query, queryHash);
                memo.set(queryHash, pending);
            }
            return pending;
        },
    };
}
