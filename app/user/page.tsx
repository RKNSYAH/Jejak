import { redirect } from "next/navigation";
import { getAccountSummary, getAuthenticatedIdentity } from "../engine/controller/userServerController";
import { getSavedRelocationProfile } from "../engine/controller/relocationProfileController";
import type { StoredRelocationProfile } from "../engine/lib/relocationProfile";
import RelocationProfileEditor from "./RelocationProfileEditor";

export default async function UserPage() {
    const identity = await getAuthenticatedIdentity().catch(() => null);
    if (!identity) redirect("/login?next=%2Fuser");

    const account = await getAccountSummary().catch(() => null);

    let savedProfile: StoredRelocationProfile | null = null;
    let loadError: string | null = null;
    try {
        savedProfile = await getSavedRelocationProfile(identity.sub);
    } catch {
        loadError = "Profil tersimpan tidak berubah. Coba muat ulang halaman.";
    }

    return (
        <RelocationProfileEditor key={identity.sub} userId={identity.sub} email={typeof identity.email === "string" ? identity.email : null}
            account={account} savedProfile={savedProfile} loadError={loadError} />
    );
}
