"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CreditCard, Layers, LockKeyhole, MapPin, UserRound } from "lucide-react";
import type { AccountSummary } from "../engine/controller/userServerController";
import UserHeader from "../components/UserHeader";
import { onboardingTaxonomy } from "../engine/extractUserProfile";
import { getOnboardingData, type OnboardingDataResponse } from "../engine/lib/onboardingApi";
import { validateLF05Proposal, type LF05ProposedProfile } from "../engine/lib/lf05Validation";
import { isRelocationGoal, relocationGoalLabels } from "../engine/lib/relocationGoal";
import { isStoredRelocationProfile } from "../engine/lib/relocationProfileCache";
import { normalizeRelocationProfileInputs, type PersistedRelocationProfile, type StoredRelocationProfile } from "../engine/lib/relocationProfile";
import { transportModeLabels } from "../engine/onboarding/demoData";
import { evaluateLiveOnboarding, profilePreviewPreferences } from "../engine/onboarding/livePreview";
import { useUserProfileStore } from "../stores/userStores";
import SignOutButton from "./SignOutButton";
import UserSettings, { type SettingsTab } from "./UserSettings";
import { cloneProfile, displayedWeights, formatProfileValue, parseAmount, profileFieldsDiffer, profileStory, summarizeProfileChanges, updatePriority, updateProfileField, type PriorityKey } from "./profileEditorModel";

type Props = {
    userId: string;
    email: string | null;
    account: AccountSummary | null;
    savedProfile: StoredRelocationProfile | null;
    loadError: string | null;
};

type ActiveTab = SettingsTab;
type ValidationErrors = Record<string, string>;

const priorityNames: Record<PriorityKey, string> = {
    career: "Karier",
    education: "Pendidikan",
    cost: "Biaya hidup",
    mobility: "Mobilitas",
    environment: "Lingkungan",
};

const sectors = onboardingTaxonomy.sectors;
const occupations = onboardingTaxonomy.occupations;
const fieldClass = "input input-bordered min-h-11 w-full border-ink/25 bg-base-100 text-ink focus:border-primary focus:outline-primary";
const selectClass = "select select-bordered min-h-11 w-full border-ink/25 bg-base-100 text-ink focus:border-primary focus:outline-primary";
const buttonClass = "btn min-h-11 border-ink/40 bg-base-100 text-ink hover:border-ink hover:bg-ink hover:text-base-100";
const inputIds: Record<string, string> = {
    "Tujuan pindah": "goal", Pekerjaan: "occupation", "Bidang kerja": "sector", "Bidang studi": "study-field",
    Pendidikan: "education-level", "Kota tujuan": "destination-city", "Anggaran bulanan": "monthly-budget",
    "Batas sewa": "housing-budget", "Batas perjalanan": "commute-minutes", "Di atas anggaran": "over-budget",
    "Tipe hunian": "housing-kos", "Moda transportasi": "transport-mode", "Lokasi tujuan": "destination-name",
    "Waktu berangkat": "departure-time",
};

function budgetAmount(value: unknown): number | null {
    return value && typeof value === "object" && "amount" in value && typeof value.amount === "number" ? value.amount : null;
}

function ProfileSection({ title, children, rows = true, note }: { title: string; children: ReactNode; rows?: boolean; note?: string }) {
    return <section className="border-t-2 border-ink pt-3" aria-label={title}>
        <h2 className="mb-2 font-sans text-xl font-bold text-ink">{title}</h2>
        {rows ? <dl className="divide-y divide-rule">{children}</dl> : <div>{children}</div>}
        {note && <p className="mt-2 text-xs text-ink-muted">{note}</p>}
    </section>;
}

function ProfileRow({ label, value, editing, editor, error, onToggle, disabled = false }: {
    label: string; value: ReactNode; editing: boolean; editor?: ReactNode; error?: string; onToggle: () => void; disabled?: boolean;
}) {
    const errorId = errorIdFor(label);
    return <div data-profile-field={inputIds[label]} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-1.5 sm:grid-cols-[minmax(8rem,.7fr)_minmax(0,1fr)_auto]">
        <dt className="text-sm font-semibold text-ink"><label htmlFor={inputIds[label]}>{label}</label></dt>
        <dd className="col-start-1 row-start-2 min-w-0 text-sm text-ink sm:col-start-2 sm:row-start-1">{editing ? editor : <span className="break-words">{value || "Belum diisi"}</span>}</dd>
        <button type="button" className="btn btn-ghost col-start-2 row-span-2 row-start-1 min-h-11 min-w-14 px-2 text-primary sm:col-start-3 sm:row-span-1" onClick={onToggle} disabled={disabled} aria-expanded={editing} aria-label={`${editing ? "Tutup" : "Ubah"} ${label}`}>{editing ? "Tutup" : "Ubah"}</button>
        {error && <div className="col-span-2 text-sm text-error sm:col-span-3"><span id={errorId}>{error}</span></div>}
    </div>;
}

function errorIdFor(label: string) {
    return `${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-error`;
}

function SummaryReadRow({ label, value }: { label: string; value: unknown }) {
    return <div className="grid grid-cols-[minmax(8rem,.7fr)_minmax(0,1fr)] gap-3 py-2 text-sm"><dt className="font-semibold text-ink">{label}</dt><dd className="break-words text-ink-muted">{formatProfileValue(value)}</dd></div>;
}

function emptyValue(value: unknown): boolean {
    return value === undefined || value === null || value === "" || Array.isArray(value) && value.length === 0;
}

