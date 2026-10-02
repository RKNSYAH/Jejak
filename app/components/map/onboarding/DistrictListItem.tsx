import { formatRupiah } from "@/app/engine/onboarding/demoData";
import { isLiveRecommendationSample } from "@/app/engine/onboarding/livePreview";
import type { FormStep, LiveDistrictRecommendation } from "@/app/engine/onboarding/types";

export default function DistrictListItem({ item, step, selected, onSelect }: {
    item: LiveDistrictRecommendation; step: FormStep; selected: boolean; onSelect: () => void;
}) {
    const rent = item.rent === null ? "Sewa belum tersedia" : `Median sewa Rp${formatRupiah(item.rent)}/bulan`;
    const status = [
        ...(item.eligible === true ? ["Batas sewa dan biaya terpenuhi"] : item.exclusions),
        ...item.unknowns,
    ].join("; ") || "Belum terverifikasi";
    return <li>
        <button type="button" aria-pressed={selected} onClick={onSelect}
            className="btn btn-ghost h-auto min-h-11 w-full flex-col items-start justify-center whitespace-normal rounded-lg px-2 py-2 text-left leading-relaxed">
        <span className="block font-semibold">{step === 4 && item.rank ? `${item.rank}. ` : ""}{item.district.zone_name}</span>
        {step >= 2 && <span className="block leading-relaxed text-ink-muted">
            {rent} · {status}
            {isLiveRecommendationSample(item) ? " · Data contoh" : ""}
        </span>}
        {item.rentFact && <span className="block text-xs text-ink-muted">Sumber sewa: {item.rentFact.source}</span>}
        {item.district.living_cost && <span className="block text-xs text-ink-muted">Sumber biaya kota: {item.district.living_cost.source}</span>}
        </button>
    </li>;
}
