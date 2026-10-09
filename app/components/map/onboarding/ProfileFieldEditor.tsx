import { useState } from "react";
import { onboardingTaxonomy } from "@/app/engine/extractUserProfile";
import { SENSITIVE_TEXT } from "@/app/engine/lib/relocationProfileInterpretationValidation";
import { relocationGoalLabels } from "@/app/engine/lib/relocationGoal";
import { transportModeLabels } from "@/app/engine/onboarding/demoData";
import { isRecord } from "@/app/engine/lib/zoneGeometry";
import { MoneyField } from "./FormControls";

// Review-step fields the user can correct in place; priorities keep their own controls.
export const editableProfileFields = new Set([
    "goal", "occupation", "target_occupations", "target_fields", "study_field", "education_level", "destination_cities",
    "housing_budget", "monthly_budget", "housing_types", "commute_minutes", "transport_mode", "active_mode",
    "departure_time", "destination", "over_budget",
]);

type EditorDraft = string | number | string[];

function initialDraft(field: string, value: unknown): EditorDraft {
    if (field === "housing_budget" || field === "monthly_budget") return isRecord(value) && typeof value.amount === "number" ? value.amount : 0;
    if (field === "commute_minutes") return typeof value === "number" ? value : "";
    if (field === "destination") return isRecord(value) && typeof value.name === "string" ? value.name : "";
    if (field === "target_occupations" || field === "target_fields" || field === "destination_cities") {
        const values = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
        return field === "destination_cities" ? values.map((item) =>
            onboardingTaxonomy.areas?.find((area) => area.id === item || area.label === item)?.label ?? item) : values;
    }
    if (field === "housing_types") return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return typeof value === "string" ? value : "";
}

function toProfileValue(field: string, draft: EditorDraft): { value: unknown } | { error: string } {
    if (["housing_types", "target_occupations", "target_fields", "destination_cities"].includes(field)) {
        return { value: Array.isArray(draft) ? draft : [] };
    }
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
    if (["occupation", "study_field", "education_level", "career_stage"].includes(field)) {
        if (text.length > 200 || SENSITIVE_TEXT.test(text)) return { error: "Periksa isi dan hapus data pribadi sensitif." };
    }
    return { value: text };
}

export default function ProfileFieldEditor({ field, label, value, onSave, onCancel }: {
    field: string; label: string; value: unknown; onSave: (value: unknown) => void; onCancel: () => void;
}) {
    const [draft, setDraft] = useState<EditorDraft>(() => initialDraft(field, value));
    const [error, setError] = useState<string | null>(null);
    const id = `profile-edit-${field}`;
    const choices: [string, string][] | null = field === "housing_types" ? [["kos", "Kos"], ["apartment", "Apartemen"], ["house", "Rumah"]]
        : field === "target_occupations" ? onboardingTaxonomy.occupations.map((item) => [item.id, item.label])
        : field === "target_fields" ? onboardingTaxonomy.sectors.map((item) => [item.id, item.label])
        : field === "destination_cities" ? (onboardingTaxonomy.areas ?? []).map((area) => [area.label, area.label]) : null;
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
            ? <MoneyField name={id} label={label} amount={Number(draft) || 0} onChange={(amount) => setDraft(amount)} hint="Per bulan." error={error ?? undefined} />
            : choices ? <fieldset className="space-y-1">
                <legend className="sr-only">{label}</legend>
                {choices.map(([option, optionLabel]) => {
                    const selected = Array.isArray(draft) && draft.includes(option);
                    return <label key={option} className="flex min-h-11 items-center gap-2 text-sm">
                        <input type="checkbox" checked={selected} onChange={() => setDraft((current) => {
                            const values = Array.isArray(current) ? current : [];
                            return selected ? values.filter((item) => item !== option) : [...values, option];
                        })} className="checkbox checkbox-primary" />
                        {optionLabel}
                    </label>;
                })}
            </fieldset>
            : <>
                <label htmlFor={id} className="sr-only">{label}</label>
                {field === "goal" ? select(Object.entries(relocationGoalLabels))
                    : field === "transport_mode" ? select(Object.entries(transportModeLabels))
                    : field === "active_mode" ? select([["walk", "Jalan kaki"], ["bicycle", "Sepeda · rute belum didukung"]])
                    : field === "departure_time" ? select([["morning", "Pagi"], ["midday", "Siang"], ["evening", "Sore atau malam"], ["flexible", "Fleksibel"]])
                    : field === "over_budget" ? select([["mark", "Tandai di atas batas"], ["hide", "Jangan tampilkan di atas batas"]])
                    : <input id={id} type={field === "commute_minutes" ? "number" : "text"} inputMode={field === "commute_minutes" ? "numeric" : undefined}
                        min={field === "commute_minutes" ? 0 : undefined} max={field === "commute_minutes" ? 240 : undefined} value={typeof draft === "string" || typeof draft === "number" ? draft : ""}
                        onChange={(event) => setDraft(event.target.value)} className="input min-h-11 w-full border-ink/25 bg-base-100 text-base text-ink md:text-sm" />}
                {error && <p role="alert" className="text-xs font-semibold text-error">{error}</p>}
            </>}
        <div className="flex gap-2">
            <button type="button" onClick={save} className="btn btn-primary btn-sm min-h-11 rounded-lg px-3">Simpan</button>
            <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm min-h-11 px-2 text-ink">Batal</button>
        </div>
    </div>;
}
