"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CheckSquare, MapPin, Mic, X } from "lucide-react";
import { extractUserProfile, onboardingTaxonomy, onboardingTopics } from "../../engine/extractUserProfile";
import { validateRelocationProfileProposal, type RelocationProfileProposal } from "../../engine/lib/relocationProfileInterpretationValidation";
import type { StoredRelocationProfile } from "../../engine/lib/relocationProfile";
import { handleAuthFailure } from "../../engine/lib/authRedirect";
import { isRecord } from "../../engine/lib/zoneGeometry";
import { formatRupiah, transportModeLabels } from "../../engine/onboarding/demoData";
import { draftKeys, type FormSession, type LiveOnboardingPreview, type Priority } from "../../engine/onboarding/types";
import { readOnboardingDraft, writeOnboardingDraft } from "../../engine/onboarding/draftStorage";
import { accountFetch, type AccountScope } from "../../engine/lib/accountIdentity";
import { getRelocationGoal, relocationGoalLabels, type RelocationGoal } from "../../engine/lib/relocationGoal";
import { saveRelocationProfile } from "../../engine/lib/relocationProfileApi";
import { applyProfileExplicitDetails, applyProfileFieldEdit, getProfileClarificationField, getProfileTargetCity, groundProfileTransport, parseProfileCommuteAnswer, type ProfileClarificationAnswer, type ProfileFollowUpDetails } from "../../engine/lib/relocationProfileInterpretationFollowUp";
import { getProfileTransportQuestion, parseProfileTransportAnswer } from "../../engine/lib/relocationProfileInterpretationTransport";
import { RadioChoices } from "./onboarding/FormControls";
import type { MonthlyCostRange } from "../../engine/onboarding/livePreview";
import ProfileFieldEditor, { editableProfileFields } from "./onboarding/ProfileFieldEditor";
import StoryReviewPanel from "./onboarding/StoryReviewPanel";
import { priorityKeys } from "../../engine/onboarding/preview";
import { storyPriorityWeights, updateStoryPriority } from "../../engine/onboarding/storyPriorities";
import DistrictListItem from "./onboarding/DistrictListItem";
import { visiblePreviewDistricts } from "../../engine/onboarding/visibleDistricts";

const MAX_STORY_LENGTH = 1000;
const compactMoney = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

const placeholderStory = "Saya berencana pindah untuk bekerja di bidang teknologi. Saya mencari kos dengan batas sewa dan anggaran bulanan tertentu. Saya lebih nyaman naik transportasi umum dan ingin memahami pilihan kecamatan yang sesuai.";

export type OfficeChoice = "Belum tahu" | "Dipilih di peta";
type TransportChoice = "Transport umum" | "Motor" | "Mobil";
export type StoryStep = 0 | 1 | 2 | 3;
type Step = StoryStep;

type Draft = {
  step: Exclude<Step, 0>;
  story: string;
  office: OfficeChoice;
  transport: TransportChoice | null;
  proposal?: RelocationProfileProposal | null;
  clarificationAnswers?: Record<string, string>;
  explicitGoal?: RelocationGoal | null;
  analyzedInput?: string | null;
  mapPoint?: MapPoint | null;
  prioritySuggestion?: { weights: Record<string, number>; inferred: boolean } | null;
};

export type MapPoint = { longitude: number; latitude: number };

type RelocationOnboardingProps = {
  account: AccountScope;
  // The map previews the unsaved proposal in steps 2 and 3.
  step: StoryStep;
  onStepChange: (step: StoryStep) => void;
  proposal: RelocationProfileProposal | null;
  onProposalChange: (proposal: RelocationProfileProposal | null) => void;
  savedProfile: StoredRelocationProfile | null;
  savedProfileLoaded: boolean;
  skipRestoredDraft?: boolean;
  onSaveProfile: (profile: StoredRelocationProfile) => void;
  mapPoint: MapPoint | null;
  onMapPointChange: (point: MapPoint | null) => void;
  selectedOffice: OfficeChoice;
  onOfficeChange: (office: OfficeChoice) => void;
  onMapPickingChange: (picking: boolean) => void;
  mapPicking?: boolean;
  preview?: LiveOnboardingPreview | null;
  selectedDistrictId?: string | null;
  onSelectDistrict?: (id: string) => void;
  onOnboardingActiveChange: (active: boolean) => void;
  formSession: FormSession | null;
  formReady: boolean;
  storyOpenRequest: number;
  onOpenForm: () => void;
  // Estimated monthly spending across the target city's districts, shown on the review step.
  costRange?: MonthlyCostRange | null;
  costCityName?: string | null;
  costLoading?: boolean;
};

const profileFields: [field: string, label: string][] = [
  ["goal", "Tujuan"],
  ["target_occupations", "Pekerjaan"],
  ["destination_cities", "Kota tujuan"],
  ["housing_budget", "Batas sewa"],
  ["monthly_budget", "Anggaran bulanan"],
  ["commute_minutes", "Waktu tempuh"],
  ["transport_mode", "Moda transportasi"],
  ["destination", "Lokasi tujuan"],
];

const priorityLabels: Record<string, string> = {
  career: "Karier",
  housing: "Biaya hunian",
  commute: "Waktu tempuh",
  education: "Pendidikan",
  cost_of_living: "Biaya hidup",
  environment: "Lingkungan",
};

function followUpInputKey(clarificationAnswers: Record<string, string>, explicitGoal: RelocationGoal | null,
  transport: TransportChoice | null, selectedOffice: string, mapPoint: MapPoint | null) {
  return JSON.stringify({ clarificationAnswers, explicitGoal, transport, selectedOffice, mapPoint });
}

function formatWeight(key: string, weight: number) {
  return `${priorityLabels[key] ?? key} ${Math.round(weight * 100)}%`;
}

