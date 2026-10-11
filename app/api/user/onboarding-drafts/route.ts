import { deleteOnboardingDraft, getOnboardingDraft, saveOnboardingDraft } from "@/app/engine/controller/onboardingDraftController";
import { getAuthenticatedUserId } from "@/app/engine/controller/userServerController";
import { accountChangedResponse } from "@/app/engine/lib/accountIdentity";
import { readJsonBody } from "@/app/engine/lib/http";
import { isRecord } from "@/app/engine/lib/zoneGeometry";
import { parseFormSession } from "@/app/engine/onboarding/preview";
import type { OnboardingDraftKind } from "@/app/engine/onboarding/types";

function draftKind(request: Request): OnboardingDraftKind | null {
    const kind = new URL(request.url).searchParams.get("kind");
    return kind === "form" || kind === "story" ? kind : null;
}

function isValidDraft(kind: OnboardingDraftKind, draft: unknown): boolean {
    if (!isRecord(draft) || new TextEncoder().encode(JSON.stringify(draft)).length > 60_000) return false;
    if (kind === "form") return parseFormSession(draft) !== null;
    return Number.isInteger(draft.step) && [1, 2, 3].includes(Number(draft.step)) &&
        typeof draft.story === "string" && draft.story.length <= 1000 &&
        (draft.office === "Belum tahu" || draft.office === "Dipilih di peta");
}

export async function GET(request: Request) {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk untuk memuat draf." }, { status: 401 });
    const changed = accountChangedResponse(request, userId);
    if (changed) return changed;
    const kind = draftKind(request);
    if (!kind) return Response.json({ error: "Jenis draf tidak valid." }, { status: 400 });

    try {
        return Response.json({ user_id: userId, saved: await getOnboardingDraft(userId, kind) }, {
            headers: { "Cache-Control": "private, no-store" },
        });
    } catch (error) {
        console.error("Unable to load onboarding draft", error);
        return Response.json({ error: "Draf belum dapat dimuat." }, { status: 503 });
    }
}

export async function PUT(request: Request) {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    if (!isRecord(body)) return Response.json({ error: "Draf tidak valid." }, { status: 400 });
    const kind = body.kind === "form" || body.kind === "story" ? body.kind : null;
    if (!kind || Object.keys(body).some((key) => !["kind", "draft"].includes(key)) || !isValidDraft(kind, body.draft)) {
        return Response.json({ error: "Draf tidak valid." }, { status: 400 });
    }
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk untuk menyimpan draf." }, { status: 401 });
    const changed = accountChangedResponse(request, userId);
    if (changed) return changed;

    try {
        await saveOnboardingDraft(userId, kind, body.draft);
        return Response.json({ user_id: userId, saved: true }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Unable to save onboarding draft", error);
        return Response.json({ error: "Draf belum tersimpan." }, { status: 503 });
    }
}

export async function DELETE(request: Request) {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk untuk menghapus draf." }, { status: 401 });
    const changed = accountChangedResponse(request, userId);
    if (changed) return changed;
    const kind = draftKind(request);
    if (!kind) return Response.json({ error: "Jenis draf tidak valid." }, { status: 400 });

    try {
        await deleteOnboardingDraft(userId, kind);
        return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Unable to delete onboarding draft", error);
        return Response.json({ error: "Draf belum terhapus." }, { status: 503 });
    }
}
