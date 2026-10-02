import { useState } from "react";
import { Bike, Car, Footprints, MapPin, Search, TrainFront } from "lucide-react";
import type { OnboardingCampus } from "@/app/engine/onboarding/types";
import { RadioChoices } from "../FormControls";
import type { StepProps } from "./PurposeStep";

export default function JourneyStep({ answers, onChange, destinations = [], onMapPick, pickingDestination = false }: StepProps & {
    destinations?: OnboardingCampus[];
    onMapPick: () => void;
    pickingDestination?: boolean;
}) {
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState("");
    const campusChoices = answers.goal === "work" ? [] : destinations;
    const selected = campusChoices.find((item) => item.id === answers.destinationId);
    const matches = campusChoices.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
    const hasPoint = answers.destinationPoint !== null;
    return <div className="space-y-6">
        <div data-hci-region="onboarding-destination">
            <p className="mb-2 text-sm font-semibold">{answers.goal === "study" ? "Kampus atau kawasan tujuan" : "Kantor atau kawasan tujuan"}</p>
            <div className="flex min-h-14 items-center gap-3 rounded-xl border border-primary bg-primary-tint px-3.5 py-2 ring-1 ring-primary">
                <MapPin aria-hidden="true" className="size-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{selected?.name ?? (hasPoint ? answers.destinationName : "Belum ditentukan")}</p><p className="mt-0.5 text-xs text-ink-muted">{selected ? "Lokasi kampus" : hasPoint ? "Titik pilihanmu di peta" : "Belum ada estimasi rute terverifikasi"}</p></div>
                {campusChoices.length > 0 && <button type="button" aria-expanded={searchOpen} aria-controls="form-destination-picker" onClick={() => setSearchOpen(!searchOpen)} className="btn btn-ghost min-h-11 px-1 text-xs text-primary">Cari kampus</button>}
            </div>
            {searchOpen && <div id="form-destination-picker" className="mt-3">
                <label htmlFor="form-destination-search" className="input flex h-11 w-full border-ink/25 bg-base-100"><Search aria-hidden="true" className="size-4" /><span className="sr-only">Cari kawasan tujuan</span><input id="form-destination-search" name="destinationSearch" type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 text-base md:text-sm" /></label>
                <ul className="mt-2 space-y-1" aria-label="Kampus dari basis data">
                    {matches.map((item) => <li key={item.id}><button type="button" className="btn btn-ghost min-h-11 w-full justify-start text-left text-sm" onClick={() => { onChange({ destinationId: item.id, destinationName: item.name, destinationPoint: item.center }); setSearchOpen(false); }}>{item.name}</button></li>)}
                </ul>
                {!matches.length && <p className="mt-2 text-xs text-ink-muted">Belum ada kawasan yang cocok. Coba nama lain.</p>}
            </div>}
            <div className="mt-1 flex flex-wrap items-center gap-x-3">
                <button type="button" onClick={onMapPick} aria-pressed={pickingDestination} className="btn btn-ghost min-h-11 px-0 text-xs text-primary">{pickingDestination ? "Pilih titik pada peta" : "Pilih titik di peta"}</button>
                <button type="button" onClick={() => { onChange({ destinationId: null, destinationName: null, destinationPoint: null }); setSearchOpen(false); }} className="btn btn-ghost min-h-11 px-0 text-xs text-ink-muted">Belum tahu tujuan</button>
            </div>
            {pickingDestination && <p role="status" className="text-xs text-ink-muted">Klik lokasi tujuan pada peta di belakang formulir.</p>}
            {answers.goal !== "work" && campusChoices.length === 0 && <p className="text-xs text-ink-muted">Belum ada kampus terdaftar untuk kota ini. Kamu tetap bisa memilih titik di peta.</p>}
            <p className="alert alert-info mt-2 text-xs">Estimasi waktu perjalanan dan jangkauan rute belum tersedia. Titik ini belum dipakai untuk menilai kelayakan kecamatan.</p>
        </div>
        <RadioChoices name="transport" label="Moda utama" value={answers.transport} onChange={(transport) => onChange({ transport })} cards choices={[
            { value: "transit", label: "Transport umum", icon: <TrainFront className="size-4" /> },
            { value: "motorcycle", label: "Motor", icon: <Bike className="size-4" /> },
            { value: "car", label: "Mobil", icon: <Car className="size-4" /> },
            { value: "active", label: "Jalan atau sepeda", icon: <Footprints className="size-4" /> },
        ]} />
        <RadioChoices name="commuteMinutes" label="Batas waktu tempuh sekali jalan" value={answers.commuteMinutes} onChange={(commuteMinutes) => onChange({ commuteMinutes })}
            className="grid! grid-cols-4 rounded-xl border border-rule p-1 [&>label>span]:px-1 [&>label>span]:border-transparent" choices={[15, 30, 45, 60].map((value) => ({ value: value as 15 | 30 | 45 | 60, label: `${value} mnt` }))} />
        <RadioChoices name="departure" label="Biasanya berangkat" value={answers.departure} onChange={(departure) => onChange({ departure })}
            choices={[{ value: "morning", label: "Pagi" }, { value: "midday", label: "Siang" }, { value: "evening", label: "Sore atau malam" }, { value: "flexible", label: "Tidak tentu" }]} />
    </div>;
}
