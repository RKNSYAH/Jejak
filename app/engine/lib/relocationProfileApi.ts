import { handleAuthFailure } from "./authRedirect";
import { isStoredRelocationProfile } from "./relocationProfileCache";
import type { StoredRelocationProfile } from "./relocationProfile";
import { isRecord } from "./zoneGeometry";

export async function saveRelocationProfile(body: unknown): Promise<StoredRelocationProfile> {
    let response: Response;
    try {
        response = await fetch("/api/user/relocation-profile", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
            signal: AbortSignal.timeout(30_000),
        });
    } catch {
        throw new Error("Profil belum tersimpan. Periksa koneksimu dan coba lagi.");
    }
    if (handleAuthFailure(response)) throw new Error("Masuk kembali untuk menyimpan profil.");
    const result: unknown = await response.json().catch(() => null);
    if (!response.ok || !isRecord(result) || !isStoredRelocationProfile(result.profile)) {
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Profil belum tersimpan. Coba lagi.");
    }
    return result.profile;
}
