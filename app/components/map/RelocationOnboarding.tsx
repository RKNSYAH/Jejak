"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckSquare, Mic, Search, X } from "lucide-react";
import { extractUserProfile, onboardingTaxonomy, onboardingTopics } from "../../engine/extractUserProfile";
import type { LF05ProposedProfile } from "../../engine/lib/lf05Validation";
import type { StoredRelocationProfile } from "../../engine/lib/relocationProfile";
import { isStoredRelocationProfile } from "../../engine/lib/relocationProfileCache";
import { handleAuthFailure } from "../../engine/lib/authRedirect";
import { isRecord } from "../../engine/lib/zoneGeometry";
import { formatRupiah } from "../../engine/onboarding/demoData";
import { STORY_DRAFT_KEY, type FormSession } from "../../engine/onboarding/types";

const MAX_STORY_LENGTH = 1000;

const placeholderStory = `Saya berencana pindah ke Jakarta Selatan untuk bekerja sebagai software engineer di sektor teknologi. Saya ingin mencari kos dengan biaya sewa sekitar Rp4 juta per bulan. Prioritas utama saya adalah karier, jadi saya ingin memastikan waktu tempuh ke kantor tidak lebih dari 45 menit. Saya juga mempertimbangkan transportasi umum sebagai pilihan utama untuk perjalanan ke kantor. Terima kasih!`;

export const officeLocations = [
  { name: "Kuningan", longitude: 106.8304, latitude: -6.2297 },
  { name: "SCBD", longitude: 106.8098, latitude: -6.2253 },
  { name: "TB Simatupang", longitude: 106.8008, latitude: -6.2912 },
] as const;

export type OfficeChoice = (typeof officeLocations)[number]["name"] | "Belum tahu" | "Dipilih di peta";
type TransportChoice = "Transport umum" | "Motor" | "Mobil";
type Step = 0 | 1 | 2 | 3;

type Draft = {
  step: Exclude<Step, 0>;
  story: string;
  office: OfficeChoice;
  transport: TransportChoice | null;
  confirmedFields?: Record<string, boolean>;
  proposal?: LF05ProposedProfile | null;
};

export type MapPoint = { longitude: number; latitude: number };

type RelocationOnboardingProps = {
  savedProfile: StoredRelocationProfile | null;
  savedProfileLoaded: boolean;
  onSaveProfile: (profile: StoredRelocationProfile) => void;
  mapPoint: MapPoint | null;
  selectedOffice: OfficeChoice;
  onOfficeChange: (office: OfficeChoice) => void;
  onMapPickingChange: (picking: boolean) => void;
  onOnboardingActiveChange: (active: boolean) => void;
  formSession: FormSession | null;
  formReady: boolean;
  storyOpenRequest: number;
  onOpenForm: () => void;
};

// Profile fields in display order, with their labels.
const profileFields: [field: string, label: string][] = [
  ["goal", "Tujuan"],
  ["target_occupations", "Pekerjaan"],
  ["target_fields", "Sektor"],
  ["destination_cities", "Kota tujuan"],
  ["housing_budget", "Batas sewa"],
  ["monthly_budget", "Anggaran bulanan"],
  ["commute_minutes", "Waktu tempuh"],
  ["work_arrangement", "Pola kerja"],
  ["education_level", "Jenjang pendidikan"],
  ["language_preferences", "Bahasa"],
  ["deal_breakers", "Syarat wajib"],
];
const profileFieldLabels: Record<string, string> = { ...Object.fromEntries(profileFields), priorities: "Prioritas" };

const priorityLabels: Record<string, string> = {
  career: "Karier",
  housing: "Biaya hunian",
  commute: "Waktu tempuh",
  education: "Pendidikan",
  cost_of_living: "Biaya hidup",
};

function formatWeight(key: string, weight: number) {
  return `${priorityLabels[key] ?? key} ${Math.round(weight * 100)}%`;
}

function isOfficeClarification(question: string) {
  return /\b(kantor|office|workplace|work location|lokasi kerja|tempat kerja)\b|where.{0,24}work/iu.test(question);
}

