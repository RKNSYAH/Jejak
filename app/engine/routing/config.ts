import "server-only";
import type { RouteProvenance } from "./types";

export type RoutingConfig = {
    roadUrl: string | null;
    transitUrl: string | null;
    osmSha256: string | null;
    gtfsSha256: string | null;
    osmDate: string | null;
    gtfsDate: string | null;
};

function endpoint(raw: string | undefined): string | null {
    try {
        const url = new URL(raw ?? "");
        return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash
            ? url.href.replace(/\/$/, "") : null;
    } catch { return null; }
}

export function getRoutingConfig(): RoutingConfig {
    const digest = (value: string | undefined) => value && /^[a-f0-9]{64}$/i.test(value) ? value.toLowerCase() : null;
    const date = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) &&
        new Date(value).toISOString().slice(0, 10) === value ? value : null;
    return {
        roadUrl: endpoint(process.env.JEJAK_VALHALLA_URL),
        transitUrl: endpoint(process.env.JEJAK_OTP_URL),
        osmSha256: digest(process.env.JEJAK_ROUTING_OSM_SHA256),
        gtfsSha256: digest(process.env.JEJAK_ROUTING_GTFS_SHA256),
        osmDate: date(process.env.JEJAK_ROUTING_OSM_DATE), gtfsDate: date(process.env.JEJAK_ROUTING_GTFS_DATE),
    };
}

export function routeProvenance(config: RoutingConfig, transit: boolean): RouteProvenance | null {
    if (!config.osmSha256 || (transit && !config.gtfsSha256)) return null;
    const snapshotDate = transit ? config.gtfsDate : config.osmDate;
    const ageDays = snapshotDate ? (Date.now() - Date.parse(snapshotDate)) / 86_400_000 : null;
    return {
        engine: transit ? "OpenTripPlanner" : "Valhalla",
        engineVersion: transit ? "2.10.0" : "3.9.0",
        osmSha256: config.osmSha256, gtfsSha256: transit ? config.gtfsSha256 : null,
        sources: [{ name: "OpenStreetMap / Geofabrik", url: "https://download.geofabrik.de/asia/indonesia/java.html" },
            ...(transit ? [{ name: "TransJakarta GTFS", url: "https://gtfs.transjakarta.co.id/files/file_gtfs.zip" }] : [])],
        snapshotDate,
        freshness: ageDays === null || ageDays < 0 ? "unknown" : ageDays > (transit ? 30 : 90) ? "stale" : "recent",
        timing: transit ? "scheduled_frequency" : "road_model",
        liveTraffic: false, liveTransit: false, operator: transit ? "TransJakarta" : null,
    };
}
