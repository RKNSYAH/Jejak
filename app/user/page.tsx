import { redirect } from "next/navigation";
import { getAccountSummary, getAuthenticatedClaims } from "../engine/controller/userServerController";
import { getSavedRelocationProfile } from "../engine/controller/relocationProfileController";
import type { StoredRelocationProfile } from "../engine/lib/relocationProfile";
import RelocationProfileEditor from "./RelocationProfileEditor";

export default async function UserPage() {
    const claims = await getAuthenticatedClaims().catch(() => null);
    if (!claims || typeof claims.sub !== "string") redirect("/login?next=%2Fuser");

    const account = await getAccountSummary().catch(() => null);

    let savedProfile: StoredRelocationProfile | null = null;
    let loadError: string | null = null;
    try {
        savedProfile = await getSavedRelocationProfile(claims.sub);
    } catch {
        loadError = "Profil tersimpan tidak berubah. Coba muat ulang halaman.";
    }

    return (
        <RelocationProfileEditor key={claims.sub} userId={claims.sub} email={typeof claims.email === "string" ? claims.email : null}
            account={account} savedProfile={savedProfile} loadError={loadError} />
    );
}
