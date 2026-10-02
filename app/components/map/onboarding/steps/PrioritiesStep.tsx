import { Check } from "lucide-react";
import { defaultWeights } from "@/app/engine/onboarding/demoData";
import { priorityKeys, redistributeWeights } from "@/app/engine/onboarding/preview";
import type { StepProps } from "./PurposeStep";

export default function PrioritiesStep({ answers, onChange }: StepProps) {
    const opportunityLabel = answers.goal === "study" ? "Pendidikan" : answers.goal === "both" ? "Karier & pendidikan" : "Karier";
    const labels = { opportunity: opportunityLabel, affordability: "Keterjangkauan", mobility: "Mobilitas", environment: "Lingkungan" };
    const hints = { opportunity: answers.goal === "study" ? "Kampus dan bidang studi" : "Kantor dan peluang karier", affordability: "Sewa dan biaya hidup", mobility: "Waktu tempuh, akses transport", environment: "Ruang hijau, fasilitas" };
    return <div className="space-y-6">
        <div>
            <div className="divide-y divide-rule border-y border-rule">
                {priorityKeys.map((key) => <div key={key} className="grid grid-cols-[minmax(0,1fr)_minmax(5rem,1.5fr)_3rem] items-center gap-3 py-4">
                    <div className="min-w-0"><label htmlFor={`weight-${key}`} className="block text-sm font-semibold">{labels[key]}</label><p className="mt-1 text-xs leading-snug text-ink-muted">{hints[key]}</p></div>
                    <input id={`weight-${key}`} name={`weight-${key}`} type="range" min={0} max={100} step={1} value={answers.weights[key]}
                        aria-valuetext={`${answers.weights[key]} persen`} aria-describedby="weight-help" className="range range-primary range-xs w-full"
                        onChange={(event) => onChange({ weights: redistributeWeights(answers.weights, key, Number(event.target.value)) })} />
                    <output htmlFor={`weight-${key}`} className="text-right font-sans text-lg font-bold tabular-nums">{answers.weights[key]}%</output>
                </div>)}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2"><Check aria-hidden="true" className="size-4 text-primary" />Total 100%</span>
                <button type="button" onClick={() => onChange({ weights: { ...defaultWeights } })} className="btn btn-ghost min-h-11 px-0 text-xs text-primary underline">Pakai saran untuk profilmu</button>
            </div>
            <p id="weight-help" className="text-xs leading-relaxed text-ink-muted">Bobot lain menyesuaikan otomatis agar total tetap 100%. Angka dan urutan memakai contoh data.</p>
        </div>
    </div>;
}
