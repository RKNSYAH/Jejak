import { reviewEvidenceConflict } from "@/app/engine/controller/conflictReviewController";
import { getAuthenticatedClaims } from "@/app/engine/controller/userServerController";
import { isLangflowConfigured, LangflowError, type LangflowErrorCode } from "@/app/engine/lib/langflow";
import { validateLF03Input } from "@/app/engine/lib/lf03Validation";

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

    let group;
    try {
        group = validateLF03Input(body);
    } catch (error) {
        if (error instanceof Error && error.message === "LF03_NO_CONFLICT") {
            return Response.json({ error: "Claims do not conflict", code: "NO_CONFLICT" }, { status: 422 });
        }
        return Response.json({ error: "Invalid conflict group" }, { status: 400 });
    }

    // LF-03 can fall back to Gemini, so only signed-in users can run it.
    const claims = await getAuthenticatedClaims().catch(() => null);
    if (!claims) return Response.json({ error: "Sign in to review evidence conflicts", code: "SIGN_IN_REQUIRED" }, { status: 401 });

    if (!isLangflowConfigured()) {
        return Response.json({ error: "Conflict review is not available yet" }, { status: 503 });
    }

    try {
        return Response.json({ recommendation: await reviewEvidenceConflict(group) });
    } catch (error) {
        if (!(error instanceof LangflowError)) {
            return Response.json({ error: "Conflict review returned an unusable recommendation" }, { status: 502 });
        }
        const [message, status] = flowErrors[error.code];
        return Response.json({ error: message }, { status });
    }
}

const flowErrors: Record<LangflowErrorCode, [string, number]> = {
    config: ["Conflict review is not available yet", 503],
    timeout: ["Conflict review took too long", 504],
    unreachable: ["Could not reach conflict review", 502],
    upstream: ["Conflict review failed", 502],
    invalid_response: ["Conflict review returned an unreadable response", 502],
    incomplete: ["Conflict review did not finish", 502],
    invalid_output: ["Conflict review returned an unusable recommendation", 502],
};
