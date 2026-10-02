import type { LiveOnboardingPreview } from "./types";

// Missing evidence is not a failed budget check. Only known exclusions are hidden.
export function visiblePreviewDistricts(
    preview: Pick<LiveOnboardingPreview, "districts" | "preferences">,
    applyLimits = true,
) {
    return applyLimits && preview.preferences.overBudget === "hide"
        ? preview.districts.filter((item) => item.eligible !== false)
        : preview.districts;
}
