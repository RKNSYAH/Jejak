import { formatRupiah } from "@/app/engine/onboarding/demoData";
import type { DistrictRecommendation, FormStep } from "@/app/engine/onboarding/types";

// One district in the accessible preview list; rent appears once budgets are set.
export default function DistrictListItem({ item, step }: { item: DistrictRecommendation; step: FormStep }) {
    return <li>
        <strong>{step === 4 && item.rank ? `${item.rank}. ` : ""}{item.district.name}</strong>
        {step >= 2 && <span className="block leading-relaxed text-ink-muted">Sewa Rp{formatRupiah(item.rent)} / bulan · {item.eligible ? "Lolos batas contoh" : item.exclusions.join("; ")}{step >= 3 && item.commuteMinutes !== null ? ` · ${item.commuteMinutes} mnt simulasi` : ""}</span>}
    </li>;
}
