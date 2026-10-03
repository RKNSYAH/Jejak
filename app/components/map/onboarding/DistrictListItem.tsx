import { formatRupiah } from "@/app/engine/onboarding/demoData";
import { distanceLabel, isLiveRecommendationSample } from "@/app/engine/onboarding/livePreview";
import type { FormStep, LiveDistrictRecommendation } from "@/app/engine/onboarding/types";
import { commuteEstimateLabel } from "@/app/engine/routing/labels";
import { planningReachLabel } from "@/app/engine/onboarding/planningReach";

export default function DistrictListItem({ item, step, selected, onSelect }: {
    item: LiveDistrictRecommendation; step: FormStep; selected: boolean; onSelect: () => void;
}) {
    const rent = item.rent === null ? "Sewa belum tersedia" : `Median sewa Rp${formatRupiah(item.rent)}/bulan`;
    // A fitting district needs no status; only flag what is over the limit or unchecked.
    const status = [
        ...(item.eligible === false ? item.exclusions : []),
        ...item.unknowns,
    ].join("; ") || (item.eligible === true ? null : "Belum terverifikasi");
    return <li>
        <button type="button" aria-pressed={selected} onClick={onSelect}
            className="btn btn-ghost h-auto min-h-11 w-full flex-col items-start justify-center whitespace-normal rounded-lg px-2 py-2 text-left leading-relaxed">
        <span className="block font-semibold">{step >= 2 && item.rank ? `${item.rank}. ` : ""}{item.district.zone_name}</span>
        {step >= 2 && <span className="block leading-relaxed text-ink-muted">
            {rent}{status ? ` · ${status}` : ""}
            {isLiveRecommendationSample(item) ? " · Data contoh" : ""}
        </span>}
        {step >= 2 && item.distanceKm !== null && <span className="block text-xs text-ink-muted">{distanceLabel(item.distanceKm)}</span>}
        {step >= 3 && commuteEstimateLabel(item.commuteEstimate) && <span className="block text-xs text-ink-muted">{commuteEstimateLabel(item.commuteEstimate)}</span>}
        {step >= 3 && item.reachBand !== "unknown" && <span className="block text-xs text-ink-muted">{planningReachLabel(item.reachBand)}</span>}
        </button>
    </li>;
}
