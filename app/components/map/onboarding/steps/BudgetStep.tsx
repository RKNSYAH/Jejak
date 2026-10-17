import { housingLabels } from "@/app/engine/onboarding/demoData";
import { toggleHousing } from "@/app/engine/onboarding/preview";
import { CheckboxChoices, MoneyField } from "../FormControls";
import type { StepProps } from "./PurposeStep";

export default function BudgetStep({ answers, onChange, errors }: StepProps) {
    const ratio = answers.monthlyBudget > 0 ? Math.round(answers.maximumRent / answers.monthlyBudget * 100) : null;
    return <div className="space-y-7">
        <div className="grid grid-cols-2 gap-3">
            <MoneyField name="monthlyBudget" label="Anggaran hidup per bulan" mobileLabel="Anggaran hidup" amount={answers.monthlyBudget} onChange={(monthlyBudget) => onChange({ monthlyBudget })}
                hint="Sewa, makan, dan transport." error={errors.monthlyBudget} />
            <MoneyField name="maximumRent" label="Batas sewa per bulan" mobileLabel="Batas sewa" amount={answers.maximumRent} onChange={(maximumRent) => onChange({ maximumRent })}
                hint={`${ratio === null ? "Isi anggaran hidup dulu." : `${ratio}% dari anggaran.`} Umumnya 30–50%.`} error={errors.maximumRent} />
        </div>
        <CheckboxChoices name="housing" label={<>Jenis hunian <span className="font-normal text-ink-muted">· boleh lebih dari satu</span></>}
            values={answers.housing} onToggle={(choice) => onChange({ housing: toggleHousing(answers.housing, choice) })} error={errors.housing}
            choices={(["kos", "apartment", "unsure"] as const).map((value) => ({ value, label: housingLabels[value] }))} />
    </div>;
}
