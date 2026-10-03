import { interpretOnboardingStory, refineRelocationProfile } from "@/app/engine/controller/preferenceController";
import { getAuthenticatedClaims } from "@/app/engine/controller/userServerController";
import { getSavedRelocationProfile } from "@/app/engine/controller/relocationProfileController";
import { readJsonBody } from "@/app/engine/lib/http";
import { flowErrorResponse, isLangflowConfigured, type FlowErrorMessages } from "@/app/engine/lib/langflow";
import { SENSITIVE_TEXT } from "@/app/engine/lib/lf05Validation";
import { isRecord } from "@/app/engine/lib/zoneGeometry";
import { buildLF05FollowUpMessage, resolveLF05FollowUpDetails, validateClarificationAnswers, validateFollowUpDetails } from "@/app/engine/lib/lf05FollowUp";
import { isRelocationGoal } from "@/app/engine/lib/relocationGoal";
import { validateRelocationDraft } from "@/app/engine/lib/profileRefinement";

const MAX_MESSAGE_LENGTH = 4000;

export async function POST(request: Request) {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;

    if (isRecord(body) && body.mode === "refinement") return handleRefinement(body);

    if (
        !isRecord(body) || Object.keys(body).some((key) => !["message", "language", "clarification_answers", "goal", "details"].includes(key)) ||
        typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > MAX_MESSAGE_LENGTH ||
        body.language !== "id" || (body.goal !== undefined && !isRelocationGoal(body.goal))
    ) {
        return Response.json({ error: "Cerita tidak valid." }, { status: 400 });
    }

    if (SENSITIVE_TEXT.test(body.message)) {
        return Response.json({ error: "Hapus data pribadi sensitif sebelum melanjutkan." }, { status: 400 });
    }

    let answers;
    let details;
    try {
        answers = validateClarificationAnswers(body.clarification_answers);
        details = resolveLF05FollowUpDetails(answers, validateFollowUpDetails(body.details));
        buildLF05FollowUpMessage(body.message, answers, isRelocationGoal(body.goal) ? body.goal : undefined, details);
    } catch (error) {
        return Response.json({ error: error instanceof Error && error.message === "SENSITIVE_ONBOARDING_INPUT"
            ? "Hapus data pribadi sensitif sebelum melanjutkan." : "Jawaban pertanyaan lanjutan tidak valid." }, { status: 400 });
    }

    // LF-05 spends model credits, so only signed-in users can run it.
    const claims = await getAuthenticatedClaims().catch(() => null);
    if (!claims) {
        return Response.json({ error: "Masuk terlebih dahulu untuk menganalisis rencana." }, { status: 401 });
    }

    if (!isLangflowConfigured()) {
        const [error, status] = flowErrors.config;
        return Response.json({ error }, { status });
    }

    try {
        return Response.json({ profile: await interpretOnboardingStory(body.message, body.language, answers, isRelocationGoal(body.goal) ? body.goal : undefined, details) });
    } catch (error) {
        return flowErrorResponse(flowErrors, error);
    }
}

async function handleRefinement(body: Record<string, unknown>): Promise<Response> {
    if (Object.keys(body).some((key) => !["mode", "draft", "base_revision", "message", "language", "clarification_answers"].includes(key)) ||
        !Number.isInteger(body.base_revision) || Number(body.base_revision) < 1 || body.language !== "id" ||
        (body.message !== undefined && (typeof body.message !== "string" || body.message.length > 4000 || SENSITIVE_TEXT.test(body.message))) ||
        (body.clarification_answers !== undefined && !Array.isArray(body.clarification_answers))) {
        return Response.json({ error: "Permintaan penyuntingan profil tidak valid." }, { status: 400 });
    }

    let draft;
    let answers;
    try {
        draft = validateRelocationDraft(body.draft);
        answers = validateClarificationAnswers(body.clarification_answers);
        if (SENSITIVE_TEXT.test(JSON.stringify(answers))) throw new Error("SENSITIVE_ONBOARDING_INPUT");
    } catch (error) {
        const sensitive = error instanceof Error && error.message === "SENSITIVE_ONBOARDING_INPUT";
        return Response.json({ error: sensitive ? "Hapus data pribadi sensitif sebelum melanjutkan." : "Draf profil tidak valid." }, { status: 400 });
    }

    const claims = await getAuthenticatedClaims().catch(() => null);
    if (!claims) return Response.json({ error: "Masuk terlebih dahulu untuk menyunting profil." }, { status: 401 });

    if (typeof claims.sub !== "string") return Response.json({ error: "Masuk terlebih dahulu untuk menyunting profil." }, { status: 401 });

    let saved;
    try {
        saved = await getSavedRelocationProfile(claims.sub);
    } catch (error) {
        console.error("Unable to load relocation profile for refinement", error);
        return Response.json({ error: "Profil tersimpan belum dapat dimuat." }, { status: 503 });
    }
    if (!saved || saved.revision !== body.base_revision) {
        return Response.json({ error: "Profil berubah sejak terakhir dimuat. Muat ulang sebelum menyunting.",
            ...(saved ? { profile: saved } : {}) }, { status: 409 });
    }
    if (!isLangflowConfigured()) {
        const [error, status] = refinementErrors.config;
        return Response.json({ error }, { status });
    }

    try {
        return Response.json({ profile: await refineRelocationProfile(draft, saved.profile, body.message as string | undefined, answers, "id") });
    } catch (error) {
        if (error instanceof Error && (error.message === "INVALID_PROFILE_REFINEMENT" || error.message === "SENSITIVE_ONBOARDING_INPUT")) {
            const sensitive = error.message === "SENSITIVE_ONBOARDING_INPUT";
            return Response.json({ error: sensitive ? "Hapus data pribadi sensitif sebelum melanjutkan." : "Permintaan penyuntingan profil terlalu panjang atau tidak valid." }, { status: 400 });
        }
        return flowErrorResponse(refinementErrors, error);
    }
}

const flowErrors: FlowErrorMessages = {
    config: ["Fitur analisis cerita belum siap. Coba lagi nanti.", 503],
    timeout: ["Analisis rencana memerlukan waktu terlalu lama. Coba lagi.", 504],
    unreachable: ["Rencana belum bisa dianalisis. Coba lagi.", 502],
    upstream: ["Rencana belum bisa dianalisis. Coba lagi.", 502],
    invalid_response: ["Ringkasan rencana tidak bisa dibaca. Coba lagi.", 502],
    incomplete: ["Analisis rencana belum selesai. Coba lagi.", 502],
    invalid_output: ["Ringkasan rencana tidak dapat digunakan. Coba lagi.", 502],
};

const refinementErrors: FlowErrorMessages = {
    ...flowErrors,
    config: ["Pemeriksaan preferensi belum siap. Coba lagi nanti.", 503],
    timeout: ["Pemeriksaan preferensi terlalu lama. Drafmu tetap aman. Coba lagi.", 504],
    unreachable: ["Preferensi belum dapat diperiksa. Drafmu tetap aman. Coba lagi.", 502],
    upstream: ["Preferensi belum dapat diperiksa. Drafmu tetap aman. Coba lagi.", 502],
};
