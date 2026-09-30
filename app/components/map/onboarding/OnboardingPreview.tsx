import { useState } from "react";
import { demoDestinations, formatRupiah, transportLabels } from "@/app/engine/onboarding/demoData";
import type { FormSession, OnboardingPreview as Preview } from "@/app/engine/onboarding/types";
import type { MapCategory } from "@/app/engine/types";

export default function OnboardingPreview({ session, preview, geometryLoading, geometryError, onRetry, category, onEditPreferences, onExitPrototype }: {
    session: FormSession; preview: Preview; geometryLoading: boolean; geometryError: string | null; onRetry: () => void; category: MapCategory | null;
    onEditPreferences: () => void; onExitPrototype: () => void;
}) {
    const [listOpen, setListOpen] = useState(false);
    const completed = session.status === "completed";
    const step = completed ? 4 : session.step;
    const destination = demoDestinations.find((item) => item.id === session.answers.destinationId);
    const metricLabels = { summary: "Urutan sesuai prioritasmu", employment: "Peluang karier umum", education: "Akses pendidikan", housing: "Keterjangkauan sewa", mobility: "Kemudahan perjalanan" };
    return <section lang="id" data-hci-region="onboarding-preview" aria-label="Pratinjau langsung" className={`absolute left-3 z-100 w-[min(25rem,calc(100%-1.5rem))] rounded-xl border border-rule bg-panel-surface p-3 font-body text-ink shadow-overlay md:left-5 md:rounded-2xl md:p-4 ${completed ? "bottom-[calc(var(--map-sheet-height,44px)+1rem)]" : "bottom-[calc(var(--onboarding-sheet-height,74dvh)+0.75rem)] md:bottom-4"}`}>
        {!completed && preview.available && <div className="flex flex-wrap items-center justify-between gap-2 text-xs md:hidden" role="status">
            <span>{step === 1 ? "Contoh Jakarta Selatan" : step === 2 ? <><strong className="text-base">{preview.affordableCount}/10</strong> kecamatan dalam batas sewa</> : step === 3 ? <>{destination ? `${session.answers.commuteMinutes} mnt · ${destination.name}` : "Pilih kawasan tujuan"}</> : <><strong>{preview.eligibleCount}</strong> kecamatan lolos batasmu</>}</span>
            <span className="badge badge-neutral badge-xs">Contoh data</span>
        </div>}
        <div className={completed || !preview.available ? "" : "hidden md:block"}>
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-muted">{step === 3 && destination ? `Jangkauan dari ${destination.name}` : "Pratinjau langsung"}</p><span className="badge badge-neutral badge-xs">Contoh data</span></div>
        {!preview.available ? <p role="status" className="mt-2 text-sm">Pratinjau contoh belum tersedia untuk kota ini. Pilihanmu tetap tersimpan. Pilih Jakarta Selatan untuk mencoba simulasi.</p>
            : <>
                {step === 1 && <p className="mt-2 text-sm">{session.answers.city === "unsure" ? "Contoh Jakarta Selatan · tujuanmu masih terbuka." : "Contoh Jakarta Selatan."} Kawasan menunjukkan lokasi area, bukan alamat kantor persis.</p>}
                {step === 2 && <p role="status" className="mt-2 text-sm"><strong className="mr-1 font-sans text-2xl md:text-3xl">{preview.affordableCount}<span className="md:hidden">/10</span></strong><span className="hidden md:inline">dari 10 </span>kecamatan dalam batas sewa dan anggaran</p>}
                {step === 3 && <p role="status" className="mt-2 text-sm leading-relaxed">{destination ? <>Simulasi <strong>{session.answers.commuteMinutes} menit</strong> dengan {transportLabels[session.answers.transport]}. Lingkaran ilustratif, bukan hasil routing. {preview.eligibleCount} kecamatan lolos semua batas contoh.</> : "Tujuan belum ditentukan. Pilih kawasan untuk simulasi; batas perjalanan belum menyaring hasil."}</p>}
                {step === 4 && <p role="status" className="mt-2 text-sm"><strong className="font-sans text-2xl">{preview.eligibleCount}</strong> kecamatan lolos batasmu. {completed ? metricLabels[category ?? "summary"] : "Nomor mengikuti prioritasmu."}</p>}
                {step >= 2 && preview.eligibleCount === 0 && <p className="mt-2 text-xs leading-relaxed text-ink-muted">Belum ada kecamatan yang cocok dalam contoh ini. Naikkan anggaran, ubah hunian, atau longgarkan waktu perjalanan.</p>}
                {(step === 2 || step === 4) && <div className="mt-3 hidden space-y-1.5 border-t border-rule pt-2 text-xs md:block">
                    <p className="flex items-center gap-2"><span aria-hidden="true" className="h-3 w-4 rounded-xs border border-primary bg-primary/20" />Lolos batas contoh</p>
                    <p className="flex items-center gap-2"><span aria-hidden="true" className="onboarding-hatch-swatch h-3 w-4 rounded-xs border border-ink/25" />Di luar batas · {session.answers.overBudget === "hide" ? "disembunyikan" : "diarsir"}</p>
                </div>}
            </>}
        </div>
        {completed && preview.available && category && category !== "summary" && <div className="mt-3 border-t border-rule pt-2 text-xs">
            {category === "mobility" && !destination ? <p>Tujuan belum ditentukan · nilai mobilitas belum tersedia.</p> : <>
                <p className="text-ink-muted">Indikator contoh 0–100, bukan jumlah pengamatan.</p>
                <div aria-hidden="true" className="mt-2 h-2 rounded-full bg-[linear-gradient(to_right,var(--color-accent),var(--color-primary))]" />
                <div className="mt-1 flex justify-between text-ink-muted"><span>0 · rendah</span><span>100 · tinggi</span></div>
            </>}
        </div>}
        {completed && <div className="mt-2 flex flex-wrap items-center gap-x-4">
            <button type="button" className="btn btn-ghost min-h-11 px-0 text-xs text-primary underline" onClick={onEditPreferences}>Sesuaikan rencana</button>
            <button type="button" className="btn btn-ghost min-h-11 px-0 text-xs text-ink underline" onClick={onExitPrototype}>Jelajahi data peta</button>
        </div>}
        {geometryLoading && <p role="status" className="mt-2 text-xs text-ink-muted">Memuat batas kecamatan BIG RBI…</p>}
        {geometryError && preview.available && <p role="status" className="mt-2 text-xs text-ink-muted">{geometryError} Daftar tetap tersedia.<button type="button" onClick={onRetry} className="btn btn-ghost min-h-11 px-1 text-xs text-primary underline">Coba lagi</button></p>}
        {preview.available && !completed && <>
            <button type="button" aria-expanded={listOpen} aria-controls="onboarding-area-list" onClick={() => setListOpen(!listOpen)} className="btn btn-ghost mt-1 hidden min-h-11 px-0 text-xs text-primary underline md:inline-flex">{listOpen ? "Tutup daftar kecamatan" : "Lihat daftar kecamatan"}</button>
            {listOpen && <ul id="onboarding-area-list" className="mt-2 max-h-40 space-y-2 overflow-y-auto border-t border-rule pt-2 text-xs">
                {preview.districts.map((item) => <li key={item.district.id}><strong>{item.rank && step === 4 ? `${item.rank}. ` : ""}{item.district.name}</strong><span className="block text-ink-muted">Rp{formatRupiah(item.rent)} / bulan · {item.eligible ? "Lolos batas contoh" : item.exclusions.join("; ")}</span></li>)}
            </ul>}
        </>}
    </section>;
}
