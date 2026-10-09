import { deleteRelocationProfile, getSavedRelocationProfile, saveConfirmedRelocationProfile } from "@/app/engine/controller/relocationProfileController";
import { getAuthenticatedUserId } from "@/app/engine/controller/userServerController";
import { readJsonBody } from "@/app/engine/lib/http";
import { buildFormRelocationProfile, buildPersistedRelocationProfile } from "@/app/engine/lib/relocationProfile";
import { isRecord } from "@/app/engine/lib/zoneGeometry";
import { accountChangedResponse } from "@/app/engine/lib/accountIdentity";

export async function GET(request: Request) {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk untuk memuat profil." }, { status: 401 });
    const changed = accountChangedResponse(request, userId);
    if (changed) return changed;

    try {
        return Response.json({ user_id: userId, profile: await getSavedRelocationProfile(userId) }, { headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        console.error("Unable to load relocation profile", error);
        return Response.json({ error: "Profil tersimpan belum dapat dimuat." }, { status: 503 });
    }
}

export async function DELETE(request: Request) {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk untuk menghapus profil." }, { status: 401 });
    const changed = accountChangedResponse(request, userId);
    if (changed) return changed;

    try {
        await deleteRelocationProfile(userId);
        return new Response(null, { status: 204 });
    } catch (error) {
        console.error("Unable to delete relocation profile", error);
        return Response.json({ error: "Profil belum terhapus. Coba lagi." }, { status: 503 });
    }
}

export async function POST(request: Request) {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    const isForm = isRecord(body) && Object.hasOwn(body, "form_answers");
    if (!isRecord(body) || !Object.hasOwn(body, "base_revision") ||
        (body.base_revision !== null && (!Number.isInteger(body.base_revision) || Number(body.base_revision) < 1)) ||
        (isForm
            ? Object.keys(body).some((key) => !["form_answers", "base_revision"].includes(key))
            : Object.keys(body).some((key) => !["proposal", "confirmed_fields", "base_revision"].includes(key)) ||
                !isRecord(body.proposal) || !Array.isArray(body.confirmed_fields))) {
        return Response.json({ error: "Profil tidak valid. Tinjau kembali jawabanmu." }, { status: 400 });
    }

    let profile;
    try {
        profile = isForm ? buildFormRelocationProfile(body.form_answers) : buildPersistedRelocationProfile(body.proposal, body.confirmed_fields);
    } catch (error) {
        const message = error instanceof Error && error.message === "PROFILE_GOAL_REQUIRED"
            ? "Tentukan tujuan pindahmu sebelum menyimpan profil."
            : error instanceof Error && error.message === "PROFILE_CONFIRMATION_REQUIRED"
            ? "Konfirmasi semua kesimpulan sebelum menyimpan profil."
            : "Profil tidak valid. Tinjau kembali jawabanmu.";
        return Response.json({ error: message }, { status: 400 });
    }
    if (!isForm && isRecord(body.proposal) &&
        Array.isArray(body.proposal.clarification_questions) && body.proposal.clarification_questions.length > 0) {
        return Response.json({ error: "Jawab semua pertanyaan lanjutan sebelum menyimpan profil." }, { status: 400 });
    }

    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk kembali untuk menyimpan profil." }, { status: 401 });
    const changed = accountChangedResponse(request, userId);
    if (changed) return changed;

    try {
        const saved = await saveConfirmedRelocationProfile(userId, profile, body.base_revision as number | null);
        return Response.json({ user_id: userId, profile: saved }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
    } catch (error) {
        if (isRecord(error) && error.code === "40001") {
            return Response.json({ user_id: userId, error: "Profil berubah sejak terakhir dimuat. Muat ulang sebelum menyimpan." },
                { status: 409, headers: { "Cache-Control": "private, no-store" } });
        }
        console.error("Unable to save relocation profile", error);
        return Response.json({ error: "Profil belum tersimpan. Coba lagi." }, { status: 503 });
    }
}
