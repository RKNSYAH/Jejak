import { handleAuthFailure } from "./authRedirect";
import { isStoredRelocationProfile } from "./relocationProfileCache";
import type { StoredRelocationProfile } from "./relocationProfile";
import { isRecord } from "./zoneGeometry";
import { accountFetch, ACCOUNT_CHANGED_MESSAGE, type AccountScope } from "./accountIdentity";

export async function saveRelocationProfile(body: unknown, account: AccountScope): Promise<StoredRelocationProfile> {
    const { response, result } = await accountFetch(account, "/api/user/relocation-profile", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000),
    }).catch((error: unknown) => {
        if (error instanceof Error && error.message === ACCOUNT_CHANGED_MESSAGE) throw error;
        throw new Error("Profil belum tersimpan. Periksa koneksimu dan coba lagi.");
    });
    if (handleAuthFailure(response)) throw new Error("Masuk kembali untuk menyimpan profil.");
    if (response.ok && isRecord(result) && result.user_id !== account.userId) {
        account.invalidate();
        throw new Error(ACCOUNT_CHANGED_MESSAGE);
    }
    if (!response.ok || !isRecord(result) || !isStoredRelocationProfile(result.profile)) {
        throw new Error(isRecord(result) && typeof result.error === "string" ? result.error : "Profil belum tersimpan. Coba lagi.");
    }
    return result.profile;
}
