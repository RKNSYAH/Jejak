import { useState } from "react";
import { onboardingTaxonomy } from "@/app/engine/extractUserProfile";
import { SENSITIVE_TEXT } from "@/app/engine/lib/relocationProfileInterpretationValidation";
import { relocationGoalLabels } from "@/app/engine/lib/relocationGoal";
import { transportModeLabels } from "@/app/engine/onboarding/demoData";
import { isRecord } from "@/app/engine/lib/zoneGeometry";
import { MoneyField } from "./FormControls";

// Review-step fields the user can correct in place; priorities keep their own controls.
export const editableProfileFields = new Set([
    "goal", "target_occupations", "destination_cities", "housing_budget", "monthly_budget", "commute_minutes", "transport_mode", "destination",
]);

function initialDraft(field: string, value: unknown): string | number {
    if (field === "housing_budget" || field === "monthly_budget") return isRecord(value) && typeof value.amount === "number" ? value.amount : 0;
    if (field === "commute_minutes") return typeof value === "number" ? value : "";
    if (field === "destination") return isRecord(value) && typeof value.name === "string" ? value.name : "";
    if (field === "target_occupations" || field === "destination_cities") {
        const first = Array.isArray(value) ? value.find((item) => typeof item === "string") : null;
        if (field === "destination_cities" && typeof first === "string") {
            // Profile interpretation may return an area id or its label; the select works with labels.
            return onboardingTaxonomy.areas?.find((area) => area.id === first || area.label === first)?.label ?? first;
        }
        return typeof first === "string" ? first : "";
    }
    return typeof value === "string" ? value : "";
}

function toProfileValue(field: string, draft: string | number): { value: unknown } | { error: string } {
    if (field === "housing_budget" || field === "monthly_budget") {
        const amount = Number(draft);
        return Number.isSafeInteger(amount) && amount > 0 && amount <= 1_000_000_000
            ? { value: { amount, currency: "IDR", period: "month" } } : { error: "Isi jumlah antara Rp1 dan Rp1 miliar." };
    }
    if (field === "commute_minutes") {
        const minutes = Number(draft);
        return draft !== "" && Number.isInteger(minutes) && minutes >= 0 && minutes <= 240
            ? { value: minutes } : { error: "Isi waktu tempuh 0–240 menit." };
    }
    const text = String(draft).trim();
    if (!text) return { error: "Pilih atau isi nilainya dulu." };
    if (field === "destination") {
        if (text.length > 120) return { error: "Nama lokasi terlalu panjang." };
        if (SENSITIVE_TEXT.test(text)) return { error: "Hapus data pribadi sensitif sebelum menyimpan." };
        return { value: { name: text, precision: "area" } };
    }
    if (field === "target_occupations" || field === "destination_cities") return { value: [text] };
    return { value: text };
}

export default function ProfileFieldEditor({ field, label, value, onSave, onCancel }: {
    field: string; label: string; value: unknown; onSave: (value: unknown) => void; onCancel: () => void;
}) {
    const [draft, setDraft] = useState<string | number>(() => initialDraft(field, value));
    const [error, setError] = useState<string | null>(null);
    const id = `profile-edit-${field}`;
    const select = (choices: [string, string][]) => <select id={id} value={String(draft)} onChange={(event) => setDraft(event.target.value)}
        className="select min-h-11 w-full border-ink/25 bg-base-100 text-base text-ink md:text-sm">
        {!choices.some(([choice]) => choice === draft) && <option value="" disabled>Pilih</option>}
        {choices.map(([choice, text]) => <option key={choice} value={choice}>{text}</option>)}
    </select>;

    function save() {
        const result = toProfileValue(field, draft);
        if ("error" in result) setError(result.error);
        else onSave(result.value);
    }

    return <div className="mt-1 space-y-2" data-hci-region="story-profile-field-editor">
        {field === "housing_budget" || field === "monthly_budget"
            ? <MoneyField name={id} label={label} amount={Number(draft) || 0} onChange={setDraft} hint="Per bulan." error={error ?? undefined} />
            : <>
                <label htmlFor={id} className="sr-only">{label}</label>
                {field === "goal" ? select(Object.entries(relocationGoalLabels))
                    : field === "target_occupations" ? select(onboardingTaxonomy.occupations.map((item) => [item.id, item.label]))
                    : field === "destination_cities" ? select((onboardingTaxonomy.areas ?? []).map((area) => [area.label, area.label]))
                    : field === "transport_mode" ? select(Object.entries(transportModeLabels))
                    : <input id={id} type={field === "commute_minutes" ? "number" : "text"} inputMode={field === "commute_minutes" ? "numeric" : undefined}
                        min={field === "commute_minutes" ? 0 : undefined} max={field === "commute_minutes" ? 240 : undefined} value={draft}
                        onChange={(event) => setDraft(event.target.value)} className="input min-h-11 w-full border-ink/25 bg-base-100 text-base text-ink md:text-sm" />}
                {error && <p role="alert" className="text-xs font-semibold text-error">{error}</p>}
            </>}
        <div className="flex gap-2">
            <button type="button" onClick={save} className="btn btn-primary btn-sm min-h-11 rounded-lg px-3">Simpan</button>
            <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm min-h-11 px-2 text-ink">Batal</button>
        </div>
    </div>;
}
