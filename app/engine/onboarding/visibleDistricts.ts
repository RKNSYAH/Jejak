import type { LiveOnboardingPreview } from "./types";

const position = (item: { rank: number | null }) => item.rank ?? Number.MAX_SAFE_INTEGER;

// Missing evidence is not a failed budget check. Only known exclusions are hidden.
// With limits applied the list reads best fit first; unranked districts keep their order after the ranked ones.
export function visiblePreviewDistricts(
    preview: Pick<LiveOnboardingPreview, "districts" | "preferences">,
    applyLimits = true,
) {
    if (!applyLimits) return preview.districts;
    const districts = preview.preferences.overBudget === "hide"
        ? preview.districts.filter((item) => item.eligible !== false)
        : preview.districts;
    return [...districts].sort((a, b) => position(a) - position(b));
}
