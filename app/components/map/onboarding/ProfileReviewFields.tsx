import { formatRupiah, transportModeLabels } from "@/app/engine/onboarding/demoData";
import { onboardingTaxonomy } from "@/app/engine/extractUserProfile";
import { relocationGoalLabels, type RelocationGoal } from "@/app/engine/lib/relocationGoal";
import { isRecord } from "@/app/engine/lib/zoneGeometry";
import type { PersistedRelocationProfile } from "@/app/engine/lib/relocationProfile";
import ProfileFieldEditor, { editableProfileFields } from "./ProfileFieldEditor";

type ReviewProfile = Pick<PersistedRelocationProfile, "hard_constraints" | "soft_preferences" | "priority_weights">;

const fields: { field: string; label: string; group: "limits" | "preferences"; always?: boolean }[] = [
    { field: "goal", label: "Tujuan", group: "limits", always: true },
    { field: "destination_cities", label: "Kota tujuan", group: "limits", always: true },
    { field: "monthly_budget", label: "Anggaran bulanan", group: "limits", always: true },
    { field: "housing_budget", label: "Batas sewa", group: "limits", always: true },
    { field: "commute_minutes", label: "Batas waktu tempuh", group: "limits", always: true },
    { field: "occupation", label: "Pekerjaan atau bidang karier", group: "preferences" },
    { field: "target_occupations", label: "Jenis pekerjaan", group: "preferences" },
    { field: "target_fields", label: "Bidang pekerjaan", group: "preferences" },
    { field: "study_field", label: "Bidang studi", group: "preferences" },
    { field: "education_level", label: "Jenjang pendidikan", group: "preferences" },
    { field: "work_arrangement", label: "Pola kerja", group: "preferences" },
    { field: "housing_types", label: "Jenis hunian", group: "preferences" },
    { field: "transport_mode", label: "Moda transportasi", group: "preferences", always: true },
    { field: "active_mode", label: "Moda aktif", group: "preferences" },
    { field: "departure_time", label: "Waktu berangkat", group: "preferences" },
    { field: "destination", label: "Lokasi tujuan", group: "preferences", always: true },
    { field: "career_stage", label: "Tahap karier", group: "preferences" },
    { field: "language_preferences", label: "Bahasa", group: "preferences" },
    { field: "deal_breakers", label: "Hal yang dihindari", group: "preferences" },
    { field: "extras", label: "Kebutuhan tambahan", group: "preferences" },
];

const priorityLabels: Record<string, string> = {
    career: "Karier", education: "Pendidikan", housing: "Biaya hunian",
    cost_of_living: "Biaya hidup", commute: "Waktu tempuh", environment: "Lingkungan",
};

function profileValue(profile: ReviewProfile, field: string): unknown {
    return profile.hard_constraints[field] ?? profile.soft_preferences[field];
}

function labelList(values: unknown[], field: string): string {
    return values.map((value) => {
        if (typeof value !== "string") return String(value);
        if (field === "target_occupations") return onboardingTaxonomy.occupations.find((item) => item.id === value)?.label ?? value;
        if (field === "target_fields") return onboardingTaxonomy.sectors.find((item) => item.id === value)?.label ?? value;
        if (field === "destination_cities") return onboardingTaxonomy.areas?.find((item) => item.id === value || item.label === value)?.label ?? value;
        const labels: Record<string, string> = {
            kos: "Kos", apartment: "Apartemen", house: "Rumah", internet: "Internet",
            healthcare: "Layanan kesehatan", quiet: "Lingkungan tenang",
        };
        return labels[value] ?? value;
    }).join(", ");
}

function formatValue(field: string, value: unknown): string {
    if (value === null || value === undefined || Array.isArray(value) && value.length === 0) return "Belum diisi";
    if ((field === "monthly_budget" || field === "housing_budget") && isRecord(value) && typeof value.amount === "number") {
        return `Rp${formatRupiah(value.amount)} per bulan`;
    }
    if (field === "goal" && typeof value === "string") return relocationGoalLabels[value as RelocationGoal] ?? value;
    if (field === "commute_minutes" && typeof value === "number") return `${value} menit sekali jalan`;
    if (field === "destination" && isRecord(value) && typeof value.name === "string") {
        return `${value.name}${value.precision === "point" ? " · titik peta" : ""}`;
    }
    if (field === "transport_mode" && typeof value === "string") return transportModeLabels[value] ?? value;
    if (field === "active_mode") return value === "walk" ? "Jalan kaki" : value === "bicycle" ? "Sepeda" : String(value);
    if (field === "departure_time") return ({ morning: "Pagi", midday: "Siang", evening: "Sore atau malam", flexible: "Fleksibel" } as Record<string, string>)[String(value)] ?? String(value);
    if (Array.isArray(value)) return labelList(value, field);
    if (typeof value === "string" || typeof value === "number") return String(value);
    return "Belum diisi";
}

