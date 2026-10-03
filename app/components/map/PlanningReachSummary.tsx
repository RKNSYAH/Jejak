import type { PlanningReach } from "@/app/engine/onboarding/planningReach";
import { planningRadiusLabel } from "@/app/engine/onboarding/planningReach";
import type { LiveDistrictRecommendation } from "@/app/engine/onboarding/types";
import { transportLabels } from "@/app/engine/onboarding/demoData";
import { isLiveRecommendationSample } from "@/app/engine/onboarding/livePreview";

export default function PlanningReachSummary({ reach, districts, destinationName, loading, error, geometryMissing, districtsAvailable, geometryError, savedRevision,
    onShowReach, onRetry }: {
    reach: PlanningReach; districts: LiveDistrictRecommendation[]; destinationName: string | null;
    loading: boolean; error: string | null; geometryMissing: boolean;
    districtsAvailable: boolean; geometryError: string | null;
    savedRevision?: number | null;
    onShowReach: () => void; onRetry: () => void;
}) {
    const near = districts.filter((item) => item.reachBand === "near").length;
    const edge = districts.filter((item) => item.reachBand === "edge").length;
    const unknown = districts.filter((item) => item.reachBand === "unknown").length;
    const showCounts = !loading && !error && districtsAvailable;
    return <section data-hci-region="map-planning-reach" className="pointer-events-auto col-span-2 min-w-0 rounded-xl border border-rule bg-panel-surface px-3 py-2 font-body text-ink shadow-overlay md:w-full md:max-w-128">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <div className="min-w-0 flex-1">
                <h2 className="text-sm font-semibold">Perkiraan jangkauan <span className="tabular-nums">{planningRadiusLabel(reach)}</span></h2>
                <p className="truncate text-xs text-ink-muted">{destinationName ?? "Tujuanmu"} · {transportLabels[reach.mode]} · {reach.minutes} mnt</p>
            </div>
            <button type="button" onClick={onShowReach} className="btn btn-ghost min-h-11 shrink-0 px-2 text-xs text-primary underline">Lihat jangkauan</button>
        </div>
        {districts.some(isLiveRecommendationSample) && <span className="badge badge-neutral badge-xs">Data contoh</span>}
        <p role="status" className="text-xs text-ink-muted">{loading ? "Memuat titik kecamatan…" : error || !districtsAvailable ? "Titik kecamatan belum tersedia" : `${near + edge} kecamatan dalam kisaran${unknown ? ` · ${unknown} lokasi belum tersedia` : ""}`}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-xs border border-primary bg-primary/30" />Dalam{showCounts ? ` · ${near}` : ""}</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-xs border border-secondary bg-accent/40" />Tepi{showCounts ? ` · ${edge}` : ""}</span>
            <span className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-xs border border-ink/40" />Luar / belum diketahui</span>
        </div>
        {savedRevision != null && <p role="status" data-hci-region="profile-save-feedback" className="mt-1 text-xs text-ink-muted">Profil tersimpan di akunmu · revisi {savedRevision}</p>}
        {geometryMissing && !loading && !error && <p className="text-xs text-ink-muted">Sebagian batas belum tersedia · lihat titik dan daftar</p>}
        {(error || geometryError) && <button type="button" onClick={onRetry} className="btn btn-ghost min-h-11 px-0 text-xs text-primary underline">Coba data kecamatan lagi</button>}
    </section>;
}