export default function RelocationProfileEditor({ userId, email, account, savedProfile, loadError }: Props) {
    const [tab, setTab] = useState<ActiveTab>("profile");
    const [original, setOriginal] = useState<PersistedRelocationProfile | null>(savedProfile ? cloneProfile(savedProfile.profile) : null);
    const [draft, setDraft] = useState<PersistedRelocationProfile | null>(savedProfile ? cloneProfile(savedProfile.profile) : null);
    const [revision, setRevision] = useState(savedProfile?.revision ?? null);
    const [story, setStory] = useState("");
    const [storyDialogOpen, setStoryDialogOpen] = useState(false);
    const [proposal, setProposal] = useState<LF05ProposedProfile | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [confirmedProposal, setConfirmedProposal] = useState(false);
    const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
    const [cityCatalog, setCityCatalog] = useState<OnboardingDataResponse | null>(null);
    const [previewByCity, setPreviewByCity] = useState<Record<string, OnboardingDataResponse>>({});
    const [previewLoadingCities, setPreviewLoadingCities] = useState<string[]>([]);
    const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
    const [catalogError, setCatalogError] = useState("");
    const [editingField, setEditingField] = useState("");
    const [numberValues, setNumberValues] = useState<Record<string, string>>({});
    const [invalidNumericFields, setInvalidNumericFields] = useState<Record<string, boolean>>({});
    const [recalculating, setRecalculating] = useState(false);
    const [savedButFailed, setSavedButFailed] = useState(false);
    const [profileJustSaved, setProfileJustSaved] = useState(false);
    const [pending, setPending] = useState(false);
    const [busyLabel, setBusyLabel] = useState("");
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    const [errors, setErrors] = useState<ValidationErrors>({});
    const [attempted, setAttempted] = useState(false);
    const storyDialogRef = useRef<HTMLDialogElement>(null);
    const reviewDialogRef = useRef<HTMLDialogElement>(null);
    const requestLock = useRef(false);
    const answeredRefinementQuestions = useRef<{ question: string; answer: string }[]>([]);
    const requestedCityIds = useRef(new Set<string>());
    const setStoreProfile = useUserProfileStore((state) => state.setRelocationProfile);

    const dirty = !!draft && !!original && (profileFieldsDiffer(draft, original) || story.trim().length > 0 || Object.values(invalidNumericFields).some(Boolean));
    const hasPriorityWeights = !!draft && Object.values(draft.priority_weights).some((weight) => weight > 0);
    const keepEnvironmentPriority = (original?.priority_weights.environment ?? 0) > 0;
    const displayed = draft ? displayedWeights(draft, keepEnvironmentPriority) : null;
    const beforeCityId = resolveCityId(original, cityCatalog?.cities ?? []);
    const afterCityId = resolveCityId(draft, cityCatalog?.cities ?? []);
    const beforeData = beforeCityId ? previewByCity[beforeCityId] ?? null : null;
    const afterData = afterCityId ? previewByCity[afterCityId] ?? null : null;
    const beforePreview = getCount(original, cityCatalog?.cities ?? [], beforeData);
    const afterPreview = getCount(draft, cityCatalog?.cities ?? [], afterData);
    const beforeSample = previewUsesSampleData(original, cityCatalog?.cities ?? [], beforeData);
    const afterSample = previewUsesSampleData(draft, cityCatalog?.cities ?? [], afterData);
    const changeSummary = summarizeProfileChanges(original, draft, 2, keepEnvironmentPriority);
    const savedMapHref = `/map?profile=updated&revision=${revision ?? ""}`;

    useEffect(() => {
        if (!savedProfile) return;
        setStoreProfile(userId, savedProfile);
    }, [savedProfile, setStoreProfile, userId]);

    useEffect(() => {
        if (storyDialogOpen) storyDialogRef.current?.showModal();
        else if (storyDialogRef.current?.open) storyDialogRef.current.close();
    }, [storyDialogOpen]);

    useEffect(() => {
        if (reviewOpen) reviewDialogRef.current?.showModal();
        else if (reviewDialogRef.current?.open) reviewDialogRef.current.close();
    }, [reviewOpen]);

    useEffect(() => {
        if (!dirty) return;
        const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); };
        window.addEventListener("beforeunload", preventClose);
        return () => window.removeEventListener("beforeunload", preventClose);
    }, [dirty]);

    useEffect(() => {
        const controller = new AbortController();
        void getOnboardingData(null, controller.signal).then((data) => {
            setCityCatalog(data);
            setCatalogError("");
        }).catch(() => {
            if (!controller.signal.aborted) setCatalogError("Daftar kota belum tersedia.");
        });
        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!cityCatalog) return;
        const cityIds = [...new Set([beforeCityId, afterCityId].filter((id): id is string => !!id))];
        const missing = cityIds.filter((id) => !previewByCity[id] && !requestedCityIds.current.has(id));
        if (!missing.length) return;
        missing.forEach((id) => requestedCityIds.current.add(id));
        setPreviewLoadingCities((current) => [...new Set([...current, ...missing])]);
        void Promise.all(missing.map(async (cityId) => {
            try {
                const data = await getOnboardingData(cityId, AbortSignal.timeout(30_000));
                setPreviewByCity((current) => ({ ...current, [cityId]: data }));
                setPreviewErrors((current) => { const next = { ...current }; delete next[cityId]; return next; });
            } catch {
                setPreviewErrors((current) => ({ ...current, [cityId]: "Hitungan kecamatan belum tersedia." }));
            } finally {
                setPreviewLoadingCities((current) => current.filter((id) => id !== cityId));
            }
        }));
    }, [cityCatalog, beforeCityId, afterCityId, previewByCity]);

    function changeDraft(next: PersistedRelocationProfile) {
        if (pending) return;
        setDraft(next);
        setProposal(null);
        setConfirmedProposal(false);
        setReviewOpen(false);
        setErrors({});
        setError("");
        setStatus("");
        answeredRefinementQuestions.current = [];
    }

    function setField(group: "hard_constraints" | "soft_preferences", key: string, value: unknown) {
        if (!draft) return;
        changeDraft(updateProfileField(draft, group, key, value));
    }

    function setTransportMode(value: string) {
        if (!draft) return;
        const activeMode = value === "walk" || value === "bicycle" ? value : null;
        changeDraft({ ...draft, soft_preferences: { ...draft.soft_preferences,
            transport_mode: activeMode ? "active" : value || null, active_mode: activeMode } });
    }

    function validateProfile(profile: PersistedRelocationProfile): ValidationErrors {
        const next: ValidationErrors = {};
        for (const key of Object.keys(invalidNumericFields)) {
            if (invalidNumericFields[key]) next[key] = errors[key] ?? "Masukkan angka bulat yang valid.";
        }
        const goal = profile.hard_constraints.goal ?? profile.soft_preferences.goal;
        if (!goal) next.goal = "Pilih tujuan pindahmu.";
        for (const key of ["monthly_budget", "housing_budget"] as const) {
            const amount = budgetAmount(profile.hard_constraints[key]);
            if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0 || amount > 1_000_000_000)) next[key] = "Masukkan jumlah bulat yang valid, maksimal Rp1.000.000.000.";
        }
        const commute = profile.hard_constraints.commute_minutes;
        if (commute !== null && commute !== undefined && (!Number.isInteger(commute) || Number(commute) < 0 || Number(commute) > 240)) next.commute_minutes = "Masukkan waktu antara 0 dan 240 menit.";
        if (!Object.values(profile.priority_weights).some((weight) => weight > 0) || Math.abs(Object.values(profile.priority_weights).reduce((sum, weight) => sum + weight, 0) - 1) > 0.001) {
            next.priorities = "Atur prioritas hingga bobotnya berjumlah 100%.";
        }
        return next;
    }

    function resetDraft() {
        if (!original || pending) return;
        setDraft(cloneProfile(original));
        setStory("");
        answeredRefinementQuestions.current = [];
        setNumberValues({});
        setInvalidNumericFields({});
        setProposal(null);
        setReviewOpen(false);
        setConfirmedProposal(false);
        setErrors({});
        setError("");
        setStatus("Perubahan dibatalkan. Profil tersimpan belum berubah.");
    }

    async function sendRefinement(answers: { question: string; answer: string }[] = []) {
        if (!draft || revision === null || requestLock.current) return;
        const validation = validateProfile(draft);
        setAttempted(true);
        setErrors(validation);
        if (Object.keys(validation).length) {
            setError("Periksa tujuan dan bobot prioritas sebelum menyimpan.");
            return;
        }
        setPending(true);
        requestLock.current = true;
        setBusyLabel("Meninjau perubahan…");
        setError("");
        setStatus("");
        const allAnswers = [...answeredRefinementQuestions.current.filter(({ question }) =>
            !answers.some((answer) => answer.question === question)), ...answers];
        try {
            const response = await fetch("/api/lf05", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    mode: "refinement", draft, base_revision: revision,
                    message: story.trim() || undefined, language: "id", clarification_answers: allAnswers,
                }),
                signal: AbortSignal.timeout(120_000),
            });
            const result: unknown = await response.json().catch(() => null);
            if (!response.ok || !result || typeof result !== "object" || !("profile" in result)) {
                const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Perubahan belum dapat ditinjau. Coba lagi.";
                throw new Error(message);
            }
            const proposed = validateLF05Proposal(result.profile, onboardingTaxonomy);
            answeredRefinementQuestions.current = allAnswers;
            setProposal(proposed);
            setConfirmedProposal(false);
            setClarificationAnswers({});
            const proposedContent = normalizeRelocationProfileInputs(proposed.hard_constraints, proposed.soft_preferences, proposed.priority_weights);
            const draftContent = normalizeRelocationProfileInputs(draft.hard_constraints, draft.soft_preferences, draft.priority_weights);
            const needsReview = proposed.inferred_fields.length > 0 || profileFieldsDiffer(proposedContent, draftContent) || proposed.clarification_questions.length > 0;
            if (needsReview) {
                setReviewOpen(true);
                setStatus("Jejak menemukan perubahan tambahan. Tinjau sebelum menyimpan.");
            } else {
                await persistProposal(proposed, true);
            }
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Perubahan belum dapat ditinjau. Coba lagi.");
        } finally {
            requestLock.current = false;
            setPending(false);
            setBusyLabel("");
        }
    }

    async function persistProposal(nextProposal: LF05ProposedProfile, inheritedLock = false) {
        if (revision === null || requestLock.current && !inheritedLock) return;
        setPending(true);
        if (!inheritedLock) requestLock.current = true;
        setBusyLabel("Menyimpan dan menghitung ulang…");
        setError("");
        setStatus("");
        setReviewOpen(false);
        let persisted = false;
        try {
            const response = await fetch("/api/user/relocation-profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ proposal: nextProposal, confirmed_fields: nextProposal.inferred_fields, base_revision: revision }),
                signal: AbortSignal.timeout(30_000),
            });
            const result: unknown = await response.json().catch(() => null);
            if (!response.ok || !result || typeof result !== "object" || !("profile" in result) || !isStoredRelocationProfile(result.profile)) {
                const message = result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : "Profil belum tersimpan. Coba lagi.";
                throw new Error(message);
            }
            const saved = result.profile;
            persisted = true;
            setProfileJustSaved(true);
            setSavedButFailed(false);
            setStoreProfile(userId, saved);
            setOriginal(cloneProfile(saved.profile));
            setDraft(cloneProfile(saved.profile));
            setRevision(saved.revision);
            setStory("");
            answeredRefinementQuestions.current = [];
            setNumberValues({});
            setInvalidNumericFields({});
            setProposal(null);
            setConfirmedProposal(false);
            setStatus("Profil tersimpan. Menghitung ulang kecamatan…");
            const calculation = await calculateSavedProfile(saved.profile, true);
            setSavedButFailed(false);
            setStatus(calculation.state === "open"
                ? "Profil tersimpan. Pilih kota untuk melihat kecamatan."
                : calculation.state === "unsupported"
                ? "Profil tersimpan. Kota ini belum tersedia untuk hitungan kecamatan."
                : calculation.count === null
                ? "Profil tersimpan. Belum ada hitungan kecamatan untuk kota ini."
                : "Profil tersimpan dan hitungan kecamatan diperbarui.");
        } catch (cause) {
            // A network failure after the persistence response is intentionally separate from save errors.
            if (persisted) {
                setSavedButFailed(true);
                setStatus("Profil tersimpan, tetapi hitungan kecamatan belum berhasil.");
                setError(cause instanceof Error ? cause.message : "Perhitungan ulang belum berhasil.");
            } else {
                setProposal(null);
                setReviewOpen(false);
                setError(cause instanceof Error ? cause.message : "Profil belum tersimpan. Coba lagi.");
            }
        } finally {
            if (!inheritedLock) requestLock.current = false;
            setPending(false);
            setBusyLabel("");
        }
    }

    async function retryRecalculation() {
        if (!draft || requestLock.current || !original) return;
        setPending(true);
        requestLock.current = true;
        setRecalculating(true);
        setBusyLabel("Menghitung ulang kecamatan…");
        setError("");
        try {
            const calculation = await calculateSavedProfile(original, true);
            if (calculation.state !== "ready") throw new Error("Hitungan kecamatan belum tersedia.");
            setSavedButFailed(false);
            setStatus(calculation.count === null ? "Profil tersimpan. Belum ada hitungan kecamatan untuk kota ini." : "Hitungan kecamatan diperbarui.");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Perhitungan ulang belum berhasil.");
        } finally {
            requestLock.current = false;
            setPending(false);
            setRecalculating(false);
            setBusyLabel("");
        }
    }

    function onSave(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (storyDialogOpen) setStoryDialogOpen(false);
        void sendRefinement();
    }

    async function refreshCityPreview(cityId: string) {
        setPreviewLoadingCities((current) => [...new Set([...current, cityId])]);
        setPreviewErrors((current) => { const next = { ...current }; delete next[cityId]; return next; });
        try {
            const data = await getOnboardingData(cityId, AbortSignal.timeout(30_000));
            requestedCityIds.current.add(cityId);
            setPreviewByCity((current) => ({ ...current, [cityId]: data }));
            return data;
        } catch (cause) {
            requestedCityIds.current.add(cityId);
            setPreviewErrors((current) => ({ ...current, [cityId]: "Hitungan kecamatan belum tersedia." }));
            throw cause;
        } finally {
            setPreviewLoadingCities((current) => current.filter((id) => id !== cityId));
        }
    }

    async function calculateSavedProfile(profile: PersistedRelocationProfile, fresh: boolean) {
        const targetCities = profile.hard_constraints.destination_cities ?? profile.soft_preferences.destination_cities;
        if (!Array.isArray(targetCities) || !targetCities.some((city) => typeof city === "string" && city.trim())) {
            return { state: "open" as const, count: null };
        }
        let catalog = cityCatalog;
        if (!catalog) {
            catalog = await getOnboardingData(null, AbortSignal.timeout(30_000));
            setCityCatalog(catalog);
        }
        const cityId = resolveCityId(profile, catalog.cities);
        if (!cityId) return { state: "unsupported" as const, count: null };
        const data = fresh || !previewByCity[cityId] ? await refreshCityPreview(cityId) : previewByCity[cityId];
        return { state: "ready" as const, count: getCount(profile, catalog.cities, data) };
    }

    function protectNavigation(event: { preventDefault: () => void }) {
        if (dirty && !window.confirm("Perubahanmu belum disimpan. Tetap tinggalkan halaman?")) event.preventDefault();
    }

    function showEmpty(label: string, value: unknown) {
        return emptyValue(value) ? <span className="ml-2 text-sm text-ink-muted">{label}: belum diisi</span> : null;
    }

    function setNumber(group: "hard_constraints" | "soft_preferences", key: string, raw: string, limit: number) {
        if (!draft) return;
        setNumberValues((current) => ({ ...current, [key]: raw }));
        const parsed = parseAmount(raw, limit);
        if (!parsed.valid) {
            setInvalidNumericFields((current) => ({ ...current, [key]: true }));
            setErrors((current) => ({ ...current, [key]: `Masukkan angka bulat antara 0 dan ${new Intl.NumberFormat("id-ID").format(limit)}.` }));
            return;
        }
        setInvalidNumericFields((current) => ({ ...current, [key]: false }));
        setErrors((current) => Object.fromEntries(Object.entries(current).filter(([name]) => name !== key)));
        const amountValue = parsed.value;
        const value = amountValue === null ? null : key === "monthly_budget" || key === "housing_budget"
            ? { amount: amountValue, currency: "IDR", period: "month" } : amountValue;
        setField(group, key, value);
    }

    function changeGoal(goal: "work" | "study" | "both") {
        if (!draft) return;
        const next = updateProfileField(draft, "hard_constraints", "goal", goal);
        const soft = { ...next.soft_preferences };
        delete soft.goal;
        changeDraft({ ...next, soft_preferences: soft });
    }

    function toggleHousing(type: string, checked: boolean) {
        if (!draft) return;
        const existing = Array.isArray(draft.soft_preferences.housing_types) ? draft.soft_preferences.housing_types.filter((item): item is string => typeof item === "string") : [];
        const selected = checked ? [...new Set([...existing, type])] : existing.filter((item) => item !== type);
        setField("soft_preferences", "housing_types", selected);
    }

    function editDestinationName(name: string) {
        if (!draft) return;
        const current = draft.soft_preferences.destination ?? draft.hard_constraints.destination;
        if (!current || typeof current !== "object") {
            setField("soft_preferences", "destination", name ? { name, precision: "area" } : null);
            return;
        }
        const destination = current as Record<string, unknown>;
        const value = !name ? null : name === destination.name ? { ...destination } : { name, precision: "area" };
        const group = Object.hasOwn(draft.hard_constraints, "destination") ? "hard_constraints" : "soft_preferences";
        setField(group, "destination", value);
    }

    const accountPanel = <UserSettings email={email} account={account} hasSavedProfile={loadError ? null : !!savedProfile || profileJustSaved}
        hasUnsavedChanges={dirty} activeTab={tab} onNavigate={protectNavigation} onCreateProfile={protectNavigation} onReturnToProfile={() => setTab("profile")}>
        <div onClickCapture={(event) => {
            if (dirty && !window.confirm("Perubahanmu belum disimpan. Tetap keluar dari akun?")) {
                event.preventDefault();
                event.stopPropagation();
            }
        }}><SignOutButton userId={userId} /></div>
    </UserSettings>;

    if (loadError) return <Shell account={account} onNavigate={protectNavigation} activeTab={tab} onTabChange={setTab}>
        {tab !== "profile" ? accountPanel : <>
        <div className="mx-auto max-w-3xl px-5 py-16" role="alert">
            <h1 className="font-sans text-3xl font-bold text-ink">Profil relokasimu belum bisa dimuat</h1>
            <p className="mt-3 text-ink-muted">Profil tersimpan tidak berubah. Coba muat ulang halaman.</p>
            <p className="mt-2 text-sm text-error">{loadError}</p>
            <button type="button" className={`${buttonClass} mt-6`} onClick={() => window.location.reload()}>Coba lagi</button>
        </div></>}
    </Shell>;

    if (!savedProfile || !draft) return <Shell account={account} onNavigate={protectNavigation} activeTab={tab} onTabChange={setTab}>
        {tab !== "profile" ? accountPanel : <>
        <div className="mx-auto max-w-3xl px-5 py-16">
            <h1 className="font-sans text-3xl font-bold text-ink">Belum ada profil relokasi</h1>
            <p className="mt-3 max-w-xl text-ink-muted">Mulai isi rencana pindahmu di peta. Setelah tersimpan, semua preferensi bisa kamu ubah di sini.</p>
            <Link href="/map?welcome=1" onNavigate={protectNavigation} className="btn btn-primary mt-6 min-h-12">Buat profil</Link>
        </div></>}
    </Shell>;

    const hard = draft.hard_constraints;
    const soft = draft.soft_preferences;
    const transportKey = soft.transport_mode === "active" && (soft.active_mode === "walk" || soft.active_mode === "bicycle") ? soft.active_mode : typeof soft.transport_mode === "string" ? soft.transport_mode : "";
    const goal = hard.goal ?? soft.goal;
    const cityValues = Array.isArray(hard.destination_cities) ? hard.destination_cities : [];
    const citySelected = typeof cityValues[0] === "string" ? cityValues[0] : "";
    const goalHasWork = goal === "work" || goal === "both";
    const goalHasStudy = goal === "study" || goal === "both";
    const selectedField = Array.isArray(soft.target_fields) ? String(soft.target_fields[0] ?? "") : "";
    const selectedOccupation = Array.isArray(soft.target_occupations) ? String(soft.target_occupations[0] ?? "") : "";
    const cityIsUnknown = !!citySelected && !afterCityId;
    const housingTypes = Array.isArray(soft.housing_types) ? soft.housing_types.filter((item): item is string => typeof item === "string") : [];
    const destinationValue = soft.destination ?? hard.destination;
    const destinationName = destinationValue && typeof destinationValue === "object" && "name" in destinationValue && typeof destinationValue.name === "string" ? destinationValue.name : "";
    const valueForAmount = (key: "monthly_budget" | "housing_budget") => numberValues[key] ?? String(budgetAmount(hard[key]) ?? "");
    const selectedHousingLabel = housingTypes.length ? housingTypes.map((type) => ({ kos: "Kos", apartment: "Apartemen", house: "Rumah", unsure: "Belum yakin" } as Record<string, string>)[type] ?? type).join(", ") : "Belum diisi";
    const toggleEditing = (key: string) => setEditingField((current) => current === key ? "" : key);
    const showMissingCity = !citySelected ? "Pilih kota untuk melihat kecamatan." : cityIsUnknown ? "Kota tersimpan belum tersedia untuk hitungan kecamatan." : "";
    const activePreviewError = (beforeCityId && previewErrors[beforeCityId]) || (afterCityId && previewErrors[afterCityId]) || "";
    const activePreviewLoading = [beforeCityId, afterCityId].some((id) => id && previewLoadingCities.includes(id));

    return <Shell account={account} onNavigate={protectNavigation} activeTab={tab} onTabChange={setTab} mapHref={profileJustSaved ? savedMapHref : "/map"}>
        {tab !== "profile" ? accountPanel : <div className="mx-auto max-w-[1180px] px-5 pb-36 pt-7 sm:px-8 lg:px-10">
            <>
                <header className="mb-6">
                    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">Profil relokasi</p>
                     <h1 className="mt-2 font-sans text-[clamp(2rem,4vw,3rem)] font-bold leading-tight text-ink">Jejakmu bisa berubah</h1>
                     <p className="mt-2 text-sm text-ink-muted">Ubah preferensimu, lalu simpan untuk menghitung ulang kecamatan yang cocok.</p>
                </header>

                <div className="mb-6 flex flex-col justify-between gap-2 border-y border-primary/20 bg-primary/5 px-4 py-3 sm:flex-row sm:items-center">
                    <p className="text-sm leading-relaxed text-ink">{profileStory(draft, cityCatalog?.cities)}</p>
                    <button type="button" className="btn btn-ghost min-h-11 shrink-0 px-2 text-primary" disabled={pending} onClick={() => setStoryDialogOpen(true)}>Tulis ulang</button>
                </div>

                <form id="relocation-profile-form" onSubmit={onSave} noValidate aria-busy={pending}>
                    <fieldset disabled={pending} className="grid gap-x-10 gap-y-8 md:grid-cols-2">
                        <legend className="sr-only">Preferensi profil relokasi</legend>
                        <ProfileSection title="Tujuan">
                            <ProfileRow label="Tujuan pindah" value={isRelocationGoal(goal) ? relocationGoalLabels[goal] : "Belum ditentukan"} editing={editingField === "goal"} error={attempted ? errors.goal : undefined} onToggle={() => toggleEditing("goal")} editor={<select id="goal" name="goal" className={selectClass} value={typeof goal === "string" ? goal : ""} aria-invalid={attempted && !!errors.goal} aria-describedby={attempted && errors.goal ? errorIdFor("Tujuan pindah") : undefined} onChange={(event) => changeGoal(event.target.value as "work" | "study" | "both")}><option value="">Belum ditentukan</option><option value="work">Kerja</option><option value="study">Kuliah</option><option value="both">Kerja dan kuliah</option></select>} />
                            {goalHasWork && <ProfileRow label="Pekerjaan" value={typeof soft.occupation === "string" ? soft.occupation : occupations.find(({ id }) => id === selectedOccupation)?.label ?? formatProfileValue(soft.target_occupations)} editing={editingField === "occupation"} onToggle={() => toggleEditing("occupation")} editor={<select id="occupation" name="occupation" className={selectClass} value={selectedOccupation} onChange={(event) => { const item = occupations.find(({ id }) => id === event.target.value); let next = updateProfileField(draft, "soft_preferences", "target_occupations", event.target.value ? [event.target.value] : []); next = updateProfileField(next, "soft_preferences", "occupation", item?.label ?? null); changeDraft(next); }}><option value="">Belum diisi</option>{selectedOccupation && !occupations.some(({ id }) => id === selectedOccupation) && <option value={selectedOccupation}>{selectedOccupation} · tersimpan</option>}{occupations.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>} />}
                            {goalHasWork && <ProfileRow label="Bidang kerja" value={selectedField ? sectors.find(({ id }) => id === selectedField)?.label ?? selectedField : "Belum diisi"} editing={editingField === "sector"} onToggle={() => toggleEditing("sector")} editor={<select id="sector" name="target_fields" className={selectClass} value={selectedField} onChange={(event) => setField("soft_preferences", "target_fields", event.target.value ? [event.target.value] : [])}><option value="">Belum diisi</option>{selectedField && !sectors.some(({ id }) => id === selectedField) && <option value={selectedField}>{selectedField} ? tersimpan</option>}{sectors.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>} />}
                            {goalHasStudy && <>
                                <ProfileRow label="Bidang studi" value={formatProfileValue(soft.study_field)} editing={editingField === "study_field"} onToggle={() => toggleEditing("study_field")} editor={<input id="study-field" name="study_field" className={fieldClass} maxLength={160} value={typeof soft.study_field === "string" ? soft.study_field : ""} onChange={(event) => setField("soft_preferences", "study_field", event.target.value || null)} />} />
                                <ProfileRow label="Pendidikan" value={formatProfileValue(soft.education_level)} editing={editingField === "education_level"} onToggle={() => toggleEditing("education_level")} editor={<input id="education-level" name="education_level" className={fieldClass} maxLength={100} value={typeof soft.education_level === "string" ? soft.education_level : ""} onChange={(event) => setField("soft_preferences", "education_level", event.target.value || null)} />} />
                            </>}
                            <ProfileRow label="Kota tujuan" value={afterCityId ? cityName(afterCityId, cityCatalog?.cities ?? []) : citySelected ? `${cityValues.join(", ")} · tersimpan` : "Belum dipilih"} editing={editingField === "city"} onToggle={() => toggleEditing("city")} editor={<select id="destination-city" name="destination_cities" className={selectClass} value={afterCityId ?? citySelected} onChange={(event) => setField("hard_constraints", "destination_cities", event.target.value ? [event.target.value] : [])}><option value="">Belum dipilih</option>{cityIsUnknown && <option value={citySelected}>{citySelected} · tersimpan</option>}{(cityCatalog?.cities ?? []).map((city) => <option key={city.city_id} value={city.city_id}>{city.city_name}</option>)}</select>} />
                        </ProfileSection>

                        <ProfileSection title="Batas keras" note="Toleransi anggaran 10%">
                            {([ ["monthly_budget", "Anggaran bulanan"], ["housing_budget", "Batas sewa"] ] as const).map(([key, label]) => <ProfileRow key={key} label={label} value={formatProfileValue(hard[key])} editing={editingField === key} error={errors[key]} onToggle={() => toggleEditing(key)} editor={<input id={inputIds[label]} name={key} type="number" min="0" max="1000000000" step="1" inputMode="numeric" className={fieldClass} value={valueForAmount(key)} aria-invalid={!!errors[key]} aria-describedby={errors[key] ? errorIdFor(label) : undefined} onChange={(event) => setNumber("hard_constraints", key, event.target.value, 1_000_000_000)} />} />)}
                            <ProfileRow label="Batas perjalanan" value={typeof hard.commute_minutes === "number" ? `${hard.commute_minutes} menit` : "Belum diisi"} editing={editingField === "commute_minutes"} error={errors.commute_minutes} onToggle={() => toggleEditing("commute_minutes")} editor={<input id="commute-minutes" name="commute_minutes" type="number" min="0" max="240" step="1" inputMode="numeric" className={fieldClass} value={numberValues.commute_minutes ?? String(typeof hard.commute_minutes === "number" ? hard.commute_minutes : "")} aria-invalid={!!errors.commute_minutes} aria-describedby={errors.commute_minutes ? errorIdFor("Batas perjalanan") : undefined} onChange={(event) => setNumber("hard_constraints", "commute_minutes", event.target.value, 240)} />} />
                            <ProfileRow label="Di atas anggaran" value={soft.over_budget === "hide" ? "Sembunyikan" : soft.over_budget === "mark" ? "Tampilkan dan tandai" : "Belum diisi"} editing={editingField === "over_budget"} onToggle={() => toggleEditing("over_budget")} editor={<select id="over-budget" name="over_budget" className={selectClass} value={typeof soft.over_budget === "string" ? soft.over_budget : "mark"} onChange={(event) => setField("soft_preferences", "over_budget", event.target.value)}><option value="mark">Tampilkan dan tandai</option><option value="hide">Sembunyikan</option></select>} />
                        </ProfileSection>

                        <ProfileSection title="Perjalanan" note="Estimasi rute belum tersedia">
                            <ProfileRow label="Tipe hunian" value={selectedHousingLabel} editing={editingField === "housing_types"} onToggle={() => toggleEditing("housing_types")} editor={<fieldset className="flex flex-wrap gap-x-4 gap-y-1"><legend className="sr-only">Tipe hunian pilihan</legend>{[["kos", "Kos"], ["apartment", "Apartemen"], ["house", "Rumah"], ["unsure", "Belum yakin"]].map(([value, label]) => <label key={value} className="inline-flex min-h-11 items-center gap-2 text-sm"><input id={value === "kos" ? "housing-kos" : undefined} type="checkbox" name="housing_types" value={value} className="checkbox checkbox-primary" checked={housingTypes.includes(value)} onChange={(event) => toggleHousing(value, event.target.checked)} />{label}</label>)}</fieldset>} />
                            <ProfileRow label="Moda transportasi" value={transportModeLabels[transportKey] ?? "Belum diisi"} editing={editingField === "transport_mode"} onToggle={() => toggleEditing("transport_mode")} editor={<select id="transport-mode" name="transport_mode" className={selectClass} value={transportKey} onChange={(event) => setTransportMode(event.target.value)}><option value="">Belum diisi</option>{Object.entries(transportModeLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>} />
                            <ProfileRow label="Lokasi tujuan" value={destinationName} editing={editingField === "destination"} onToggle={() => toggleEditing("destination")} editor={<div><input id="destination-name" name="destination" className={fieldClass} maxLength={200} value={destinationName} onChange={(event) => editDestinationName(event.target.value)} /><p className="mt-1 text-xs text-ink-muted">Mengubah nama melepas pin tersimpan.</p></div>} />
                            <ProfileRow label="Waktu berangkat" value={({ morning: "Pagi", midday: "Siang", evening: "Sore atau malam", flexible: "Fleksibel" } as Record<string, string>)[String(soft.departure_time)] ?? "Belum diisi"} editing={editingField === "departure_time"} onToggle={() => toggleEditing("departure_time")} editor={<select id="departure-time" name="departure_time" className={selectClass} value={typeof soft.departure_time === "string" ? soft.departure_time : ""} onChange={(event) => setField("soft_preferences", "departure_time", event.target.value || null)}><option value="">Belum diisi</option><option value="morning">Pagi</option><option value="midday">Siang</option><option value="evening">Sore atau malam</option><option value="flexible">Fleksibel</option></select>} />
                        </ProfileSection>

                        <ProfileSection title="Prioritas" rows={false} note={keepEnvironmentPriority || (draft.priority_weights.environment ?? 0) > 0 ? "Data lingkungan belum tersedia" : undefined}>
                            <div className="divide-y divide-rule">
                                {(Object.keys(priorityNames) as PriorityKey[]).filter((key) => key !== "environment" || keepEnvironmentPriority || (draft.priority_weights.environment ?? 0) > 0).map((key) => <label key={key} htmlFor={`priority-${key}`} className="grid min-h-12 grid-cols-[minmax(6rem,.8fr)_minmax(0,1fr)_3.5rem] items-center gap-3 py-1.5 text-sm">
                                    <span className="font-semibold text-ink">{priorityNames[key]}</span>
                                    <input id={`priority-${key}`} name={`priority_${key}`} type="range" min="0" max="100" step="1" className="range range-primary w-full [--range-thumb-size:1.25rem] [--range-p:2px] [--range-fill:0]" value={displayed?.[key] ?? 0} aria-label={priorityNames[key]} aria-valuetext={`${priorityNames[key]} ${displayed?.[key] ?? 0}%`} onChange={(event) => changeDraft(updatePriority(draft, key, Number(event.target.value), keepEnvironmentPriority))} />
                                    <output htmlFor={`priority-${key}`} className="text-right tabular-nums text-ink">{displayed?.[key] ?? 0}%</output>
                                </label>)}
                            </div>
                            {!hasPriorityWeights && <p className="py-2 text-sm text-ink-muted">Belum diatur</p>}
                            {attempted && errors.priorities && <p className="py-2 text-sm text-error" role="alert">{errors.priorities}</p>}
                            <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-2">
                                <button type="button" className="btn btn-ghost min-h-11 px-2 text-primary" onClick={() => original && changeDraft({ ...draft, priority_weights: { ...original.priority_weights } })}>Atur ulang</button>
                                {showEmpty("Prioritas", draft.priority_weights)}
                            </div>
                        </ProfileSection>
                    </fieldset>
                </form>

                <details className="mt-6 border-t border-rule pt-3">
                    <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">Preferensi tersimpan lainnya</summary>
                    <dl className="mt-1 divide-y divide-rule">
                        <SummaryReadRow label="Tahap karier" value={soft.career_stage} />
                        <SummaryReadRow label="Pengaturan kerja" value={soft.work_arrangement} />
                        <SummaryReadRow label="Bahasa pilihan" value={soft.language_preferences} />
                        <SummaryReadRow label="Batas tambahan" value={hard.deal_breakers} />
                        <SummaryReadRow label="Faktor tambahan" value={soft.extras} />
                    </dl>
                </details>

                <section className="mt-6 border-t border-rule pt-4" aria-live="polite" aria-busy={activePreviewLoading}>
                    <h2 className="font-sans text-base font-bold text-ink">Perubahan kecamatan</h2>
                    {activePreviewLoading && <p className="mt-2 text-sm text-ink-muted">Menghitung kecamatan…</p>}
                    {showMissingCity && <p className="mt-2 text-sm text-ink-muted">{showMissingCity}</p>}
                    {catalogError && <div className="mt-2 flex items-center gap-3"><p className="text-sm text-ink-muted">{catalogError}</p><button type="button" className="btn btn-ghost min-h-11 px-2 text-primary" onClick={() => void getOnboardingData(null, AbortSignal.timeout(30_000)).then(setCityCatalog).catch(() => setCatalogError("Daftar kota belum tersedia."))}>Coba lagi</button></div>}
                    {activePreviewError && <div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-sm text-ink-muted">{activePreviewError}</p><button type="button" className="btn btn-ghost min-h-11 px-2 text-primary" onClick={() => { const cityId = afterCityId && previewErrors[afterCityId] ? afterCityId : beforeCityId; if (cityId) void refreshCityPreview(cityId).catch(() => undefined); }}>Coba lagi</button></div>}
                    {beforeCityId && beforePreview !== null && <p className="mt-2 text-sm text-ink-muted">Tersimpan ({cityName(beforeCityId, cityCatalog?.cities ?? [])}): {beforePreview} {previewCountLabel(original, cityCatalog?.cities ?? [])}.{beforeSample && <span className="ml-2 rounded bg-ink px-2 py-0.5 text-xs text-base-100">Data contoh</span>}</p>}
                    {afterCityId && afterPreview !== null && <p className="mt-1 text-sm text-ink-muted">Draf ({cityName(afterCityId, cityCatalog?.cities ?? [])}): {afterPreview} {previewCountLabel(draft, cityCatalog?.cities ?? [])}.{afterSample && <span className="ml-2 rounded bg-ink px-2 py-0.5 text-xs text-base-100">Data contoh</span>}</p>}
                </section>
            </>
        </div>}

        {tab === "profile" && <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-base-100 px-4 py-3 shadow-[0_-2px_8px_rgba(33,41,124,0.08)] sm:px-8 md:left-[220px] lg:px-10" role="group" aria-label="Simpan perubahan profil">
            <div className="mx-auto flex max-w-[1180px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <p className="font-semibold text-ink">{dirty ? "Ada perubahan pada profilmu" : "Profil relokasimu"}</p>
                     <p className="truncate text-sm text-ink-muted">{dirty ? `${changeSummary.count} bagian berubah` : "Tidak ada perubahan"}{changeSummary.details.map((change) => ` · ${change.key}: ${change.before} → ${change.after}`).join("")}</p>
                </div>
                <div className="flex shrink-0 gap-3">
                    <button type="button" className={`${buttonClass} flex-1 sm:flex-none`} onClick={resetDraft} disabled={!dirty || pending}>Batalkan</button>
                    <button type="submit" form="relocation-profile-form" className="btn btn-primary min-h-12 flex-1 px-5 sm:flex-none" disabled={pending || !dirty || reviewOpen || !!proposal}>
                        {pending ? busyLabel || "Memproses…" : "Simpan dan hitung ulang"}
                    </button>
                </div>
            </div>
        </div>}

        {tab === "profile" && !reviewOpen && (error || status || savedButFailed) && <div data-hci-region="profile-edit-feedback" className="fixed bottom-36 left-4 z-30 max-h-[50dvh] w-[min(32rem,calc(100%-2rem))] overflow-y-auto rounded-xl border border-rule bg-base-100 p-4 shadow-overlay sm:bottom-24 sm:left-8 lg:left-[260px]" aria-live="polite">
            {error && <p className="text-sm text-error" role="alert">{error}</p>}
            {status && <p className={error ? "mt-2 text-sm text-ink" : "text-sm text-ink"} role="status">{status}</p>}
            {savedButFailed && <p className="mt-1 text-sm text-ink-muted">Coba hitung ulang tanpa menyimpan profil lagi.</p>}
            {savedButFailed && <button type="button" className={`${buttonClass} mt-3`} disabled={pending} onClick={() => void retryRecalculation()}>{recalculating ? "Menghitung ulang…" : "Coba hitung ulang"}</button>}
            {profileJustSaved && <Link href={savedMapHref} onNavigate={protectNavigation} className="btn btn-ghost mt-2 min-h-11 text-primary">Lihat di peta</Link>}
        </div>}

        <dialog ref={storyDialogRef} data-hci-region="profile-story-dialog" className="modal" aria-labelledby="profile-story-title" aria-hidden={!storyDialogOpen} inert={!storyDialogOpen} onClose={() => setStoryDialogOpen(false)}>
            <div className="modal-box max-w-xl bg-base-100 text-ink">
                <h2 id="profile-story-title" className="font-sans text-xl font-bold">Ceritakan perubahan rencanamu</h2>
                <p className="mt-2 text-sm text-ink-muted">Opsional. Profil terstrukturmu tetap menjadi dasar; kamu bisa menjelaskan apa yang berubah.</p>
                <label htmlFor="profile-story" className="mb-1.5 mt-5 block text-sm font-semibold">Catatan rencana</label>
                <textarea id="profile-story" name="message" disabled={pending} className="textarea textarea-bordered min-h-32 w-full border-ink/25 bg-base-100 text-ink focus:border-primary focus:outline-primary" maxLength={4000} value={story}
                    onChange={(event) => { setStory(event.target.value); setProposal(null); answeredRefinementQuestions.current = []; }} placeholder={draft ? profileStory(draft, cityCatalog?.cities) : "Tuliskan perubahan rencanamu"} />
                <p className="mt-2 text-xs text-ink-muted">Jangan masukkan nomor identitas atau alamat rumah.</p>
                <div className="modal-action">
                    <button type="button" className={buttonClass} onClick={() => setStoryDialogOpen(false)}>Kembali</button>
                    <button type="button" className="btn btn-primary min-h-11" onClick={() => setStoryDialogOpen(false)}>Selesai</button>
                </div>
            </div>
            <form method="dialog" className="modal-backdrop"><button aria-label="Tutup catatan">Tutup</button></form>
        </dialog>

        <dialog ref={reviewDialogRef} data-hci-region="profile-refinement-review" className="modal" aria-labelledby="profile-review-title" aria-hidden={!reviewOpen} inert={!reviewOpen} onClose={() => {
            setReviewOpen(false);
            if (!pending) {
                setProposal(null);
                setConfirmedProposal(false);
                setClarificationAnswers({});
            }
        }}>
            {proposal && <div className="modal-box max-h-[85dvh] max-w-2xl overflow-y-auto bg-base-100 text-ink">
                <h2 id="profile-review-title" className="font-sans text-2xl font-bold">Tinjau perubahan dari Jejak</h2>
                <p className="mt-2 text-sm text-ink-muted">Periksa semua perbedaan sebelum profil disimpan.</p>
                {error && <p role="alert" className="mt-3 text-sm text-error">{error}</p>}
                <dl className="mt-5 divide-y divide-rule border-y border-rule">
                    {proposal.inferred_fields.map((field) => <div key={field} className="py-3"><dt className="font-semibold text-ink">{fieldLabel(field)}</dt><dd className="mt-1 text-sm text-ink-muted">Disimpulkan dari catatanmu — konfirmasi hanya jika sesuai.</dd></div>)}
                    {Object.entries(proposal.hard_constraints).filter(([key, value]) => profileFieldsDiffer({ value }, { value: draft?.hard_constraints[key] })).map(([key, value]) => <div key={`hard-${key}`} className="py-3"><dt className="font-semibold">{fieldLabel(key)}</dt><dd className="mt-1 text-sm text-ink-muted">Draf: {formatProfileValue(draft?.hard_constraints[key])} · Usulan: {formatProfileValue(value)}</dd></div>)}
                    {Object.entries(proposal.soft_preferences).filter(([key, value]) => profileFieldsDiffer({ value }, { value: draft?.soft_preferences[key] })).map(([key, value]) => <div key={`soft-${key}`} className="py-3"><dt className="font-semibold">{fieldLabel(key)}</dt><dd className="mt-1 text-sm text-ink-muted">Draf: {formatProfileValue(draft?.soft_preferences[key])} · Usulan: {formatProfileValue(value)}</dd></div>)}
                    {profileFieldsDiffer(proposal.priority_weights, draft?.priority_weights ?? {}) && draft && <div className="py-3"><dt className="font-semibold">Prioritas</dt><dd className="mt-1 text-sm text-ink-muted">Draf: {Object.entries(displayedWeights(draft, keepEnvironmentPriority)).map(([key, value]) => `${priorityNames[key as PriorityKey]} ${value}%`).join(" · ")}<br />Usulan: {Object.entries(displayedWeights({ ...draft, priority_weights: proposal.priority_weights }, keepEnvironmentPriority)).map(([key, value]) => `${priorityNames[key as PriorityKey]} ${value}%`).join(" · ")}</dd></div>}
                </dl>
                {proposal.clarification_questions.length > 0 && <fieldset className="mt-5 space-y-4" disabled={pending}>
                    <legend className="font-semibold">Jawab pertanyaan lanjutan sebelum menyimpan</legend>
                    {proposal.clarification_questions.map((question, index) => <div key={`${question}-${index}`}>
                        <label htmlFor={`clarification-${index}`} className="mb-1.5 block text-sm font-medium">{question}</label>
                        <input id={`clarification-${index}`} className={fieldClass} value={clarificationAnswers[question] ?? ""} maxLength={1000}
                            onChange={(event) => setClarificationAnswers((current) => ({ ...current, [question]: event.target.value }))} />
                    </div>)}
                </fieldset>}
                {proposal.clarification_questions.length === 0 && <label className="mt-5 flex min-h-12 items-start gap-3 border-t border-rule pt-4 text-sm text-ink">
                    <input type="checkbox" className="checkbox checkbox-primary mt-0.5" disabled={pending} checked={confirmedProposal} onChange={(event) => setConfirmedProposal(event.target.checked)} />
                    Saya sudah meninjau dan menyetujui perubahan tambahan ini.
                </label>}
                <div className="modal-action flex-wrap">
                    <button type="button" className={buttonClass} disabled={pending} onClick={() => { setReviewOpen(false); setProposal(null); }}>Kembali ke profil</button>
                    <button type="button" className="btn btn-primary min-h-11" disabled={pending || (proposal.clarification_questions.length > 0 ? proposal.clarification_questions.some((question) => !clarificationAnswers[question]?.trim()) : !confirmedProposal)} onClick={() => {
                        const answers = proposal.clarification_questions.flatMap((question) => {
                            const answer = clarificationAnswers[question]?.trim();
                            return answer ? [{ question, answer }] : [];
                        });
                        if (answers.length) void sendRefinement(answers);
                        else void persistProposal(proposal);
                    }}>{proposal.clarification_questions.length ? "Tinjau jawaban" : "Konfirmasi dan simpan"}</button>
                </div>
            </div>}
            <form method="dialog" className="modal-backdrop"><button aria-label="Tutup tinjauan">Tutup</button></form>
        </dialog>
    </Shell>;
}

function Shell({ account, onNavigate, activeTab, onTabChange, mapHref = "/map", children }: { account: AccountSummary | null; onNavigate: (event: { preventDefault: () => void }) => void; activeTab: ActiveTab; onTabChange: (tab: ActiveTab) => void; mapHref?: string; children: ReactNode }) {
    const items = [
        { id: "profile", label: "Profil relokasi", Icon: MapPin },
        { id: "scenario", label: "Skenario", Icon: Layers },
        { id: "account", label: "Akun", Icon: UserRound },
        { id: "plan", label: "Paket dan tagihan", Icon: CreditCard },
        { id: "privacy", label: "Privasi dan data", Icon: LockKeyhole },
    ] as const;

    return <div className="min-h-dvh bg-base-100 font-body text-ink" data-hci-region="relocation-profile-page">
        <UserHeader account={account} mapHref={mapHref} onNavigate={onNavigate} onAccountClick={() => onTabChange("account")} accountActive />
        <div className="mx-auto grid max-w-[1480px] grid-cols-1 pt-3 md:grid-cols-[220px_minmax(0,1fr)] md:pt-2">
            <aside className={`min-w-0 px-3 py-3 md:pl-6 ${activeTab === "profile" ? "md:pt-7" : "md:pt-[7.7rem]"}`} data-hci-region="user-settings-navigation">
                <nav aria-label="Menu profil"><ul className="menu grid w-full grid-cols-2 gap-1 p-0 md:grid-cols-1">
                    {items.map(({ id, label, Icon }) => <li key={id}>
                        {id === "scenario" ? <button type="button" disabled className="grid min-h-11 grid-flow-row grid-cols-[1rem_minmax(0,1fr)] gap-x-2 gap-y-0 rounded-lg px-3 text-sm disabled:text-ink-muted disabled:opacity-100" title="Skenario — belum tersedia">
                            <Icon aria-hidden="true" className="size-4 shrink-0" /><span>Skenario</span><span className="col-start-2 text-xs">Belum tersedia</span>
                        </button> : <button type="button" aria-current={activeTab === id ? "page" : undefined} onClick={() => onTabChange(id)}
                            className={`btn flex min-h-11 w-full items-center justify-start gap-2 rounded-lg border-0 text-left text-sm shadow-none hover:shadow-none active:shadow-none focus-visible:outline-primary ${activeTab === id ? "bg-primary/10 font-semibold text-primary hover:bg-primary/10" : "bg-transparent text-ink hover:bg-primary/5"}`}>
                            <Icon aria-hidden="true" className="size-4 shrink-0" />{label}
                        </button>}
                    </li>)}
                </ul></nav>
            </aside>
            <main className="min-w-0">{children}</main>
        </div>
    </div>;
}

function resolveCityId(profile: PersistedRelocationProfile | null, cities: OnboardingDataResponse["cities"]): string | null {
    if (!profile) return null;
    const preferences = profilePreviewPreferences(profile, cities);
    return preferences?.cityId ?? null;
}

function cityName(cityId: string, cities: OnboardingDataResponse["cities"]): string {
    return cities.find((city) => city.city_id === cityId)?.city_name ?? cityId;
}

function getCount(profile: PersistedRelocationProfile | null, cities: OnboardingDataResponse["cities"], data: OnboardingDataResponse | null): number | null {
    if (!profile || !data) return null;
    const preferences = profilePreviewPreferences(profile, cities);
    if (!preferences) return null;
    const destinations = profile.hard_constraints.destination_cities ?? profile.soft_preferences.destination_cities;
    if (Array.isArray(destinations) && destinations.some((city) => typeof city === "string" && city.trim()) && !preferences.cityId) return null;
    const input = preferences.cityId
        ? { ...data, areas: data.areas.filter((area) => area.city_id === preferences.cityId) }
        : data;
    const preview = evaluateLiveOnboarding(preferences, 4, input);
    const hasBudget = preferences.monthlyBudget !== null || preferences.maximumRent !== null;
    // This editor compares budget changes; no routing request is made here.
    return preview.available ? hasBudget ? preview.affordableCount : preview.ranked.length : null;
}

function previewCountLabel(profile: PersistedRelocationProfile | null, cities: OnboardingDataResponse["cities"]): string {
    const preferences = profile ? profilePreviewPreferences(profile, cities) : null;
    return preferences && (preferences.monthlyBudget !== null || preferences.maximumRent !== null)
        ? "kecamatan sesuai batas anggaran" : "kecamatan dirangking";
}

function previewUsesSampleData(profile: PersistedRelocationProfile | null, cities: OnboardingDataResponse["cities"], data: OnboardingDataResponse | null): boolean {
    if (!profile || !data) return false;
    const preferences = profilePreviewPreferences(profile, cities);
    if (!preferences) return false;
    const destinations = profile.hard_constraints.destination_cities ?? profile.soft_preferences.destination_cities;
    if (Array.isArray(destinations) && destinations.some((city) => typeof city === "string" && city.trim()) && !preferences.cityId) return false;
    const input = preferences.cityId
        ? { ...data, areas: data.areas.filter((area) => area.city_id === preferences.cityId) }
        : data;
    return evaluateLiveOnboarding(preferences, 4, input).is_sample;
}

function fieldLabel(field: string): string {
    const labels: Record<string, string> = {
        goal: "Tujuan pindah", target_fields: "Bidang pekerjaan", target_occupations: "Pekerjaan", destination_cities: "Kota tujuan",
        monthly_budget: "Anggaran bulanan", housing_budget: "Batas sewa", commute_minutes: "Batas waktu perjalanan", transport_mode: "Moda transportasi",
        destination: "Lokasi tujuan", education_level: "Jenjang pendidikan", study_field: "Bidang studi", departure_time: "Waktu berangkat", priorities: "Prioritas", active_mode: "Moda aktif",
    };
    return labels[field] ?? field.replaceAll("_", " ");
}
