import { formatRupiah } from "@/app/engine/onboarding/demoData";
import type { MonthlyCostEstimate } from "@/app/engine/onboarding/livePreview";

export default function MonthlyCostSummary({ estimate, loading }: {
    estimate: MonthlyCostEstimate | null;
    loading: boolean;
}) {
    return <section aria-labelledby="monthly-cost-title" data-hci-region="onboarding-monthly-cost-estimate" className="mt-3 border-t border-rule pt-3">
        <h2 id="monthly-cost-title" className="text-xs text-ink-muted">Perkiraan biaya bulanan di daerah rekomendasi</h2>
        <p className="mt-0.5 font-sans text-lg font-bold tabular-nums">{loading ? "Menghitung…" : !estimate ? "Belum ada kecamatan rekomendasi dengan data biaya lengkap"
            : `sekitar Rp${formatRupiah(estimate.average)} / bulan`}</p>
        {estimate && <p className="mt-1 text-xs text-ink-muted">Rata-rata total sewa kecamatan + biaya hidup kota{estimate.is_sample && <span className="badge badge-neutral badge-xs ml-2">Data contoh</span>}</p>}
    </section>;
}
