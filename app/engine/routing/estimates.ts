import type { CommuteEstimate, SampleJourney } from "./types";

export function summarizeJourneys(id: string, samples: SampleJourney[]): CommuteEstimate {
    const present = samples.flatMap((sample) => sample.status === "ok" && sample.seconds !== null ? [sample.seconds / 60] : []);
    return {
        id,
        status: present.length === samples.length ? "ok" : present.length ? "partial" : samples[0]?.status ?? "unavailable",
        samples,
        minutes: present.length ? { low: Math.ceil(Math.min(...present)), high: Math.ceil(Math.max(...present)) } : null,
        geometry: null,
    };
}

// Both travelers matter. No monetary total is invented when either fare is missing.
export function meetingTravelCost(travelers: [SampleJourney, SampleJourney]) {
    return {
        travelerSeconds: travelers.map((journey) => journey.seconds),
        totalSeconds: travelers.every((journey) => journey.status === "ok" && journey.seconds !== null)
            ? (travelers[0].seconds as number) + (travelers[1].seconds as number) : null,
        costIdr: null,
    };
}
