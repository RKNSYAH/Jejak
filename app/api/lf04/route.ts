import { explainZoneFit } from "@/app/engine/controller/explanationController";
import { getSavedRelocationProfile } from "@/app/engine/controller/relocationProfileController";
import { getAuthenticatedUserId } from "@/app/engine/controller/userServerController";
import { isLangflowConfigured, LangflowError, type LangflowErrorCode } from "@/app/engine/lib/langflow";
import { validateLF04Request } from "@/app/engine/lib/lf04Validation";

export async function POST(request: Request) {
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
        return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: "Invalid JSON request" }, { status: 400 });
    }

    let explanationRequest;
    try {
        explanationRequest = validateLF04Request(body);
    } catch {
        return Response.json({ error: "Invalid explanation request" }, { status: 400 });
    }

    // LF-04 spends model credits, so only signed-in users can run it.
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk terlebih dahulu untuk melihat penjelasan." }, { status: 401 });

    if (!isLangflowConfigured()) {
        return Response.json({ error: "Penjelasan zona belum siap. Coba lagi nanti." }, { status: 503 });
    }

    let saved;
    try {
        saved = await getSavedRelocationProfile(userId);
    } catch (error) {
        console.error("Unable to load relocation profile for LF-04", error);
        return Response.json({ error: "Profil tersimpan belum dapat dimuat." }, { status: 503 });
    }
    if (!saved) {
        return Response.json({ error: "Konfirmasi profil relokasimu terlebih dahulu.", code: "PROFILE_REQUIRED" }, { status: 409 });
    }

    try {
        return Response.json({ explanation: await explainZoneFit(saved.profile, explanationRequest) });
    } catch (error) {
        if (!(error instanceof LangflowError)) {
            return Response.json({ error: "Penjelasan zona tidak dapat digunakan. Coba lagi." }, { status: 502 });
        }
        const [message, status] = flowErrors[error.code];
        return Response.json({ error: message }, { status });
    }
}

const flowErrors: Record<LangflowErrorCode, [string, number]> = {
    config: ["Penjelasan zona belum siap. Coba lagi nanti.", 503],
    timeout: ["Penjelasan zona memerlukan waktu terlalu lama. Coba lagi.", 504],
    unreachable: ["Penjelasan zona belum bisa dibuat. Coba lagi.", 502],
    upstream: ["Penjelasan zona belum bisa dibuat. Coba lagi.", 502],
    invalid_response: ["Penjelasan zona tidak bisa dibaca. Coba lagi.", 502],
    incomplete: ["Penjelasan zona belum selesai. Coba lagi.", 502],
    invalid_output: ["Penjelasan zona tidak dapat digunakan. Coba lagi.", 502],
};