function isTransportClarification(question: string) {
  return /\b(transport(?:asi|ation)?|angkutan|moda|naik apa|kendaraan|commute mode|travel mode)\b|how.{0,24}(travel|commute|get to work)/iu.test(question);
}

function formatProfileValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "Belum disebut";
  if ((field === "monthly_budget" || field === "housing_budget") && isRecord(value) && typeof value.amount === "number") {
    return `Rp${formatRupiah(value.amount)} / bulan`;
  }
  if (field === "commute_minutes" && typeof value === "number") return `${value} menit`;
  if (field === "goal" && typeof value === "string") {
    return ({ work: "Kerja", study: "Studi", both: "Kerja dan studi" } as Record<string, string>)[value] ?? value;
  }
  if (field === "target_fields" && Array.isArray(value)) {
    return value.map((id) => onboardingTaxonomy.sectors.find((item) => item.id === id)?.label ?? String(id)).join(", ");
  }
  if (field === "target_occupations" && Array.isArray(value)) {
    return value.map((id) => onboardingTaxonomy.occupations.find((item) => item.id === id)?.label ?? String(id)).join(", ");
  }
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "Belum disebut";
}

type ProfileDisplayRow = {
  key: string;
  field: string;
  label: string;
  value: string;
  inferred: boolean;
  priorityWeights?: Record<string, number>;
};

function getProfileRows(profile: LF05ProposedProfile): ProfileDisplayRow[] {
  const rows: ProfileDisplayRow[] = [];

  for (const [field, label] of profileFields) {
    const value = profile.hard_constraints[field] ?? profile.soft_preferences[field];
    if (value === undefined || value === null) continue;
    rows.push({
      key: field,
      field,
      label,
      value: formatProfileValue(field, value),
      inferred: profile.inferred_fields.includes(field),
    });
  }

  if (Object.keys(profile.priority_weights).length > 0 || profile.inferred_fields.includes("priorities")) {
    rows.push({
      key: "priorities",
      field: "priorities",
      label: "Prioritas",
      value: Object.entries(profile.priority_weights).map(([key, weight]) => formatWeight(key, weight)).join(" · ") || "Belum ditentukan",
      inferred: profile.inferred_fields.includes("priorities"),
      priorityWeights: profile.priority_weights,
    });
  }

  return rows;
}

function getInferredValue(field: string, rows: ProfileDisplayRow[]) {
  return rows.find((row) => row.field === field)?.value ?? (field === "priorities" ? "Prioritas belum ditentukan" : "Periksa kembali ceritamu");
}

function priorityShade(weight: number) {
  if (weight >= 0.4) return "bg-primary";
  if (weight >= 0.25) return "bg-primary/80";
  if (weight >= 0.15) return "bg-primary/60";
  return "bg-primary/40";
}

