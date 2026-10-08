import { explainZoneFit } from "@/app/engine/controller/explanationController";
import { getSavedRelocationProfile } from "@/app/engine/controller/relocationProfileController";
import { getAuthenticatedUserId } from "@/app/engine/controller/userServerController";
import { readJsonBody } from "@/app/engine/lib/http";
import { flowErrorResponse, isLangflowConfigured, type FlowErrorMessages } from "@/app/engine/lib/langflow";
import { validateZoneFitExplanationRequest } from "@/app/engine/lib/zoneFitExplanationValidation";

export async function POST(request: Request) {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;

    let explanationRequest;
    try {
        explanationRequest = validateZoneFitExplanationRequest(body);
    } catch {
        return Response.json({ error: "Permintaan penjelasan tidak valid." }, { status: 400 });
    }

    // Zone fit explanation spends model credits, so only signed-in users can run it.
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk terlebih dahulu untuk melihat penjelasan." }, { status: 401 });

    if (!isLangflowConfigured()) {
        const [error, status] = flowErrors.config;
        return Response.json({ error }, { status });
    }

    let saved;
    try {
        saved = await getSavedRelocationProfile(userId);
    } catch (error) {
        console.error("Unable to load relocation profile for zone fit explanation", error);
        return Response.json({ error: "Profil tersimpan belum dapat dimuat." }, { status: 503 });
    }
    if (!saved) {
        return Response.json({ error: "Konfirmasi profil relokasimu terlebih dahulu.", code: "PROFILE_REQUIRED" }, { status: 409 });
    }

    try {
        return Response.json({ explanation: await explainZoneFit(saved.profile, explanationRequest) });
    } catch (error) {
        return flowErrorResponse(flowErrors, error);
    }
}

const flowErrors: FlowErrorMessages = {
    config: ["Penjelasan kecamatan belum siap. Coba lagi nanti.", 503],
    timeout: ["Penjelasan kecamatan memerlukan waktu terlalu lama. Coba lagi.", 504],
    unreachable: ["Penjelasan kecamatan belum bisa dibuat. Coba lagi.", 502],
    upstream: ["Penjelasan kecamatan belum bisa dibuat. Coba lagi.", 502],
    invalid_response: ["Penjelasan kecamatan tidak bisa dibaca. Coba lagi.", 502],
    incomplete: ["Penjelasan kecamatan belum selesai. Coba lagi.", 502],
    invalid_output: ["Penjelasan kecamatan tidak dapat digunakan. Coba lagi.", 502],
};
