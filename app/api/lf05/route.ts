import { interpretOnboardingStory } from "@/app/engine/controller/preferenceController";
import { getAuthenticatedClaims } from "@/app/engine/controller/userServerController";
import { readJsonBody } from "@/app/engine/lib/http";
import { flowErrorResponse, isLangflowConfigured, type FlowErrorMessages } from "@/app/engine/lib/langflow";
import { SENSITIVE_TEXT } from "@/app/engine/lib/lf05Validation";
import { isRecord } from "@/app/engine/lib/zoneGeometry";

const MAX_MESSAGE_LENGTH = 4000;

export async function POST(request: Request) {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;

    if (
        !isRecord(body) || Object.keys(body).some((key) => !["message", "language"].includes(key)) ||
        typeof body.message !== "string" || body.message.trim().length === 0 || body.message.length > MAX_MESSAGE_LENGTH ||
        (body.language !== "id" && body.language !== "en")
    ) {
        return Response.json({ error: "Cerita tidak valid." }, { status: 400 });
    }

    if (SENSITIVE_TEXT.test(body.message)) {
        return Response.json({ error: "Hapus data pribadi sensitif sebelum melanjutkan." }, { status: 400 });
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
        return Response.json({ profile: await interpretOnboardingStory(body.message, body.language) });
    } catch (error) {
        return flowErrorResponse(flowErrors, error);
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
