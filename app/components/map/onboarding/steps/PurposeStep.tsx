import { BriefcaseBusiness, GraduationCap, Layers, MessageSquare, Search } from "lucide-react";
import { onboardingTaxonomy } from "@/app/engine/extractUserProfile";
import type { FormAnswers } from "@/app/engine/onboarding/types";
import type { OnboardingCity } from "@/app/engine/onboarding/types";
import { RadioChoices } from "../FormControls";

export type StepProps = {
    answers: FormAnswers;
    onChange: (patch: Partial<FormAnswers>) => void;
    errors: Record<string, string>;
    cities?: OnboardingCity[];
    citiesLoading?: boolean;
};

export default function PurposeStep({ answers, onChange, errors, onStory, cities = [], citiesLoading = false }: StepProps & { onStory: () => void }) {
    const itOccupation = onboardingTaxonomy.occupations.some((item) => item.label.toLowerCase() === answers.occupation.toLowerCase());
    return <div className="space-y-6">
        <RadioChoices name="goal" label="Pindah untuk" value={answers.goal} onChange={(goal) => onChange({ goal })} cards stacked
            className="grid-cols-3!" choices={[
                { value: "study", label: "Kuliah", icon: <GraduationCap className="size-5" /> },
                { value: "work", label: "Kerja", icon: <BriefcaseBusiness className="size-5" /> },
                { value: "both", label: "Keduanya", icon: <Layers className="size-5" /> },
            ]} />
        {answers.goal !== "study" && <div>
            <label htmlFor="form-occupation" className="mb-2 block text-sm font-semibold">Pekerjaan</label>
            <div className={`input flex h-12 w-full rounded-lg border bg-base-100 ${errors.occupation ? "border-error" : "border-ink/25"}`}>
                <Search aria-hidden="true" className="size-4 shrink-0" />
                <input id="form-occupation" name="occupation" type="text" list="form-occupations" autoComplete="off" maxLength={200} required
                    value={answers.occupation} onChange={(event) => onChange({ occupation: event.target.value, sector: null })}
                    aria-invalid={!!errors.occupation} aria-describedby={errors.occupation ? "form-occupation-error" : "sector-hint"} className="min-w-0 flex-1 text-base md:text-sm" />
            </div>
            <datalist id="form-occupations">{onboardingTaxonomy.occupations.map((item) => <option key={item.id} value={item.label} />)}</datalist>
            {errors.occupation && <p id="form-occupation-error" className="mt-2 text-sm text-error">{errors.occupation}</p>}
            <div id="sector-hint" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                {itOccupation && !answers.sector ? <><span>Saran sektor: Software dan layanan TI</span><button type="button" className="btn btn-ghost min-h-11 px-1 text-xs text-primary underline" onClick={() => onChange({ sector: "software_and_it_services" })}>Pakai saran</button></> : <span>Sektor opsional · pilih sendiri di bawah.</span>}
            </div>
            <details className="text-xs text-ink-muted">
                <summary className="cursor-pointer font-semibold text-primary">{answers.sector ? "Sektor dipilih · ubah" : "Pilih sektor lain"}</summary>
                <label htmlFor="form-sector" className="sr-only">Sektor pekerjaan</label>
                <select id="form-sector" name="sector" value={answers.sector ?? ""} className="select mt-1 w-full border-ink/25 bg-base-100 text-ink" onChange={(event) => onChange({ sector: event.target.value || null })}>
                    <option value="">Belum ditentukan</option>{onboardingTaxonomy.sectors.map((sector) => <option key={sector.id} value={sector.id}>{sector.label}</option>)}
                </select>
            </details>
        </div>}
        {answers.goal !== "work" && <div className="space-y-3">
            <div>
                <label htmlFor="form-studyField" className="mb-2 block text-sm font-semibold">Bidang studi</label>
                <input id="form-studyField" name="studyField" type="text" required maxLength={200} value={answers.studyField}
                    onChange={(event) => onChange({ studyField: event.target.value })} aria-invalid={!!errors.studyField}
                    aria-describedby={errors.studyField ? "form-studyField-error" : undefined} className="input h-12 w-full border-ink/25 bg-base-100 text-base md:text-sm" />
                {errors.studyField && <p id="form-studyField-error" className="mt-2 text-sm text-error">{errors.studyField}</p>}
            </div>
            <RadioChoices name="education" label="Jenjang pendidikan" value={answers.education} onChange={(education) => onChange({ education })}
                choices={[{ value: "Diploma", label: "Diploma" }, { value: "S1", label: "S1" }, { value: "S2", label: "S2" }]} />
        </div>}
        <div>
            <label htmlFor="form-city" className="mb-2 block text-sm font-semibold">Kota tujuan</label>
            <select id="form-city" name="city" value={answers.city} onChange={(event) => onChange({ city: event.target.value })}
                aria-busy={citiesLoading} className="select w-full border-ink/25 bg-base-100 text-ink">
                <option value="unsure">Belum yakin</option>
                {cities.map((city) => <option key={city.city_id} value={city.city_id}>{city.city_name}</option>)}
            </select>
            <p role="status" className="mt-2 text-xs text-ink-muted">{citiesLoading ? "Memuat kota dengan data kecamatan…" : `${cities.length} kota didukung data kecamatan.`}</p>
        </div>
        <button type="button" onClick={onStory} className="btn btn-ghost min-h-11 justify-start gap-2 px-0 text-sm text-primary">
            <MessageSquare aria-hidden="true" className="size-4" />Lebih mudah bercerita? Tulis dengan kata-katamu
        </button>
    </div>;
}
