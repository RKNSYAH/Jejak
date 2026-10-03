import { formatRupiah } from "@/app/engine/onboarding/demoData";
import type { LiveOnboardingPreview } from "@/app/engine/onboarding/types";
import { visiblePreviewDistricts } from "@/app/engine/onboarding/visibleDistricts";

function SampleBadge() {
    return <dd className="mt-1"><span className="badge badge-neutral badge-xs">Data contoh</span></dd>;
}

export default function CostEstimate({ preview, selectedDistrictId, onSelectDistrict, disabled }: {
    preview: LiveOnboardingPreview; selectedDistrictId: string | null;
    onSelectDistrict: (id: string) => void; disabled: boolean;
}) {
    const selected = preview.districts.find((item) => item.district.zone_id === selectedDistrictId);
    // Before a district is chosen, only show the city reference—not an invented rent or total.
    const cityCost = selected ? selected.district.living_cost
        : preview.districts.find((item) => item.district.living_cost)?.district.living_cost;
    const rentFact = selected?.rentFact;
    const rentSample = rentFact && (rentFact.is_sample || selected?.district.is_sample === true);
    const totalSample = selected && (selected.district.is_sample || rentFact?.is_sample || cityCost?.is_sample);

    return <section aria-labelledby="onboarding-cost-title" data-hci-region="onboarding-cost-estimate" className="mt-6 border-t-2 border-ink pt-4">
        <h2 id="onboarding-cost-title" className="font-sans text-lg font-bold">Perkiraan biaya bulanan</h2>
        <label htmlFor="onboarding-cost-district" className="mb-2 mt-3 block text-sm font-semibold">Kecamatan untuk dibandingkan</label>
        <select id="onboarding-cost-district" name="previewDistrict" value={selected?.district.zone_id ?? ""}
            disabled={disabled} onChange={(event) => onSelectDistrict(event.target.value)}
            className="select min-h-11 w-full border-ink/25 bg-base-100 text-base text-ink md:text-sm">
            <option value="" disabled>Pilih kecamatan</option>
            {visiblePreviewDistricts(preview).map((item) => <option key={item.district.zone_id} value={item.district.zone_id}>{`${item.rank ? `${item.rank}. ` : ""}${item.district.zone_name}`}</option>)}
        </select>
        <dl className="mt-4 space-y-4 text-sm">
            <div>
                <dt className="text-ink-muted">Rata-rata sewa / bulan</dt>
                <dd className="mt-1 font-semibold tabular-nums">{!selected ? "Pilih kecamatan" : selected.rent === null ? "Belum tersedia" : `Rp${formatRupiah(selected.rent)}`}</dd>
                {rentSample && <SampleBadge />}
            </div>
            <div>
                <dt className="text-ink-muted">Biaya hidup kota / bulan</dt>
                <dd className="mt-1 font-semibold tabular-nums">{cityCost ? `sekitar Rp${formatRupiah(cityCost.value)}` : "Belum tersedia"}</dd>
                <dd className="mt-1 text-xs text-ink-muted">Makan, transport, listrik, internet · belum termasuk sewa</dd>
                {cityCost?.is_sample && <SampleBadge />}
            </div>
            <div className="border-t border-rule pt-3">
                <dt className="font-semibold">Perkiraan total / bulan</dt>
                <dd className="mt-1 font-sans text-2xl font-bold tabular-nums">{!selected ? "Pilih kecamatan" : selected.monthlyCost === null ? "Belum tersedia" : `sekitar Rp${formatRupiah(selected.monthlyCost)}`}</dd>
                {totalSample && <SampleBadge />}
                <dd className="mt-1 text-xs text-ink-muted">Sewa kecamatan + biaya hidup kota</dd>
            </div>
        </dl>
        {selected && selected.financialEligible !== true && <p className="mt-3 text-sm font-semibold">
            {selected.financialEligible === false ? selected.exclusions.filter((reason) => /sewa|biaya bulanan/i.test(reason)).join(" · ") : "Batas biaya belum terverifikasi"}</p>}
    </section>;
}