function formatProfileValue(field: string, value: unknown): string {
  if (value === null || value === undefined) return "Belum ada";
  if (Array.isArray(value) && value.length === 0) return "Belum ada";
  if ((field === "monthly_budget" || field === "housing_budget") && isRecord(value) && typeof value.amount === "number") {
    return `Rp${formatRupiah(value.amount)} / bulan`;
  }
  if (field === "commute_minutes" && typeof value === "number") return `${value} menit`;
  if (field === "goal" && typeof value === "string") {
    return relocationGoalLabels[value as RelocationGoal] ?? value;
  }
  if (field === "transport_mode" && typeof value === "string") return transportModeLabels[value] ?? value;
  if (field === "destination" && isRecord(value) && typeof value.name === "string") return value.name;
  if (field === "target_occupations" && Array.isArray(value)) {
    return value.map((id) => onboardingTaxonomy.occupations.find((item) => item.id === id)?.label ?? String(id)).join(", ");
  }
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "Belum ada";
}

function formatProfileChip(field: string, value: unknown) {
  if (field === "housing_budget" && isRecord(value) && typeof value.amount === "number") return `Sewa ≤ Rp${compactMoney.format(value.amount)}`;
  if (field === "commute_minutes" && typeof value === "number") return `≤ ${value} mnt`;
  return formatProfileValue(field, value);
}

type ProfileDisplayRow = {
  key: string;
  field: string;
  label: string;
  value: string;
  inferred: boolean;
  missing: boolean;
  priorityWeights?: Record<string, number>;
};

function getProfileRows(profile: RelocationProfileProposal): ProfileDisplayRow[] {
  const rows: ProfileDisplayRow[] = [];

  for (const [field, label] of profileFields) {
    const value = profile.hard_constraints[field] ?? profile.soft_preferences[field];
    rows.push({
      key: field,
      field,
      label,
      value: formatProfileValue(field, value),
      inferred: profile.inferred_fields.includes(field),
      missing: value === undefined || value === null || (Array.isArray(value) && value.length === 0),
    });
  }

  rows.push({
    key: "priorities",
    field: "priorities",
    label: "Prioritas",
    value: Object.entries(profile.priority_weights).map(([key, weight]) => formatWeight(key, weight)).join(" · ") || "Belum ditentukan",
    inferred: profile.inferred_fields.includes("priorities"),
    missing: Object.keys(profile.priority_weights).length === 0,
    priorityWeights: profile.priority_weights,
  });

  return rows;
}


function priorityColor(key: string) {
  return `var(--color-priority-${key.replaceAll("_", "-")}, var(--color-ink))`;
}

