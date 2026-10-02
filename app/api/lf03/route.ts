import { reviewEvidenceConflict } from "@/app/engine/controller/conflictReviewController";
import { getAuthenticatedClaims } from "@/app/engine/controller/userServerController";
import { readJsonBody } from "@/app/engine/lib/http";
import { flowErrorResponse, isLangflowConfigured, type FlowErrorMessages } from "@/app/engine/lib/langflow";
import { validateLF03Input } from "@/app/engine/lib/lf03Validation";

export async function POST(request: Request) {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;

    let group;
    try {
        group = validateLF03Input(body);
    } catch (error) {
        if (error instanceof Error && error.message === "LF03_NO_CONFLICT") {
            return Response.json({ error: "Klaim tidak saling bertentangan.", code: "NO_CONFLICT" }, { status: 422 });
        }
        return Response.json({ error: "Kelompok konflik tidak valid." }, { status: 400 });
    }

    // LF-03 can fall back to Gemini, so only signed-in users can run it.
    const claims = await getAuthenticatedClaims().catch(() => null);
    if (!claims) return Response.json({ error: "Masuk terlebih dahulu untuk meninjau konflik bukti.", code: "SIGN_IN_REQUIRED" }, { status: 401 });

    if (!isLangflowConfigured()) {
        const [error, status] = flowErrors.config;
        return Response.json({ error }, { status });
    }

    try {
        return Response.json({ recommendation: await reviewEvidenceConflict(group) });
    } catch (error) {
        return flowErrorResponse(flowErrors, error);
    }
}

const flowErrors: FlowErrorMessages = {
    config: ["Tinjauan konflik bukti belum siap. Coba lagi nanti.", 503],
    timeout: ["Tinjauan konflik bukti terlalu lama. Coba lagi.", 504],
    unreachable: ["Tinjauan konflik bukti belum bisa dijalankan. Coba lagi.", 502],
    upstream: ["Tinjauan konflik bukti belum bisa dijalankan. Coba lagi.", 502],
    invalid_response: ["Hasil tinjauan konflik tidak bisa dibaca. Coba lagi.", 502],
    incomplete: ["Tinjauan konflik bukti belum selesai. Coba lagi.", 502],
    invalid_output: ["Hasil tinjauan konflik tidak dapat digunakan. Coba lagi.", 502],
};
