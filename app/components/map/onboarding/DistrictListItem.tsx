import { formatRupiah } from "@/app/engine/onboarding/demoData";
import { hasHousingStatistics } from "@/app/engine/onboarding/livePreview";
import type { FormStep, LiveDistrictRecommendation } from "@/app/engine/onboarding/types";
import { commuteEstimateLabel } from "@/app/engine/routing/labels";
import { planningReachLabel } from "@/app/engine/onboarding/planningReach";

export default function DistrictListItem({ item, step, selected, onSelect }: {
    item: LiveDistrictRecommendation; step: FormStep; selected: boolean; onSelect: () => void;
}) {
    const housingAvailable = hasHousingStatistics(item);
    const rent = item.rent === null ? "Sewa belum tersedia" : `Rata-rata sewa Rp${formatRupiah(item.rent)}/bulan`;

    return <li>
        <button type="button" aria-pressed={selected} aria-disabled={!housingAvailable} onClick={housingAvailable ? onSelect : undefined}
            className="btn btn-ghost h-auto min-h-11 w-full flex-col items-start justify-center whitespace-normal rounded-lg px-2 py-2 text-left leading-relaxed">
        <span className="block font-semibold">{step >= 2 && item.rank ? `${item.rank}. ` : ""}{item.district.zone_name}</span>
        {(step >= 2 || !housingAvailable) && <span className="block leading-relaxed text-ink-muted">
            {rent}
        </span>}

        {step >= 3 && (
            <div className="flex flex-col items-start gap-0">
                {commuteEstimateLabel(item.commuteEstimate) && (
                    <span className="block text-sm text-ink-muted leading-tight">
                        {commuteEstimateLabel(item.commuteEstimate)}
                    </span>
                )}
                {item.reachBand !== "unknown" && (
                    <span className="block text-xs text-ink-muted leading-tight">
                        {planningReachLabel(item.reachBand)}
                    </span>
                )}
            </div>
        )}
        </button>
    </li>;
}
