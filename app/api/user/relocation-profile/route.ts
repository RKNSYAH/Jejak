import { getSavedRelocationProfile, saveConfirmedRelocationProfile } from "@/app/engine/controller/relocationProfileController";
import { getAuthenticatedUserId } from "@/app/engine/controller/userServerController";
import { readJsonBody } from "@/app/engine/lib/http";
import { buildFormRelocationProfile, buildPersistedRelocationProfile } from "@/app/engine/lib/relocationProfile";
import { isRecord } from "@/app/engine/lib/zoneGeometry";

export async function GET() {
    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk untuk memuat profil." }, { status: 401 });

    try {
        return Response.json({ profile: await getSavedRelocationProfile(userId) });
    } catch (error) {
        console.error("Unable to load relocation profile", error);
        return Response.json({ error: "Profil tersimpan belum dapat dimuat." }, { status: 503 });
    }
}

export async function POST(request: Request) {
    const body = await readJsonBody(request);
    if (body instanceof Response) return body;
    const isForm = isRecord(body) && Object.hasOwn(body, "form_answers");
    if (!isRecord(body) || (isForm
        ? Object.keys(body).some((key) => key !== "form_answers")
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
    if (!isForm && body.base_revision !== undefined && isRecord(body.proposal) &&
        Array.isArray(body.proposal.clarification_questions) && body.proposal.clarification_questions.length > 0) {
        return Response.json({ error: "Jawab semua pertanyaan lanjutan sebelum menyimpan profil." }, { status: 400 });
    }

    const userId = await getAuthenticatedUserId().catch(() => null);
    if (!userId) return Response.json({ error: "Masuk kembali untuk menyimpan profil." }, { status: 401 });

    try {
        if (!isForm && body.base_revision !== undefined) {
            if (!Number.isInteger(body.base_revision) || Number(body.base_revision) < 1) {
                return Response.json({ error: "Nomor revisi profil tidak valid." }, { status: 400 });
            }
            const latest = await getSavedRelocationProfile(userId);
            if (!latest || latest.revision !== body.base_revision) {
                return Response.json({ error: "Profil berubah sejak terakhir dimuat. Muat ulang sebelum menyimpan.",
                    ...(latest ? { profile: latest } : {}) }, { status: 409 });
            }
        }
        return Response.json({ profile: await saveConfirmedRelocationProfile(userId, profile) }, { status: 201 });
    } catch (error) {
        console.error("Unable to save relocation profile", error);
        return Response.json({ error: "Profil belum tersimpan. Coba lagi." }, { status: 503 });
    }
}
