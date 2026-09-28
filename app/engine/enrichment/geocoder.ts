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

// Nominatim addresstype → the evidence cache's geographic precision.
const precisionByAddressType: Record<string, Precision> = {
    building: "building", house: "building", amenity: "building", office: "building", shop: "building",
    tourism: "building", leisure: "building", man_made: "building", craft: "building", healthcare: "building",
    road: "street", street: "street",
    neighbourhood: "neighborhood", quarter: "neighborhood", suburb: "neighborhood", village: "neighborhood",
    hamlet: "neighborhood", residential: "neighborhood", city_block: "neighborhood", isolated_dwelling: "neighborhood",
    city_district: "district", district: "district", borough: "district", subdistrict: "district",
    city: "city", town: "city", municipality: "city", county: "city",
    state_district: "region", state: "region", region: "region", province: "region",
};

export function normalizeGeocodeQuery(query: string): string {
    return query.replace(/\s+/g, " ").trim().slice(0, 300);
}

export type Viewbox = [number, number, number, number];

// The viewbox changes Nominatim's ranking, so it is part of the cache key.
export function geocodeQueryHash(query: string, viewbox: Viewbox | null = null): string {
    const bias = viewbox ? viewbox.map((value) => value.toFixed(2)).join(",") : "none";
    return sha256Hex(`nominatim|id|${bias}|${normalizeGeocodeQuery(query).toLowerCase()}`);
}

export function parseNominatimResult(item: unknown): GeocodeResult | null {
    if (!isRecord(item)) return null;
    const latitude = Number(item.lat);
    const longitude = Number(item.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    const address = isRecord(item.address) ? item.address : {};
    const kind = typeof item.addresstype === "string" ? item.addresstype : typeof item.category === "string" ? item.category : "";
    const names = ["city", "town", "municipality", "county", "city_district", "state_district"]
        .map((key) => address[key])
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
    return {
        latitude,
        longitude,
        precision: precisionByAddressType[kind] ?? "unknown",
        countryCode: typeof address.country_code === "string" ? address.country_code.toLowerCase() : null,
        placeNames: names,
        state: typeof address.state === "string" ? address.state : null,
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
    const { userAgent, cache, viewbox = null, maxLookups = 40, spacingMs = 1100, fetchImpl = fetch } = options;
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