function PriorityWeights({ weights }: { weights: Record<string, number> }) {
  const entries = Object.entries(weights);
  if (!entries.length) return <span>Belum ditentukan</span>;

  return (
    <div className="min-w-0">
      <div
        role="img"
        aria-label={`Bobot prioritas: ${entries.map(([key, weight]) => formatWeight(key, weight)).join(", ")}`}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-base-200"
      >
        {entries.map(([key, weight]) => (
          <span
            key={key}
            title={formatWeight(key, weight)}
            className={`h-full ${priorityShade(weight)}`}
            style={{ width: `${weight * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-[10px] font-normal leading-snug text-ink-muted">
        {entries.map(([key, weight]) => (
          <span key={key}>{formatWeight(key, weight)}</span>
        ))}
      </div>
    </div>
  );
}

function readDraft(): Draft | null {
  try {
    const saved = sessionStorage.getItem(STORY_DRAFT_KEY);
    return saved ? (JSON.parse(saved) as Draft) : null;
  } catch {
    return null;
  }
}

export default function RelocationOnboarding({
  savedProfile,
  savedProfileLoaded,
  onSaveProfile,
  mapPoint,
  selectedOffice,
  onOfficeChange,
  onMapPickingChange,
  onOnboardingActiveChange,
  formSession,
  formReady,
  storyOpenRequest,
  onOpenForm,
}: RelocationOnboardingProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ignoreCloseRef = useRef(false);
  const [step, setStep] = useState<Step>(0);
  const [story, setStory] = useState("");
  const [transport, setTransport] = useState<TransportChoice | null>(null);
  const [language, setLanguage] = useState("Bahasa Indonesia");
  const [officeSearchOpen, setOfficeSearchOpen] = useState(false);
  const [officeQuery, setOfficeQuery] = useState("");
  const [confirmedFields, setConfirmedFields] = useState<Record<string, boolean>>({});
  const [proposal, setProposal] = useState<LF05ProposedProfile | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const extractedProfile = extractUserProfile(story);
  const profileRows = proposal ? getProfileRows(proposal) : [];
  const clarificationQuestions = proposal?.clarification_questions ?? [];
  const officeQuestionIndex = clarificationQuestions.findIndex(isOfficeClarification);
  const transportQuestionIndex = clarificationQuestions.findIndex(isTransportClarification);
  const canConfirmProfile = !!proposal && proposal.inferred_fields.every((field) => confirmedFields[field]);

  useEffect(() => {
    if (hydrated || !formReady) return;

    const params = new URLSearchParams(window.location.search);
    const demoRequested = params.get("onboarding") === "demo";
    const requested = params.get("welcome") === "1" || demoRequested;
    if (requested && !savedProfileLoaded) return;

    const timer = window.setTimeout(() => {
      const alreadyOnboarded = !demoRequested && savedProfile !== null;
      const draft = readDraft();

      if (draft) {
        const keepMap = formSession && (formSession.status === "active" || formSession.status === "completed" || (!requested && formSession.status === "skipped"));
        setStep(keepMap ? 0 : draft.step);
        setStory(draft.story);
        onOfficeChange(draft.office);
        setTransport(draft.transport);
        setConfirmedFields(draft.confirmedFields ?? {});
        setProposal(draft.proposal ?? null);
      } else if (requested && !alreadyOnboarded && formSession?.status !== "active" && formSession?.status !== "completed") {
        setStep(1);
      }

      if (params.has("welcome") || params.has("onboarding")) {
        params.delete("welcome");
        params.delete("onboarding");
        const query = params.toString();
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
        );
      }

      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [formReady, formSession, hydrated, onOfficeChange, savedProfile, savedProfileLoaded]);

  useEffect(() => {
    if (!storyOpenRequest) return;
    const timer = window.setTimeout(() => setStep(1), 0);
    return () => window.clearTimeout(timer);
  }, [storyOpenRequest]);

  useEffect(() => {
    if (!hydrated) return;
    if (step === 0) {
      if (!formSession) sessionStorage.removeItem(STORY_DRAFT_KEY);
      return;
    }

    const draft: Draft = { step, story, office: selectedOffice, transport, confirmedFields, proposal };
    sessionStorage.setItem(STORY_DRAFT_KEY, JSON.stringify(draft));
  }, [confirmedFields, formSession, hydrated, proposal, selectedOffice, step, story, transport]);

  useEffect(() => {
    const shouldShowDialog = (step === 1 || step === 3) && formSession?.status !== "active";
    const dialog = dialogRef.current;

    onMapPickingChange(step === 2 && officeQuestionIndex >= 0);
    if (!dialog) return;

    if (shouldShowDialog && !dialog.open) {
      dialog.showModal();
    } else if (!shouldShowDialog && dialog.open) {
      ignoreCloseRef.current = true;
      dialog.close();
    }
  }, [formSession, officeQuestionIndex, onMapPickingChange, step]);

  useEffect(() => {
    onOnboardingActiveChange(!hydrated || step > 0 || formSession?.status === "active");
  }, [formSession, hydrated, onOnboardingActiveChange, step]);

  useEffect(() => () => onMapPickingChange(false), [onMapPickingChange]);

  function dismiss() {
    try { sessionStorage.removeItem(STORY_DRAFT_KEY); } catch { /* Closing works without browser storage. */ }
    setStep(0);
    setOfficeSearchOpen(false);
    onMapPickingChange(false);
    const dialog = dialogRef.current;
    if (dialog?.open) {
      ignoreCloseRef.current = true;
      dialog.close();
    }
  }

  function handleDialogClose() {
    if (ignoreCloseRef.current) {
      ignoreCloseRef.current = false;
      return;
    }
    dismiss();
  }

  function goToStep(nextStep: Exclude<Step, 0>) {
    setStep(nextStep);
    setOfficeSearchOpen(false);
  }

  async function requestProfile() {
    if (!story.trim()) {
      setRequestError("Ceritakan rencana pindahmu terlebih dahulu.");
      return null;
    }

    setIsSubmitting(true);
    setRequestError(null);
    try {
      const response = await fetch("/api/lf05", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: story,
          language: language === "English" ? "en" : "id",
        }),
      });
      const result: unknown = await response.json();
      if (handleAuthFailure(response)) {
        setRequestError("Masuk untuk menganalisis rencanamu.");
        return null;
      }
      if (!response.ok || !isRecord(result) || !isRecord(result.profile)) {
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Gagal membaca rencana. Coba lagi.");
      }

      const nextProposal = result.profile as unknown as LF05ProposedProfile;
      setProposal(nextProposal);
      setConfirmedFields({});
      setOfficeSearchOpen(false);
      return nextProposal;
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Gagal membaca rencana. Coba lagi.");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStorySubmit() {
    const result = await requestProfile();
    if (result) setStep(2);
  }

  async function continueToReview() {
    const result = proposal ?? await requestProfile();
    if (result) setStep(3);
  }

  async function saveProfile() {
    if (!proposal || !canConfirmProfile || isSaving) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/user/relocation-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposal,
          confirmed_fields: Object.entries(confirmedFields)
            .filter(([, confirmed]) => confirmed)
            .map(([field]) => field),
        }),
      });
      const result: unknown = await response.json();
      if (handleAuthFailure(response)) {
        setSaveError("Masuk untuk menyimpan profil.");
        return;
      }
      if (!response.ok || !isRecord(result) || !isStoredRelocationProfile(result.profile)) {
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Profil belum tersimpan. Coba lagi.");
      }

      onSaveProfile(result.profile);
      dismiss();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Profil belum tersimpan. Coba lagi.");
    } finally {
      setIsSaving(false);
    }
  }

  // A changed story or language invalidates the analysed proposal.
  function resetProposal() {
    setProposal(null);
    setConfirmedFields({});
    setSaveError(null);
    setOfficeSearchOpen(false);
    setRequestError(null);
  }

  function toggleFieldConfirmation(field: string) {
    setConfirmedFields((current) => ({ ...current, [field]: !current[field] }));
    setSaveError(null);
  }

  function chooseOffice(office: OfficeChoice) {
    onOfficeChange(office);
    setOfficeSearchOpen(false);
    setOfficeQuery("");
  }

  const matchingOffices = officeLocations.filter((office) =>
    office.name.toLowerCase().includes(officeQuery.trim().toLowerCase()),
  );

  return (
    <>
      {step === 2 && (
        <aside
          aria-labelledby="onboarding-step-two-title"
          data-hci-region="relocation-onboarding-step-2"
          className="absolute inset-x-2 bottom-2 z-400 flex max-h-[min(56dvh,42rem)] flex-col overflow-hidden rounded-2xl border border-rule bg-base-100 shadow-overlay md:inset-y-2 md:left-auto md:right-2 md:max-h-none md:w-[min(26.5rem,45vw)]"
        >
          <StepHeader step={2} onSkip={dismiss} className="border-b border-rule px-4 py-3 md:px-5" />

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-4">
            <div className="flex items-start justify-between gap-3">
              <h1 id="onboarding-step-two-title" className="font-sans text-2xl font-bold leading-tight text-ink md:text-[1.75rem]">
                Ini yang kami tangkap
              </h1>
              <button type="button" onClick={() => goToStep(1)} className="btn btn-ghost btn-xs min-h-9 shrink-0 px-1 text-primary underline">
                Ubah cerita
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
              {proposal ? (
                <>
                  <span className="badge badge-outline badge-sm border-ink-muted text-ink-muted">Usulan</span>
                  <span>Perlu ditinjau sebelum dipakai.</span>
                </>
              ) : <span>Ringkasan ceritamu belum tersedia.</span>}
            </div>

            <dl className="mt-3 divide-y divide-rule border-y border-rule">
              {profileRows.map((row) => (
                <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2 text-xs sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
                  <dt className="text-ink-muted">{row.label}</dt>
                  <dd className="min-w-0 font-semibold text-ink">
                    {row.priorityWeights ? <PriorityWeights weights={row.priorityWeights} /> : row.value}
                  </dd>
                  <dd>
                    <span className={`badge badge-sm col-start-2 max-w-full text-center whitespace-normal sm:col-start-auto ${row.inferred ? "badge-outline border-ink-muted text-ink" : "badge-neutral"}`}>
                      {row.inferred ? "Disimpulkan" : "Terbaca"}
                    </span>
                  </dd>
                </div>
              ))}
              {!proposal && <div className="py-3 text-xs text-ink-muted">Cerita belum dianalisis. Kirim cerita untuk melihat ringkasannya.</div>}
              {proposal && !profileRows.length && <div className="py-3 text-xs text-ink-muted">Belum ada batasan atau preferensi yang bisa ditampilkan.</div>}
            </dl>
            <RequestError error={requestError} />

            <section className="mt-3 border-t-2 border-ink pt-3" aria-label="Pertanyaan lanjutan">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                  {proposal
                    ? proposal.clarification_questions.length
                      ? `Tinggal ${proposal.clarification_questions.length} pertanyaan`
                      : "Tidak ada pertanyaan lanjutan"
                    : "Pertanyaan lanjutan"}
                </p>
                <span className="badge badge-outline badge-sm border-dashed border-ink-muted text-ink-muted">
                  {proposal ? "Dari ceritamu" : "Menunggu cerita"}
                </span>
              </div>
              {clarificationQuestions.length ? (
                <div className="mt-2 space-y-3">
                  {clarificationQuestions.map((question, index) => {
                    const isOfficeQuestion = index === officeQuestionIndex;
                    const isTransportQuestion = index === transportQuestionIndex;

                    return (
                      <section key={`${index}:${question}`} className="rounded-lg bg-base-200/50 px-2.5 py-2">
                        <h2 className="text-sm font-semibold leading-relaxed text-ink">{question}</h2>
                        {isOfficeQuestion && (
                          <>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {officeLocations.map((office) => (
                                <ChoiceButton key={office.name} pressed={selectedOffice === office.name} onClick={() => chooseOffice(office.name)}>
                                  {office.name}
                                </ChoiceButton>
                              ))}
                              <ChoiceButton pressed={selectedOffice === "Belum tahu"} onClick={() => chooseOffice("Belum tahu")}>
                                {selectedOffice === "Belum tahu" && <Check aria-hidden="true" className="size-3.5" />}
                                Belum tahu
                              </ChoiceButton>
                              <ChoiceButton pressed={selectedOffice === "Dipilih di peta"} onClick={() => { setOfficeSearchOpen(true); onMapPickingChange(true); }}>
                                <Search aria-hidden="true" className="size-3.5" /> Cari di peta
                              </ChoiceButton>
                            </div>
                            {officeSearchOpen ? (
                              <div className="mt-2">
                                <label htmlFor="onboarding-office-search" className="sr-only">Cari kawasan kantor</label>
                                <input
                                  id="onboarding-office-search"
                                  type="search"
                                  value={officeQuery}
                                  onChange={(event) => setOfficeQuery(event.target.value)}
                                  placeholder="Cari Kuningan, SCBD, atau TB Simatupang"
                                  className="input input-bordered min-h-11 w-full text-sm"
                                />
                                {officeQuery && (
                                  matchingOffices.length ? (
                                    <ul className="menu mt-1 w-full rounded-lg border border-rule bg-base-100 p-1 text-sm shadow-overlay">
                                      {matchingOffices.map((office) => (
                                        <li key={office.name}>
                                          <button type="button" onClick={() => chooseOffice(office.name)} className="min-h-10">
                                            {office.name}
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : <p className="mt-1 text-xs text-ink-muted">Belum ada kawasan yang cocok. Pilih titik langsung di peta.</p>
                                )}
                              </div>
                            ) : (
                              <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                                Klik kawasan kantor di peta untuk menjawab.
                                {mapPoint && <span className="block font-semibold text-ink">Titik dipilih: {mapPoint.latitude.toFixed(3)}, {mapPoint.longitude.toFixed(3)}</span>}
                              </p>
                            )}
                          </>
                        )}
                        {isTransportQuestion && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {(["Transport umum", "Motor", "Mobil"] as const).map((option) => (
                              <ChoiceButton key={option} pressed={transport === option} onClick={() => setTransport(transport === option ? null : option)}>
                                {option}
                              </ChoiceButton>
                            ))}
                          </div>
                        )}
                      </section>
                    );
                  })}
                </div>
              ) : proposal ? (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Tidak ada pertanyaan lanjutan untuk ceritamu.</p>
              ) : (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Kirim ceritamu untuk melihat pertanyaan lanjutan.</p>
              )}
            </section>
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-rule bg-base-100 px-4 py-3 md:px-5">
            <button type="button" onClick={() => goToStep(1)} className="btn btn-outline btn-neutral min-h-11 rounded-xl px-3">
              <ArrowLeft aria-hidden="true" className="size-4" /> Kembali
            </button>
            <button type="button" disabled={isSubmitting} onClick={() => void continueToReview()} className="btn btn-primary min-h-11 rounded-xl px-4">
              {isSubmitting ? "Menganalisis rencana…" : "Lanjut ke tinjau"} {!isSubmitting && <ArrowRight aria-hidden="true" className="size-4" />}
            </button>
          </footer>
        </aside>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby={step === 3 ? "onboarding-step-three-title" : "onboarding-step-one-title"}
        data-hci-region={step === 3 ? "relocation-onboarding-step-3" : "relocation-onboarding-step-1"}
        className="modal modal-middle onboarding-dialog"
        onClose={handleDialogClose}
      >
        {step === 1 && (
          <form
            className="modal-box flex max-h-[calc(100dvh-1.5rem)] w-[min(42.75rem,calc(100vw-1.5rem))] max-w-none flex-col overflow-y-auto overscroll-contain rounded-2xl border border-rule bg-base-100 p-4 text-ink shadow-overlay md:p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void handleStorySubmit();
            }}
            aria-busy={isSubmitting}
          >
            <StepHeader step={1} onSkip={dismiss} />

            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Akun siap · satu langkah lagi</p>
            <h1 id="onboarding-step-one-title" className="mt-1 font-sans text-2xl font-bold leading-tight tracking-tight text-ink md:text-[1.75rem]">
              Ceritakan rencana pindahmu
            </h1>
            {savedProfile && <p role="status" className="mt-1 text-xs text-ink-muted">Profil tersimpan · revisi {savedProfile.revision}</p>}
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">Tulis seperti bercerita ke teman.</p>

            <label htmlFor="relocation-story" className="sr-only">Ceritakan rencana pindahmu</label>
            <div className="mt-4 rounded-xl border-2 border-primary bg-base-100 p-3 focus-within:ring-2 focus-within:ring-primary/20 md:p-4">
              <textarea
                id="relocation-story"
                name="message"
                value={story}
                maxLength={MAX_STORY_LENGTH}
                onChange={(event) => { setStory(event.target.value); resetProposal(); }}
                placeholder={placeholderStory}
                disabled={isSubmitting}
                required
                className="textarea min-h-40 w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed text-ink outline-none focus:border-0 focus:outline-none md:min-h-52 md:text-base"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <span className="sr-only">Bahasa cerita</span>
                  <select name="language" value={language} disabled={isSubmitting} onChange={(event) => { setLanguage(event.target.value); resetProposal(); }} className="select select-bordered select-xs min-h-9 rounded-lg bg-base-100 text-xs text-ink">
                    <option>Bahasa Indonesia</option>
                    <option>English</option>
                  </select>
                </label>
                <span className="text-xs tabular-nums text-ink-muted">{story.length} / {MAX_STORY_LENGTH}</span>
                <button type="button" disabled aria-label="Input suara belum tersedia" title="Input suara belum tersedia" className="btn btn-ghost btn-square btn-sm min-h-9 text-ink">
                  <Mic aria-hidden="true" className="size-4" />
                </button>
              </div>
            </div>

            <section className="mt-3" aria-labelledby="story-topics-title">
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span id="story-topics-title" className="mr-1 font-semibold text-ink-muted">Topik cerita:</span>
                {onboardingTopics.map(({ key, label }) => {
                  const match = extractedProfile.topics[key];
                  return (
                    <span
                      key={key}
                      aria-label={`${label}: ${match ? "terdeteksi dari cerita" : "belum disebut"}`}
                      className={`badge badge-sm rounded-md px-2 ${match ? "badge-primary badge-soft" : "badge-outline border-dashed border-ink-muted text-ink-muted"}`}
                    >
                      {match && <Check aria-hidden="true" className="mr-1 size-3" />}{label}
                    </span>
                  );
                })}
              </div>
            </section>

            <RequestError error={requestError} />

            <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
              <div className="flex items-center gap-2">
                <button type="button" disabled={isSubmitting} onClick={() => { onOpenForm(); setStep(0); }} className="btn btn-outline btn-neutral min-h-11 rounded-xl px-3">
                  <CheckSquare aria-hidden="true" className="size-4" /> Isi formulir
                </button>
                <p className="hidden max-w-32 text-[11px] leading-snug text-ink-muted sm:block">Jangan tulis NIK, alamat rumah, atau data kesehatan.</p>
              </div>
              <button type="submit" disabled={isSubmitting || !story.trim()} className="btn btn-primary min-h-11 rounded-xl px-4">
                {isSubmitting ? "Menganalisis rencana…" : "Baca rencanaku"} {!isSubmitting && <ArrowRight aria-hidden="true" className="size-4" />}
              </button>
            </footer>
          </form>
        )}

        {step === 3 && (
          <section className="modal-box max-h-[calc(100dvh-1.5rem)] w-[min(45rem,calc(100vw-1.5rem))] max-w-none overflow-y-auto overscroll-contain rounded-2xl border border-rule bg-base-100 p-4 text-ink shadow-overlay md:p-6">
            <StepHeader step={3} onSkip={dismiss} />

            <h1 id="onboarding-step-three-title" className="mt-4 font-sans text-2xl font-bold leading-tight text-ink md:text-[1.75rem]">
              Apakah usulan ini sesuai?
            </h1>
            <p className="mt-1 text-sm leading-relaxed text-ink-muted">Periksa ringkasan rencana pindahmu.</p>

            <section className="mt-3 rounded-xl border border-ink px-3 py-2" aria-label="Kesimpulan yang perlu dikonfirmasi">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2 text-xs">
                <p className="font-semibold">{proposal?.inferred_fields.length ?? 0} kesimpulan dari ceritamu</p>
                <span className="badge badge-outline badge-sm border-ink-muted text-ink-muted">Perlu konfirmasi</span>
              </div>
              {proposal?.inferred_fields.length ? (
                <div className="grid gap-2 pt-2 text-xs md:grid-cols-2">
                  {proposal.inferred_fields.map((field) => (
                    <ConfirmationRow
                      key={field}
                      label={profileFieldLabels[field] ?? field}
                      value={getInferredValue(field, profileRows)}
                      confirmed={!!confirmedFields[field]}
                      onConfirm={() => toggleFieldConfirmation(field)}
                      onEdit={() => goToStep(1)}
                    />
                  ))}
                </div>
              ) : (
                <p className="pt-2 text-xs text-ink-muted">Tidak ada nilai inferensi yang menunggu konfirmasi.</p>
              )}
            </section>

            <div className="mt-3 grid gap-x-5 gap-y-3 sm:grid-cols-2">
              {profileRows.map((row) => (
                <ReviewSummary key={row.key} title={row.label} onEdit={() => goToStep(1)}>
                  {row.priorityWeights ? <PriorityWeights weights={row.priorityWeights} /> : row.value}
                </ReviewSummary>
              ))}
            </div>

            {proposal?.clarification_questions.length ? (
              <div className="mt-3 rounded-xl border border-rule px-3 py-2 text-xs text-ink" aria-label="Pertanyaan klarifikasi">
                <p className="font-semibold">Pertanyaan lanjutan</p>
                <ul className="mt-1 list-inside list-disc">
                  {proposal.clarification_questions.map((question) => <li key={question}>{question}</li>)}
                </ul>
              </div>
            ) : null}

            <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
              <button type="button" onClick={() => goToStep(2)} className="btn btn-outline btn-neutral min-h-11 rounded-xl px-3">
                <ArrowLeft aria-hidden="true" className="size-4" /> Kembali
              </button>
              <button type="button" disabled={!canConfirmProfile || isSaving} onClick={() => void saveProfile()} className="btn btn-primary min-h-11 rounded-xl px-4">
                {isSaving ? "Menyimpan profil…" : "Simpan dan selesaikan"} {!isSaving && <ArrowRight aria-hidden="true" className="size-4" />}
              </button>
            </footer>
            {saveError && <div role="alert" className="alert alert-error mt-3 text-sm">{saveError}</div>}
            {saveError?.startsWith("Masuk") && <Link href="/login?next=%2Fmap" className="btn btn-outline mt-2 min-h-11 border-ink text-ink">Masuk untuk menyimpan</Link>}
          </section>
        )}
      </dialog>
    </>
  );
}

function StepHeader({ step, onSkip, className = "" }: { step: 1 | 2 | 3; onSkip: () => void; className?: string }) {
  return (
    <header className={`flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs font-semibold text-ink ${className}`}>
      <div className="flex items-center gap-3">
        <span>Langkah {step} dari 3</span>
        <span className="flex w-20 gap-1" aria-hidden="true">
          {[1, 2, 3].map((bar) => <span key={bar} className={`h-0.75 flex-1 rounded-full ${bar <= step ? "bg-primary" : "bg-base-300"}`} />)}
        </span>
      </div>
      <button type="button" onClick={onSkip} className="btn btn-ghost btn-xs min-h-10 shrink-0 gap-1 px-1 text-ink">
        Lewati untuk sekarang <X aria-hidden="true" className="size-3.5" />
      </button>
    </header>
  );
}

function ChoiceButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick}
      className={`btn btn-sm min-h-10 rounded-xl px-2.5 text-xs ${pressed ? "btn-primary" : "btn-outline border-ink-muted bg-base-100 text-ink"}`}>
      {children}
    </button>
  );
}

// Errors that ask the user to sign in also offer the sign-in link.
function RequestError({ error }: { error: string | null }) {
  if (!error) return null;
  return <>
    <p role="alert" className="mt-3 text-sm font-semibold text-error">{error}</p>
    {error.startsWith("Masuk") && <Link href="/login?next=%2Fmap" className="btn btn-outline mt-2 min-h-11 border-ink text-ink">Masuk untuk melanjutkan</Link>}
  </>;
}

function ConfirmationRow({ label, value, confirmed, onConfirm, onEdit }: {
  label: string; value: string; confirmed: boolean; onConfirm: () => void; onEdit: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p className="min-w-0 leading-snug wrap-break-word"><span className="font-semibold">{label}:</span> {value}</p>
      <div className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={onConfirm} aria-pressed={confirmed} className={`btn btn-xs min-h-11 rounded-lg px-2 ${confirmed ? "btn-primary" : "btn-outline border-ink-muted text-ink"}`}>
          <Check aria-hidden="true" className="size-3" /> {confirmed ? "Dikonfirmasi" : "Benar"}
        </button>
        <button type="button" onClick={onEdit} className="btn btn-ghost btn-xs min-h-11 px-2 text-primary">Ubah</button>
      </div>
    </div>
  );
}

function ReviewSummary({ title, children, onEdit }: { title: string; children: ReactNode; onEdit: () => void }) {
  return (
    <section className="border-t-2 border-ink pt-1.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <button type="button" onClick={onEdit} className="btn btn-ghost btn-xs min-h-9 px-1 text-primary underline">Ubah</button>
      </div>
      <div className="text-xs leading-relaxed text-ink">{children}</div>
    </section>
  );
}
