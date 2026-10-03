import "server-only";
import { getRoutingConfig, routeProvenance, type RoutingConfig } from "../routing/config";
import { RoutingFailure } from "../routing/http";
import { summarizeJourneys, meetingTravelCost } from "../routing/estimates";
import { roadGeometry, roadMatrix, roadReach } from "../routing/valhalla";
import { transitJourney } from "../routing/otp";
import { routingRegion } from "../routing/validation";
import type { CommuteRequest, CommuteResponse, RouteStatus, SampleJourney } from "../routing/types";

const unavailableSample = (origin: SampleJourney["origin"], status: RouteStatus): SampleJourney => ({
    origin, status, seconds: null, networkSeconds: null, overheadSeconds: 0, distanceMeters: null, costIdr: null,
});

export async function getCommuteEstimates(request: CommuteRequest, clientSignal?: AbortSignal,
    config: RoutingConfig = getRoutingConfig()): Promise<CommuteResponse> {
    const transit = request.mode === "transit";
    const provenance = routeProvenance(config, transit);
    const destinationRegion = routingRegion(request.destination);
    const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(clientSignal ? [clientSignal] : [])]);
    const response: CommuteResponse = {
        destination: request.destination, mode: request.mode, departureAt: transit ? request.departureAt : null,
        estimates: [], reach: null, reachStatus: "unavailable", provenance, meeting: null,
        warnings: transit ? ["transjakarta_only", "frequency_wait_estimated", "no_live_transit", "fare_unavailable"]
            : ["no_live_traffic", "endpoint_allowance", "fare_unavailable"],
    };
    const endpoint = transit ? config.transitUrl : config.roadUrl;
    const version = `${provenance?.engineVersion}:${config.osmSha256}:${transit ? config.gtfsSha256 : ""}`;
    const statusFor = (point: SampleJourney["origin"]): RouteStatus | null => {
        if (!destinationRegion || routingRegion(point) !== destinationRegion || (transit && destinationRegion !== "jakarta")) return "outside_coverage";
        if (transit && !request.departureAt) return "departure_required";
        if (!endpoint || !provenance) return "unavailable";
        return null;
    };
    const points = request.origins.flatMap((group) => group.points);
    const samples = points.map((point) => unavailableSample(point, statusFor(point) ?? "unavailable"));
    const validIndices = points.flatMap((point, index) => statusFor(point) === null ? [index] : []);
    const geometries = new Map<number, Awaited<ReturnType<typeof roadGeometry>>>();

    if (transit && endpoint && request.departureAt) {
        // Three workers, a single total deadline. Never fan out hundreds of OTP calls at once.
        let cursor = 0;
        await Promise.all(Array.from({ length: 3 }, async () => {
            while (cursor < validIndices.length && !signal.aborted) {
                const index = validIndices[cursor++];
                try {
                    const result = await transitJourney(endpoint, version, points[index], request.destination, request.departureAt!, signal);
                    samples[index] = result.journey;
                    if (result.geometry) geometries.set(index, result.geometry);
                } catch (cause) {
                    samples[index] = unavailableSample(points[index], cause instanceof RoutingFailure ? cause.reason : "unavailable");
                }
            }
        }));
        // Transit reach stays sampled points, not a fabricated circular/polygon guarantee.
        response.warnings.push("transit_reach_samples_only");
    } else if (request.mode !== "transit" && endpoint) {
        for (let start = 0; start < validIndices.length && !signal.aborted; start += 50) {
            const indices = validIndices.slice(start, start + 50);
            try {
                const result = await roadMatrix(endpoint, version, indices.map((index) => points[index]), request.destination, request.mode, signal);
                indices.forEach((index, position) => { samples[index] = result[position]; });
            } catch (cause) {
                // A batch-level no-path error is not proof EVERY source is unreachable.
                indices.forEach((index) => { samples[index] = unavailableSample(points[index], "unavailable"); });
                if (cause instanceof RoutingFailure && cause.reason === "no_route") response.warnings.push("matrix_failed");
            }
        }
    }
    let offset = 0;
    response.estimates = request.origins.map((group) => {
        const index = offset;
        offset += group.points.length;
        const estimate = summarizeJourneys(group.id, samples.slice(index, offset));
        if (group.id === request.selectedOriginId) {
            const representative = samples.findIndex((sample, position) => position >= index && position < offset && sample.status === "ok");
            estimate.geometry = representative < 0 ? null : geometries.get(representative) ?? null;
        }
        return estimate;
    });
    if (request.purpose === "meeting") {
        response.meeting = { travelerIds: [request.origins[0].id, request.origins[1].id],
            ...meetingTravelCost([response.estimates[0].samples[0], response.estimates[1].samples[0]]) };
    }
    if (request.mode !== "transit" && endpoint && provenance && destinationRegion && validIndices.length && !signal.aborted) {
        const selected = response.estimates.find((item) => item.id === request.selectedOriginId);
        const origin = selected?.samples.find((sample) => sample.status === "ok")?.origin;
        if (selected && origin) {
            try { selected.geometry = await roadGeometry(endpoint, version, origin, request.destination, request.mode, signal); }
            catch { response.warnings.push("route_geometry_unavailable"); }
        }
        if (request.includeReach && !signal.aborted) {
            try {
                response.reach = await roadReach(endpoint, version, request.destination, request.mode, request.maxMinutes, signal);
                response.reachStatus = response.reach ? "ok" : "no_route";
            } catch { response.warnings.push("reach_unavailable"); }
        }
    }
    if (signal.aborted) response.warnings.push("routing_deadline");
    return response;
}
