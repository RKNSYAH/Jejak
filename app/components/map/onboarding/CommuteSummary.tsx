import type { LiveOnboardingPreview } from "@/app/engine/onboarding/types";
import { planningRadiusLabel } from "@/app/engine/onboarding/planningReach";
import { visiblePreviewDistricts } from "@/app/engine/onboarding/visibleDistricts";

export default function CommuteSummary({ preview, loading = false, error = null, onRetry, compact = false }: {
    preview: LiveOnboardingPreview; loading?: boolean; error?: string | null; onRetry?: () => void; compact?: boolean;
}) {
    const commute = preview.commute;
    const count = preview.districts.filter((item) => item.commuteEstimate?.minutes !== null && item.commuteEstimate?.minutes !== undefined).length;
    const transit = preview.preferences.transport === "transit";
    const reach = preview.planningReach;
    if (!reach && !commute) {
        const hasDestination = preview.preferences.destinationPoint || preview.destinations.some((item) => item.id === preview.preferences.destinationId);
        return <p role="status" data-hci-region="onboarding-reach-estimate" className="text-xs leading-normal text-ink-muted">
            {!hasDestination ? "Pilih tujuan untuk melihat jangkauan" : !preview.preferences.transport ? "Pilih moda untuk melihat jangkauan" : "Atur batas waktu untuk melihat jangkauan"}
        </p>;
    }
    if (reach && !commute) {
        const inReach = visiblePreviewDistricts(preview).filter((item) => item.reachBand === "near" || item.reachBand === "edge").length;
        return <div data-hci-region="onboarding-reach-estimate" className={`text-xs text-ink-muted ${compact ? "leading-normal" : "mt-2 space-y-1 leading-relaxed"}`}>
            <p role="status">Perkiraan jangkauan {planningRadiusLabel(reach)} · {inReach} kecamatan</p>
        </div>;
    }
    return <div data-hci-region="onboarding-commute-evidence" aria-busy={loading} className={`space-y-1 text-xs text-ink-muted ${compact ? "leading-normal" : "mt-2 leading-relaxed"}`}>
        <p role="status">{loading ? "Menghitung rute…" : count ? `${count} kecamatan dengan estimasi titik sampel` : "Estimasi rute belum tersedia"}</p>
        {error && <p role="alert">{error}{onRetry && <button type="button" onClick={onRetry} className="btn btn-ghost min-h-11 px-2 text-xs text-primary underline">Coba rute lagi</button>}</p>}
        {!compact && count > 0 && commute?.provenance && <>
            <p><span className="badge badge-outline badge-xs">Estimasi</span> {transit ? "TransJakarta + jalan kaki" : preview.preferences.transport === "active" ? "Jalan kaki · jaringan OSM" : "Jalan · tanpa lalu lintas langsung"}</p>
            {commute.departureAt && <p>Skenario {commute.departureAt.slice(0, 10)} · {commute.departureAt.slice(11, 16)} WIB</p>}
            <p>{transit ? "Jalan, tunggu, pindah, dan waktu halte termasuk" : preview.preferences.transport === "active" ? "Kecepatan jalan: 4,5 km/jam" : "Persiapan dan parkir: asumsi 2 mnt total"} · biaya perjalanan belum tersedia</p>
            <p>{commute.reach ? `Jangkauan jaringan ke tujuan · ${preview.preferences.commuteMinutes ?? 45} mnt · bukan semua titik` : "Jangkauan dinilai di titik sampel"}</p>
            {commute.estimates.some((estimate) => estimate.geometry !== null) && <p>Garis rute: satu titik sampel terpilih</p>}
            <p>{commute.provenance.freshness === "stale" ? "Data lama" : commute.provenance.snapshotDate ? `Sumber ${commute.provenance.snapshotDate}` : "Tanggal sumber belum diketahui"} · {commute.provenance.engine} {commute.provenance.engineVersion}</p>
            <p className="flex flex-wrap gap-x-3">{commute.provenance.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{source.name}</a>)}</p>
        </>}
    </div>;
}