function isMissing(value: unknown): boolean {
    return value === null || value === undefined || Array.isArray(value) && value.length === 0 || value === "";
}

export default function ProfileReviewFields({ profile, inferredFields = [], providedFields, includePriorities = true, editingField = null,
    onEdit, onSave, onCancelEdit, editError, sourceLabel = "Dari jawabanmu" }: {
        profile: ReviewProfile;
        inferredFields?: string[];
        providedFields?: string[];
        includePriorities?: boolean;
        editingField?: string | null;
        onEdit?: (field: string) => void;
        onSave?: (field: string, value: unknown) => void;
        onCancelEdit?: () => void;
        editError?: string | null;
        sourceLabel?: string;
    }) {
    const shownFields = fields.filter(({ field, always }) => {
        const value = profileValue(profile, field);
        return always || !isMissing(value) || inferredFields.includes(field);
    });

    return <section data-hci-region="profile-review-fields" className="space-y-4">
        {(["limits", "preferences"] as const).map((group) => {
            const rows = shownFields.filter((item) => item.group === group);
            if (!rows.length) return null;
            return <section key={group} aria-label={group === "limits" ? "Batas profil" : "Preferensi profil"}>
                <h2 className="border-t-2 border-ink pt-2 text-sm font-semibold">{group === "limits" ? "Batas utama" : "Preferensi"}</h2>
                <dl className="divide-y divide-rule">
                    {rows.map(({ field, label }) => {
                        const value = profileValue(profile, field);
                        const inferred = inferredFields.includes(field) && !isMissing(value);
                        const missing = isMissing(value);
                        const defaulted = !missing && providedFields !== undefined && !providedFields.includes(field) && !inferred;
                        const canEdit = !!onEdit && editableProfileFields.has(field);
                        return <div key={field} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 py-2 text-sm">
                            <dt className="text-ink-muted">{label}</dt>
                            <dd className="col-span-2 min-w-0 break-words font-semibold text-ink">
                                {editingField === field && onSave
                                    ? <ProfileFieldEditor field={field} label={label} value={value}
                                        onSave={(nextValue) => onSave(field, nextValue)} onCancel={onCancelEdit ?? (() => undefined)} />
                                    : formatValue(field, value)}
                            </dd>
                            {editingField !== field && <dd className="col-start-2 row-start-1 flex items-start gap-1.5">
                                <span className={`badge badge-sm whitespace-nowrap ${missing || defaulted ? "badge-outline" : inferred ? "badge-primary badge-soft" : "badge-neutral"}`}>
                                    {missing ? "Belum diisi" : inferred ? "Disimpulkan" : defaulted ? "Default Jejak" : sourceLabel}
                                </span>
                                {canEdit && <button type="button" onClick={() => onEdit(field)} aria-label={`Ubah ${label}`}
                                    className="btn btn-ghost btn-xs min-h-9 px-1 text-primary underline">Ubah</button>}
                            </dd>}
                        </div>;
                    })}
                </dl>
            </section>;
        })}
        {includePriorities && <section aria-label="Bobot prioritas">
            <h2 className="border-t-2 border-ink pt-2 text-sm font-semibold">Prioritas</h2>
            <dl className="divide-y divide-rule">
                {Object.entries(priorityLabels).map(([field, label]) => {
                    const value = profile.priority_weights[field];
                    const inferred = inferredFields.includes("priorities");
                    const supported = field !== "environment";
                    return <div key={field} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 py-2 text-sm">
                        <dt className="text-ink-muted">{label}</dt>
                        <dd className="col-start-2 row-start-1 flex items-center gap-1.5">
                            <span className="font-semibold tabular-nums">{typeof value === "number" ? `${Math.round(value * 100)}%` : "Belum diatur"}</span>
                            <span className={`badge badge-sm whitespace-nowrap ${!supported ? "badge-outline" : inferred ? "badge-primary badge-soft" : "badge-neutral"}`}>
                                {!supported ? "Belum dinilai" : inferred ? "Disimpulkan" : sourceLabel}
                            </span>
                        </dd>
                        {!supported && <dd className="col-span-2 text-xs text-ink-muted">Data lingkungan belum tersedia untuk urutan kecamatan.</dd>}
                    </div>;
                })}
            </dl>
            {onEdit && <button type="button" onClick={() => onEdit("priorities")} className="btn btn-ghost min-h-11 px-1 text-xs text-primary underline">Ubah prioritas</button>}
        </section>}
        {editError && <p role="alert" className="text-sm font-semibold text-error">{editError}</p>}
    </section>;
}
