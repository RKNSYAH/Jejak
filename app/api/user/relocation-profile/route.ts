import { getSavedRelocationProfile, saveConfirmedRelocationProfile } from "@/app/engine/controller/relocationProfileController";
import { getAuthenticatedUserId } from "@/app/engine/controller/userServerController";
import { buildPersistedRelocationProfile } from "@/app/engine/lib/relocationProfile";
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
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return Response.json({ error: "Content-Type must be application/json" }, { status: 415 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON request" }, { status: 400 });
  }

  if (
    !isRecord(body) || Object.keys(body).some((key) => !["proposal", "confirmed_fields"].includes(key)) ||
    !isRecord(body.proposal) || !Array.isArray(body.confirmed_fields)
  ) {
    return Response.json({ error: "Invalid relocation profile" }, { status: 400 });
  }

  let profile;
  try {
    profile = buildPersistedRelocationProfile(body.proposal, body.confirmed_fields);
  } catch (error) {
    const code = error instanceof Error ? error.message : "INVALID_LF05_PROFILE";
    const message = code === "PROFILE_CONFIRMATION_REQUIRED"
      ? "Konfirmasi semua kesimpulan sebelum menyimpan profil."
      : "Profil tidak valid. Tinjau kembali jawabanmu.";
    return Response.json({ error: message }, { status: 400 });
  }

  const userId = await getAuthenticatedUserId().catch(() => null);
  if (!userId) return Response.json({ error: "Masuk kembali untuk menyimpan profil." }, { status: 401 });

  try {
    const savedProfile = await saveConfirmedRelocationProfile(userId, profile);
    return Response.json({ profile: savedProfile }, { status: 201 });
  } catch (error) {
    console.error("Unable to save relocation profile", error);
    return Response.json({ error: "Profil belum tersimpan. Coba lagi." }, { status: 503 });
  }
}
