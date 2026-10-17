import type { LiveOnboardingPreview } from "./types";

const position = (item: { rank: number | null }) => item.rank ?? Number.MAX_SAFE_INTEGER;

// Keep trade-offs visible; put ranked districts first when the view is sorted.
export function visiblePreviewDistricts(
    preview: Pick<LiveOnboardingPreview, "districts" | "preferences">,
    sortByRank = true,
) {
    if (!sortByRank) return preview.districts;
    return [...preview.districts].sort((a, b) => position(a) - position(b));
}
