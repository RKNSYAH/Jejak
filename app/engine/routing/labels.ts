import type { CommuteEstimate } from "./types";

export function commuteEstimateLabel(estimate: CommuteEstimate | null): string | null {
    if (!estimate?.minutes) return null;
    const { low, high } = estimate.minutes;
    return `Estimasi ${low === high ? low : `${low}–${high}`} mnt · ${estimate.samples.length} titik kecamatan${estimate.status === "partial" ? " · data sebagian" : ""}`;
}