function PriorityWeights({ weights }: { weights: Record<string, number> }) {
  if (!Object.keys(weights).length) return <span>Belum ditentukan</span>;
  const entries = ["career", "housing", "commute", "education", "cost_of_living", ...(weights.environment ? ["environment"] : [])].map((key) => [key, weights[key] ?? 0] as const);
  const accessibleSummary = entries.map(([key, weight]) => formatWeight(key, weight)).join(", ");

  return (
    <div className="min-w-0">
      <div
        role="img"
        aria-label={`Bobot prioritas: ${accessibleSummary}`}
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-base-200"
      >
        {entries.map(([key, weight]) => (
          <span
            key={key}
            title={formatWeight(key, weight)}
            data-priority-segment={key}
            className="h-full shrink-0"
            style={{ width: `${weight * 100}%`, backgroundColor: priorityColor(key),
              ...(key === "cost_of_living" ? { boxShadow: "inset 0 0 0 1px var(--color-ink-muted)" } : {}) }}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-[10px] font-normal leading-snug text-ink-muted">
        {entries.map(([key, weight]) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span aria-hidden="true" data-priority-swatch={key} className="size-2 shrink-0 rounded-sm ring-1 ring-inset ring-ink-muted" style={{ backgroundColor: priorityColor(key) }} />
            {formatWeight(key, weight)}
          </span>
        ))}
      </div>
    </div>
  );
}

function readDraft(userId: string): Draft | null {
  try {
    const saved = readOnboardingDraft(userId, "story");
    return isRecord(saved) ? saved as Draft : null;
  } catch {
    return null;
  }
}

export default function RelocationOnboarding({
  account,
  step,
  onStepChange: setStep,
  proposal,
  onProposalChange: setProposal,
  savedProfile,
  savedProfileLoaded,
  skipRestoredDraft = false,
  onSaveProfile,
  mapPoint,
  onMapPointChange,
  selectedOffice,
  onOfficeChange,
  onMapPickingChange,
  mapPicking = false,
  preview = null,
  selectedDistrictId = null,
  onSelectDistrict,
  onOnboardingActiveChange,
  formSession,
  formReady,
  storyOpenRequest,
  onOpenForm,
  costRange = null,
  costCityName = null,
  costLoading = false,
}: RelocationOnboardingProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const ignoreCloseRef = useRef(false);
  const reviewSummaryRef = useRef<HTMLDetailsElement>(null);
  const [story, setStory] = useState("");
  const [transport, setTransport] = useState<TransportChoice | null>(null);
  const [clarificationAnswers, setClarificationAnswers] = useState<Record<string, string>>({});
  const [explicitGoal, setExplicitGoal] = useState<RelocationGoal | null>(null);
  const [analyzedInput, setAnalyzedInput] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [prioritySuggestion, setPrioritySuggestion] = useState<Draft["prioritySuggestion"]>(null);
  const extractedProfile = extractUserProfile(story);
  const profileRows = proposal ? getProfileRows(proposal) : [];
  const summaryRows = profileRows.filter((row) => ["goal", "destination_cities", "housing_budget", "commute_minutes"].includes(row.field))
    .map((row) => ({ ...row, compactValue: row.missing ? `${row.label} belum diisi` : formatProfileChip(row.field, proposal?.hard_constraints[row.field] ?? proposal?.soft_preferences[row.field]) }));
  const clarificationQuestions = proposal?.clarification_questions ?? [];
  const officeQuestionIndex = clarificationQuestions.findIndex((question) => getProfileClarificationField(question) === "destination");
  const officeQuestion = clarificationQuestions[officeQuestionIndex];
  const transportQuestionIndex = clarificationQuestions.findIndex((question) => getProfileClarificationField(question) === "transport_mode");
  const targetCity = getProfileTargetCity(proposal, story);
  const profileGoal = proposal ? getRelocationGoal(proposal) : null;
  const currentInput = followUpInputKey(clarificationAnswers, explicitGoal, transport, selectedOffice, mapPoint);
  const followUpDirty = proposal !== null && analyzedInput !== currentInput;
  const canConfirmProfile = !!proposal && profileGoal !== null && clarificationQuestions.length === 0 && (step === 3 || !followUpDirty);
  const reviewWeights = storyPriorityWeights(proposal?.priority_weights ?? {});
  const prioritiesInferred = proposal?.inferred_fields.includes("priorities") ?? false;
  const opportunityLabel = profileGoal === "study" ? "Pendidikan" : profileGoal === "both" ? "Karier & pendidikan" : "Karier";
  const reviewPriorityLabels = { opportunity: opportunityLabel, affordability: "Keterjangkauan", mobility: "Mobilitas", environment: "Lingkungan" };
  const reviewPriorityHints = { opportunity: profileGoal === "study" ? "Kampus dan bidang studi" : "Kantor dan peluang karier", affordability: "Sewa dan biaya hidup", mobility: "Waktu tempuh, akses transport", environment: "Data belum tersedia" };
  const destination = proposal?.hard_constraints.destination ?? proposal?.soft_preferences.destination;
  const hasSpecificDestination = isRecord(destination) && destination.precision !== "city";
  const destinationLabel = profileGoal === "study" ? "Kampus" : profileGoal === "both" ? "Tujuan" : "Kantor";

  function answerClarification(question: string, answer: string) {
    setClarificationAnswers((current) => ({ ...current, [question]: answer }));
    setRequestError(null);
    setSaveError(null);
  }

  useEffect(() => {
    if (hydrated || !formReady) return;

    const params = new URLSearchParams(window.location.search);
    const demoRequested = params.get("onboarding") === "demo";
    const requested = params.get("welcome") === "1" || demoRequested;
    if (requested && !savedProfileLoaded) return;

    const timer = window.setTimeout(() => {
      const alreadyOnboarded = !demoRequested && savedProfile !== null;
      const ownedDraft = readDraft(account.userId);
      const draft = skipRestoredDraft ? null : ownedDraft;

      if (draft) {
        const keepMap = formSession && (formSession.status === "active" || formSession.status === "completed" || (!requested && formSession.status === "skipped"));
        // Restored map selections may need reanalysis before another confirmation.
        setStep(keepMap ? 0 : draft.step === 3 ? 2 : draft.step);
        setStory(draft.story);
        onOfficeChange(draft.office);
        if (draft.mapPoint && Number.isFinite(draft.mapPoint.latitude) && Math.abs(draft.mapPoint.latitude) <= 90 &&
            Number.isFinite(draft.mapPoint.longitude) && Math.abs(draft.mapPoint.longitude) <= 180) onMapPointChange(draft.mapPoint);
        setTransport(draft.transport);
        // Old drafts may contain a model-picked mode. Only restore user-supplied transport.
        let restoredProposal = draft.proposal ?? null;
        if (restoredProposal) {
          const hadTransportQuestion = restoredProposal.clarification_questions.some((question) => getProfileClarificationField(question) === "transport_mode");
          const answer = Object.entries(draft.clarificationAnswers ?? {}).find(([question]) => getProfileClarificationField(question) === "transport_mode")?.[1];
          const mode = parseProfileTransportAnswer(draft.transport ?? "") ?? parseProfileTransportAnswer(answer ?? "");
          restoredProposal = groundProfileTransport(restoredProposal, draft.story, mode ? { transport_mode: mode } : {});
          const questions = restoredProposal.clarification_questions.filter((question) => getProfileClarificationField(question) !== "transport_mode");
          // Keep an answered radio visible until profile interpretation processes this draft's follow-ups.
          if (!restoredProposal.soft_preferences.transport_mode || (mode && hadTransportQuestion)) questions.push(getProfileTransportQuestion());
          restoredProposal = { ...restoredProposal, clarification_questions: questions };
        }
        setProposal(restoredProposal);
        setClarificationAnswers(draft.clarificationAnswers ?? {});
        setExplicitGoal(draft.explicitGoal ?? null);
        setAnalyzedInput(draft.analyzedInput ?? null);
        setPrioritySuggestion(draft.prioritySuggestion ?? null);
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
  }, [account, formReady, formSession, hydrated, onMapPointChange, onOfficeChange, savedProfile, savedProfileLoaded, setProposal, setStep, skipRestoredDraft]);

  useEffect(() => {
    if (!storyOpenRequest) return;
    const timer = window.setTimeout(() => setStep(1), 0);
    return () => window.clearTimeout(timer);
  }, [setStep, storyOpenRequest]);

  useEffect(() => {
    if (!hydrated) return;
    if (step === 0) {
      try { if (!formSession && !skipRestoredDraft) sessionStorage.removeItem(draftKeys(account.userId).story); } catch { /* Browser storage is optional. */ }
      return;
    }

    const draft: Draft = { step, story, office: selectedOffice, transport, proposal, clarificationAnswers, explicitGoal, analyzedInput, mapPoint, prioritySuggestion };
    try { writeOnboardingDraft(account.userId, "story", draft); } catch { /* Saving to the backend remains available. */ }
  }, [account, analyzedInput, clarificationAnswers, explicitGoal, formSession, hydrated, mapPoint, proposal, selectedOffice, skipRestoredDraft, step, story, transport, prioritySuggestion]);

  useEffect(() => {
    const shouldShowDialog = step === 1 && formSession?.status !== "active";
    const dialog = dialogRef.current;

    onMapPickingChange(step === 2 && officeQuestionIndex >= 0 && selectedOffice === "Dipilih di peta" && !isSubmitting);
    if (!dialog) return;

    if (shouldShowDialog && !dialog.open) {
      dialog.showModal();
    } else if (!shouldShowDialog && dialog.open) {
      ignoreCloseRef.current = true;
      dialog.close();
    }
  }, [formSession, isSubmitting, officeQuestionIndex, onMapPickingChange, selectedOffice, step]);

  useEffect(() => {
    onOnboardingActiveChange(!hydrated || step > 0 || formSession?.status === "active");
  }, [formSession, hydrated, onOnboardingActiveChange, step]);

  useEffect(() => () => onMapPickingChange(false), [onMapPickingChange]);

  function dismiss() {
    try { sessionStorage.removeItem(draftKeys(account.userId).story); } catch { /* Closing works without browser storage. */ }
    setStep(0);
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
    setEditingField(null);
    setStep(nextStep);
  }

  // A review-step correction replaces the interpreted value; the server re-validates the proposal on save.
  function saveFieldEdit(field: string, value: unknown) {
    if (!proposal) return;
    try {
      setProposal(validateRelocationProfileProposal(applyProfileFieldEdit(proposal, field, value), onboardingTaxonomy));
      if (field === "destination") {
        onOfficeChange("Belum tahu");
        onMapPointChange(null);
        setAnalyzedInput(followUpInputKey(clarificationAnswers, explicitGoal, transport, "Belum tahu", null));
      }
      setEditingField(null);
      setEditError(null);
      setSaveError(null);
    } catch {
      setEditError("Nilai ini belum bisa disimpan. Coba nilai lain.");
    }
  }

  function changePriority(key: Priority, value: number) {
    if (!proposal || !profileGoal || isSaving) return;
    setProposal(validateRelocationProfileProposal({ ...proposal,
      priority_weights: updateStoryPriority(proposal.priority_weights, profileGoal, key, value),
      inferred_fields: proposal.inferred_fields.filter((field) => field !== "priorities"),
    }, onboardingTaxonomy));
    setSaveError(null);
  }

  function getFollowUpRequest(): { answers: ProfileClarificationAnswer[]; details: ProfileFollowUpDetails } {
    const details: ProfileFollowUpDetails = {};
    if (transport) details.transport_mode = ({ "Transport umum": "transit", Motor: "motorcycle", Mobil: "car" } as const)[transport];
    const answers = { ...clarificationAnswers };
    const destinationAnswer = officeQuestion ? answers[officeQuestion] : Object.entries(answers).reverse().find(([question]) => getProfileClarificationField(question) === "destination")?.[1];
    if (selectedOffice === "Dipilih di peta" && mapPoint) {
      details.destination = { name: "Dipilih di peta", precision: "point", latitude: mapPoint.latitude, longitude: mapPoint.longitude };
    } else if (selectedOffice !== "Belum tahu" && selectedOffice !== "Dipilih di peta") {
      details.destination = { name: selectedOffice, precision: "area" };
    } else if (destinationAnswer?.trim()) {
      if (destinationAnswer === "Belum tahu") {
        if (targetCity) details.destination = { name: targetCity, precision: "city" };
      } else details.destination = { name: destinationAnswer.trim(), precision: "area" };
    }
    if (officeQuestion && details.destination?.precision === "point") answers[officeQuestion] =
      `Lokasi kantor dipilih di peta: ${mapPoint!.latitude.toFixed(5)}, ${mapPoint!.longitude.toFixed(5)}`;
    const boundAnswers: ProfileClarificationAnswer[] = Object.entries(answers).filter(([, answer]) => answer.trim()).map(([question, answer]) => {
      if (getProfileClarificationField(question) !== "commute_minutes") return { question, answer };
      const minutes = parseProfileCommuteAnswer(answer);
      if (minutes === null) throw new Error("Isi waktu tempuh dengan 0–240 menit, misalnya 45.");
      details.commute_minutes = minutes;
      return { question, answer: `${minutes} menit`, field: "commute_minutes" };
    });
    return { answers: boundAnswers, details };
  }

  // `fresh` analyzes the story alone, ignoring step-2 state that has been reset but not yet re-rendered.
  async function requestProfile(followUp?: ReturnType<typeof getFollowUpRequest>, fresh = false) {
    if (isSubmitting || account.signal.aborted) return null;
    if (!story.trim()) {
      setRequestError("Ceritakan rencana pindahmu terlebih dahulu.");
      return null;
    }

    setIsSubmitting(true);
    setRequestError(null);
    try {
      const submitted = followUp ?? getFollowUpRequest();
      const { response, result } = await accountFetch(account, "/api/relocation-profile-interpretation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(125_000),
        body: JSON.stringify({
          message: story,
          language: "id",
          clarification_answers: submitted.answers,
          ...(explicitGoal && !fresh ? { goal: explicitGoal } : {}),
          details: submitted.details,
        }),
      });
      if (handleAuthFailure(response)) {
        setRequestError("Masuk untuk menganalisis rencanamu.");
        return null;
      }
      if (!response.ok || !isRecord(result) || !isRecord(result.profile)) {
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Gagal membaca rencana. Coba lagi.");
      }

      const nextProposal = validateRelocationProfileProposal(result.profile, onboardingTaxonomy);
      setProposal(nextProposal);
      setPrioritySuggestion({ weights: nextProposal.priority_weights, inferred: nextProposal.inferred_fields.includes("priorities") });
      setAnalyzedInput(fresh ? followUpInputKey({}, null, null, "Belum tahu", null) : currentInput);
      return nextProposal;
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Gagal membaca rencana. Coba lagi.");
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleStorySubmit() {
    // A (re)submitted story starts over: step-2 answers from an earlier story are asked again, not reused.
    resetFollowUps();
    const result = await requestProfile({ answers: [], details: {} }, true);
    if (result) setStep(2);
  }

  function resetFollowUps() {
    setClarificationAnswers({});
    setExplicitGoal(null);
    setAnalyzedInput(null);
    setTransport(null);
    setPrioritySuggestion(null);
    onOfficeChange("Belum tahu");
    onMapPointChange(null);
  }

  async function continueToReview() {
    if (isSubmitting) return;
    if (!explicitGoal && !profileGoal) {
      setRequestError("Kamu pindah untuk kerja, kuliah, atau keduanya? Pilih tujuan lalu lanjutkan.");
      return;
    }
    try {
      const followUp = getFollowUpRequest();
      const unanswered = clarificationQuestions.find((question) => {
        const field = getProfileClarificationField(question);
        if (field === "goal") return !(explicitGoal ?? profileGoal);
        if (field === "destination" && followUp.details.destination) return false;
        if (field === "transport_mode") return !followUp.details.transport_mode;
        return !clarificationAnswers[question]?.trim();
      });
      if (unanswered) {
        setRequestError(`Jawab dulu: ${unanswered}`);
        return;
      }
      // Question presence, not a dirty flag, determines whether Next calls profile interpretation.
      const result = !proposal || clarificationQuestions.length ? await requestProfile(followUp)
        : followUpDirty ? validateRelocationProfileProposal(applyProfileExplicitDetails(proposal, explicitGoal ?? undefined, followUp.details), onboardingTaxonomy) : proposal;
      if (!result) return;
      if (result.clarification_questions.length) {
        setRequestError("Ada pertanyaan baru. Lengkapi dulu sebelum meninjau.");
        return;
      }
      if (!getRelocationGoal(result)) {
        setRequestError("Pilih tujuan pindahmu sebelum meninjau.");
        return;
      }
      setProposal(result);
      if (!prioritySuggestion) setPrioritySuggestion({ weights: result.priority_weights, inferred: result.inferred_fields.includes("priorities") });
      setAnalyzedInput(currentInput);
      setStep(3);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "Jawaban belum bisa diproses. Coba lagi.");
    }
  }

  async function saveProfile() {
    if (!proposal || !canConfirmProfile || isSaving || editingField !== null || mapPicking) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const saved = await saveRelocationProfile({
        proposal,
        // Saving the reviewed summary confirms every inferred field, including backend-only ones like the sector.
        confirmed_fields: proposal.inferred_fields,
      }, account);
      onSaveProfile(saved);
      dismiss();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Profil belum tersimpan. Coba lagi.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateStory(value: string) {
    setStory(value);
    setProposal(null);
    setSaveError(null);
    setRequestError(null);
  }

  function chooseOffice(office: OfficeChoice) {
    onOfficeChange(office);
    if (office !== "Dipilih di peta") onMapPointChange(null);
    if (officeQuestionIndex >= 0) answerClarification(clarificationQuestions[officeQuestionIndex], office);
  }

  return (
    <>
      {step === 2 && (
        <aside
          aria-labelledby="onboarding-step-two-title"
          data-hci-region="relocation-onboarding-step-2"
          className="onboarding-story-panel absolute inset-x-2 bottom-2 z-400 flex max-h-[min(56dvh,42rem)] flex-col overflow-hidden rounded-2xl border border-rule bg-base-100 shadow-overlay md:inset-y-2 md:left-auto md:right-2 md:max-h-none md:w-[min(26.5rem,45vw)]"
        >
          <StepHeader step={2} onSkip={dismiss} disabled={isSubmitting} className="border-b border-rule px-4 py-3 md:px-5" />

          <form id="story-follow-up-form" aria-busy={isSubmitting} onSubmit={(event) => { event.preventDefault(); void continueToReview(); }} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 md:px-5 md:py-4">
            <div className="flex items-start justify-between gap-3">
              <h1 id="onboarding-step-two-title" className="font-sans text-2xl font-bold leading-tight text-ink md:text-[1.75rem]">
                Ini yang kami tangkap
              </h1>
              <button type="button" disabled={isSubmitting} onClick={() => goToStep(1)} className="btn btn-ghost btn-xs min-h-9 shrink-0 px-1 text-primary underline">
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

            <dl data-hci-region="onboarding-profile-preview" className="mt-3 divide-y divide-rule border-y border-rule">
              {profileRows.map((row) => (
                <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2 text-xs sm:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
                  <dt className="text-ink-muted">{row.label}</dt>
                  <dd className="min-w-0 font-semibold text-ink">
                    {row.priorityWeights ? <PriorityWeights weights={row.priorityWeights} /> : row.value}
                  </dd>
                  <dd>
                    <span className={`badge badge-sm col-start-2 max-w-full text-center whitespace-normal sm:col-start-auto ${row.missing ? "badge-outline border-ink-muted text-ink" : "badge-neutral"}`}>
                      {row.missing ? "Belum diisi" : row.inferred ? "Disimpulkan" : "Terbaca"}
                    </span>
                  </dd>
                </div>
              ))}
              {!proposal && <div className="py-3 text-xs text-ink-muted">Cerita belum dianalisis. Kirim cerita untuk melihat ringkasannya.</div>}
              {proposal && !profileRows.length && <div className="py-3 text-xs text-ink-muted">Belum ada batasan atau preferensi yang bisa ditampilkan.</div>}
            </dl>
            {profileRows
              .filter((row) => row.field === "goal" && !(explicitGoal ?? profileGoal))
              .map((row) => {
                return (
                  <div key={row.key}>
                    <fieldset disabled={isSubmitting} className="mt-3">
                      <RadioChoices
                        name="story-goal"
                        label="Tujuan pindah"
                        value={""}
                        choices={Object.entries(relocationGoalLabels).map(([value, label]) => ({
                          value: value as RelocationGoal,
                          label
                        }))}
                        onChange={(goal) => {
                          setExplicitGoal(goal as RelocationGoal);
                          answerClarification("Tujuan pindah", relocationGoalLabels[goal as RelocationGoal]);
                        }}
                      />
                    </fieldset>
                  </div>
                );
              })}
            <RequestError error={requestError} />

            <section className="mt-3 border-t-2 border-ink pt-3" aria-label="Pertanyaan lanjutan">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                  {proposal
                    ? clarificationQuestions.length
                      ? `Tinggal ${clarificationQuestions.length} pertanyaan`
                      : "Tidak ada pertanyaan lanjutan"
                    : "Pertanyaan lanjutan"}
                </p>
                <span className="badge badge-outline badge-sm border-dashed border-ink-muted text-ink-muted">
                  {proposal ? "Dari ceritamu" : "Menunggu cerita"}
                </span>
              </div>
              {clarificationQuestions.length ? (
                <fieldset disabled={isSubmitting} className="mt-2 space-y-3">
                  {clarificationQuestions.map((question, index) => {
                    const isOfficeQuestion = index === officeQuestionIndex;
                    const isTransportQuestion = index === transportQuestionIndex;

                    return (
                      <section key={`${index}:${question}`} className="rounded-lg bg-base-200/50 px-2.5 py-2">
                        {!isTransportQuestion && <h2 className="text-sm font-semibold leading-relaxed text-ink">{question}</h2>}
                        {isOfficeQuestion && (
                          <>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <ChoiceButton pressed={selectedOffice === "Belum tahu" && clarificationAnswers[question] === "Belum tahu"} onClick={() => chooseOffice("Belum tahu")}>
                                {clarificationAnswers[question] === "Belum tahu" && <Check aria-hidden="true" className="size-3.5" />}
                                Belum tahu
                              </ChoiceButton>
                              <ChoiceButton pressed={selectedOffice === "Dipilih di peta"} onClick={() => { chooseOffice("Dipilih di peta"); onMapPickingChange(true); }}>
                                {selectedOffice === "Dipilih di peta" && <Check aria-hidden="true" className="size-3.5" />} Pilih titik di peta
                              </ChoiceButton>
                            </div>
                            <label htmlFor={`destination-${index}`} className="mt-2 block text-xs font-semibold">Atau tulis lokasi tujuanmu</label>
                            <input id={`destination-${index}`} name="destination" type="text" maxLength={200}
                              value={selectedOffice === "Belum tahu" && clarificationAnswers[question] !== "Belum tahu" ? clarificationAnswers[question] ?? "" : ""}
                              onChange={(event) => { onOfficeChange("Belum tahu"); onMapPointChange(null); answerClarification(question, event.target.value); }}
                              className="input mt-1 min-h-11 w-full border-ink/25 bg-base-100 text-base md:text-sm" />
                            {targetCity && <p className="mt-1 text-xs text-ink-muted">Belum tahu? Lokasi tujuanmu tetap {targetCity}.</p>}
                            <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">
                              Pilih titik langsung pada peta; lokasi tujuan tidak ditebak dari nama kawasan.
                              {mapPoint && <span className="block font-semibold text-ink">Titik dipilih: {mapPoint.latitude.toFixed(5)}, {mapPoint.longitude.toFixed(5)}</span>}
                            </p>
                          </>
                        )}
                        {isTransportQuestion && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <RadioChoices<TransportChoice | ""> name="story-transport" label={question} value={transport ?? ""}
                              choices={(["Transport umum", "Motor", "Mobil"] as const).map((value) => ({ value, label: value }))}
                              onChange={(option) => { if (option) { setTransport(option); answerClarification(question, option); } }} />
                          </div>
                        )}
                        {!isOfficeQuestion && !isTransportQuestion && <div className="mt-2">
                          <label htmlFor={`clarification-${index}`} className="mb-1 block text-xs font-semibold">Jawabanmu</label>
                          <input id={`clarification-${index}`} name={`clarification-${index}`} aria-label={question} type="text" maxLength={1000}
                            inputMode={getProfileClarificationField(question) === "commute_minutes" ? "numeric" : "text"}
                            value={clarificationAnswers[question] ?? ""} onChange={(event) => answerClarification(question, event.target.value)}
                            className="input min-h-11 w-full border-ink/25 bg-base-100 text-base md:text-sm" />
                        </div>}
                      </section>
                    );
                  })}
                </fieldset>
              ) : proposal ? (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Tidak ada pertanyaan lanjutan untuk ceritamu.</p>
              ) : (
                <p className="mt-2 text-[11px] leading-relaxed text-ink-muted">Kirim ceritamu untuk melihat pertanyaan lanjutan.</p>
              )}
            </section>
          </form>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-rule bg-base-100 px-4 py-3 md:px-5">
            <button type="button" disabled={isSubmitting} onClick={() => goToStep(1)} className="btn btn-outline btn-neutral min-h-11 rounded-xl px-3">
              <ArrowLeft aria-hidden="true" className="size-4" /> Kembali
            </button>
            <button type="submit" form="story-follow-up-form" disabled={isSubmitting} className="btn btn-primary min-h-11 rounded-xl px-4">
              {isSubmitting ? "Menganalisis rencana…" : "Tinjau rencanamu"} {!isSubmitting && <ArrowRight aria-hidden="true" className="size-4" />}
            </button>
          </footer>
        </aside>
      )}

      <dialog
        ref={dialogRef}
        aria-labelledby="onboarding-step-one-title"
        data-hci-region="relocation-onboarding-step-1"
        className="modal modal-middle onboarding-dialog"
        onClose={handleDialogClose}
        onCancel={(event) => { if (isSubmitting || isSaving) event.preventDefault(); }}
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
            <StepHeader step={1} onSkip={dismiss} disabled={isSubmitting} />

            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Akun siap · beberapa langkah lagi</p>
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
                onChange={(event) => updateStory(event.target.value)}
                placeholder={placeholderStory}
                disabled={isSubmitting}
                required
                className="textarea min-h-40 w-full resize-y border-0 bg-transparent p-0 text-sm leading-relaxed text-ink outline-none focus:border-0 focus:outline-none md:min-h-52 md:text-base"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
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

      </dialog>
      {step === 3 && <StoryReviewPanel saving={isSaving} onDismiss={dismiss} onSubmit={() => void saveProfile()}
        header={<StepHeader step={3} onSkip={dismiss} disabled={isSaving} compact className="px-5 pb-2 pt-1 md:pt-4" />}
        footer={<>
          <button type="button" disabled={isSaving} aria-label="Kembali" onClick={() => goToStep(2)} className="btn btn-outline btn-neutral min-h-12 rounded-xl px-3">
            <ArrowLeft aria-hidden="true" className="size-4" /><span className="hidden md:inline">Kembali</span>
          </button>
          <button type="submit" disabled={!canConfirmProfile || isSaving || editingField !== null || mapPicking} className="btn btn-primary min-h-12 min-w-0 flex-1 rounded-xl px-3 md:flex-none">
            {isSaving ? "Menyimpan profil…" : "Selesai, buka peta"} {!isSaving && <ArrowRight aria-hidden="true" className="size-4" />}
          </button>
        </>}>
        <section aria-label="Profil dari ceritamu" data-hci-region="story-review-profile" className="mt-4 rounded-xl border border-ink/25 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="hidden text-xs font-semibold md:block">Profil dari ceritamu</h2>
            <p className="min-w-0 text-xs md:hidden">{summaryRows.filter((row) => row.field !== "destination_cities").map((row) => row.compactValue).join(" · ")}</p>
            <button type="button" onClick={() => {
              const details = reviewSummaryRef.current;
              if (!details) return;
              details.open = true;
              details.querySelector("summary")?.focus();
            }} aria-label="Ubah profil" className="btn btn-ghost min-h-11 px-1 text-xs text-primary underline">Ubah</button>
          </div>
          <div className="hidden flex-wrap gap-1.5 text-xs md:flex">
            {summaryRows.map((row) => <span key={row.field} className={`badge h-auto min-h-6 whitespace-normal py-1 ${row.missing ? "badge-outline" : "badge-neutral"}`}>{row.compactValue}</span>)}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-rule pt-1 text-xs">
            <p className="min-w-0 text-ink-muted">{destinationLabel} <strong className="text-ink">{hasSpecificDestination ? formatProfileValue("destination", destination) : "belum dipilih"}</strong></p>
            <button type="button" aria-pressed={mapPicking} onClick={() => onMapPickingChange(!mapPicking)} className="btn btn-ghost min-h-11 shrink-0 gap-1 px-1 text-xs text-primary underline">
              <MapPin aria-hidden="true" className="size-3.5" />{mapPicking ? "Batal pilih" : "Pilih di peta"}
            </button>
          </div>
          {mapPicking && <p role="status" className="pb-1 text-xs text-primary">Klik lokasi tujuanmu di peta.</p>}
        </section>
        {proposal && <section aria-label="Prioritas" data-hci-region="story-review-priorities" className="mt-3">
          <div className="flex min-h-11 items-center justify-between gap-2 text-xs">
            <p className="flex flex-wrap items-center gap-1.5">{prioritiesInferred ? <><span className="badge badge-outline badge-xs">Disimpulkan</span>Bobot dari ceritamu</> : "Bobot pilihanmu"}</p>
            {prioritiesInferred && <button type="button" onClick={() => setProposal({ ...proposal, inferred_fields: proposal.inferred_fields.filter((field) => field !== "priorities") })} className="btn btn-outline btn-neutral min-h-11 gap-1 px-2 text-xs"><Check aria-hidden="true" className="size-3.5" />Benar</button>}
          </div>
          <div className="divide-y divide-rule">
            {priorityKeys.map((key) => <div key={key} className="grid grid-cols-[minmax(0,1fr)_3rem] gap-x-3 py-2 md:@min-[23rem]:grid-cols-[7rem_minmax(0,1fr)_3rem] md:@min-[23rem]:items-center">
              <div className="min-w-0"><label htmlFor={`story-weight-${key}`} className="text-sm font-semibold">{reviewPriorityLabels[key]}</label><p className={`mt-0.5 text-xs leading-snug text-ink-muted ${key === "environment" ? "" : "hidden md:block"}`}>{reviewPriorityHints[key]}</p></div>
              <input id={`story-weight-${key}`} name={`story-weight-${key}`} type="range" min={0} max={100} step={1} value={reviewWeights[key]}
                aria-valuetext={`${reviewWeights[key]} persen`} aria-describedby="story-weight-help" className="story-priority-range range range-primary range-xs col-span-2 min-h-11 w-full md:@min-[23rem]:col-span-1 md:@min-[23rem]:col-start-2 md:@min-[23rem]:row-start-1"
                style={{ "--range-value": `${reviewWeights[key]}%` } as CSSProperties}
                onChange={(event) => changePriority(key, Number(event.target.value))} />
              <output htmlFor={`story-weight-${key}`} className="col-start-2 row-start-1 text-right font-sans text-lg font-bold tabular-nums md:@min-[23rem]:col-start-3">{reviewWeights[key]}%</output>
            </div>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-rule text-xs">
            <span className="flex items-center gap-1.5"><Check aria-hidden="true" className="size-3.5 text-primary" />{Object.values(reviewWeights).some(Boolean) ? "Total 100%" : "Belum diatur"}</span>
            <button type="button" disabled={!prioritySuggestion} onClick={() => {
              if (!prioritySuggestion) return;
              setProposal({ ...proposal, priority_weights: prioritySuggestion.weights,
                inferred_fields: [...proposal.inferred_fields.filter((field) => field !== "priorities"), ...(prioritySuggestion.inferred ? ["priorities"] : [])] });
              setSaveError(null);
            }} className="btn btn-ghost min-h-11 px-0 text-xs text-primary underline">Atur ulang dari ceritaku</button>
          </div>
          <p id="story-weight-help" className="sr-only">Bobot lain menyesuaikan otomatis agar total tetap 100%.</p>
        </section>}
        <details ref={reviewSummaryRef} className="mt-2 border-t border-rule text-xs" data-hci-region="story-review-details">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">Tinjau detail profil</summary>
          <div className="grid gap-3">
            {profileRows.filter((row) => !row.priorityWeights).map((row) => <ReviewSummary key={row.key} title={row.label} inferred={row.inferred && !row.missing}
              editing={editingField === row.field} onEdit={editableProfileFields.has(row.field) ? () => { setEditError(null); setEditingField(row.field); } : undefined}>
              {editingField === row.field && proposal ? <ProfileFieldEditor key={row.field} field={row.field} label={row.label}
                value={proposal.hard_constraints[row.field] ?? proposal.soft_preferences[row.field]} onSave={(value) => saveFieldEdit(row.field, value)} onCancel={() => setEditingField(null)} /> : row.value}
            </ReviewSummary>)}
          </div>
          {editError && <p role="alert" className="mt-2 text-sm font-semibold text-error">{editError}</p>}
        </details>
        {preview?.available && onSelectDistrict && <details className="mt-2 border-t border-rule text-xs md:hidden" data-hci-region="onboarding-accessible-results">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-primary">Lihat daftar kecamatan dan batasnya</summary>
          <ul className="space-y-1" aria-label="Kecamatan dalam pratinjau">
            {visiblePreviewDistricts(preview, true).map((item) => <DistrictListItem key={item.district.zone_id} item={item} step={4}
              selected={selectedDistrictId === item.district.zone_id} onSelect={() => onSelectDistrict(item.district.zone_id)} />)}
          </ul>
        </details>}
        {(costRange || costLoading) && <section aria-labelledby="story-cost-title" data-hci-region="story-cost-estimate" className="mt-3 border-t border-rule pt-3">
          <h2 id="story-cost-title" className="text-xs text-ink-muted">Perkiraan biaya bulanan{costCityName ? ` · ${costCityName}` : ""}</h2>
          <p className="mt-0.5 font-sans text-lg font-bold tabular-nums">{!costRange ? "Menghitung…" : costRange.high === null ? `mulai Rp${formatRupiah(costRange.low)} / bulan`
            : costRange.low === costRange.high ? `sekitar Rp${formatRupiah(costRange.low)} / bulan` : `Rp${formatRupiah(costRange.low)} – Rp${formatRupiah(costRange.high)} / bulan`}</p>
          {costRange && <p className="mt-1 text-xs text-ink-muted">{costRange.high === null ? "Belum ada kecamatan yang masuk anggaranmu" : "Sewa + biaya hidup"}{costRange.is_sample && <span className="badge badge-neutral badge-xs ml-2">Data contoh</span>}</p>}
        </section>}
        {saveError && <div role="alert" className="alert alert-error mt-3 text-sm">{saveError}</div>}
        {saveError?.startsWith("Masuk") && <Link href="/login?next=%2Fmap" className="btn btn-outline mt-2 min-h-11 border-ink text-ink">Masuk untuk menyimpan</Link>}
      </StoryReviewPanel>}
    </>
  );
}

function StepHeader({ step, onSkip, className = "", disabled = false, compact = false }: { step: 1 | 2 | 3; onSkip: () => void; className?: string; disabled?: boolean; compact?: boolean }) {
  return (
    <header className={`flex shrink-0 flex-wrap items-center justify-between gap-3 text-xs font-semibold text-ink ${className}`}>
      <div className="flex items-center gap-3">
        <span>{compact ? <><span className="hidden md:inline">Langkah </span>{step} dari 3</> : `Langkah ${step} dari 3`}</span>
        <span className="flex w-20 gap-1" aria-hidden="true">
          {[1, 2, 3].map((bar) => <span key={bar} className={`h-0.75 flex-1 rounded-full ${bar <= step ? "bg-primary" : "bg-base-300"}`} />)}
        </span>
      </div>
      <button type="button" disabled={disabled} onClick={onSkip} className="btn btn-ghost btn-xs min-h-11 shrink-0 gap-1 px-1 text-ink">
        {compact ? "Lewati" : "Lewati untuk sekarang"} <X aria-hidden="true" className="size-3.5" />
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

function RequestError({ error }: { error: string | null }) {
  if (!error) return null;
  return <>
    <p role="alert" className="mt-3 text-sm font-semibold text-error">{error}</p>
    {error.startsWith("Masuk") && <Link href="/login?next=%2Fmap" className="btn btn-outline mt-2 min-h-11 border-ink text-ink">Masuk untuk melanjutkan</Link>}
  </>;
}


function ReviewSummary({
  title,
  children,
  inferred = false,
  editing = false,
  onEdit,
}: {
  title: string;
  children: React.ReactNode;
  inferred?: boolean;
  editing?: boolean;
  onEdit?: () => void;
}) {
  return (
    <section className={`border-t-2 pt-1.5 ${inferred ? "-mx-2 rounded-b-lg border-primary bg-primary-tint px-2 pb-1.5" : "border-ink"}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {inferred && <span className="text-xs text-ink-muted">· disimpulkan</span>}
        </div>
        {onEdit && !editing && <button type="button" onClick={onEdit} aria-label={`Ubah ${title}`} className="btn btn-ghost btn-xs min-h-9 px-1 text-primary underline">Ubah</button>}
      </div>
      <div className="text-xs leading-relaxed text-ink">{children}</div>
    </section>
  );
}
