import JejakMap from '../components/map/JejakMap';
import { redirect } from "next/navigation";
import { getAccountSummary, getAuthenticatedUserId } from "../engine/controller/userServerController";
import { loginPath } from "../engine/lib/authDestination";
import { getSavedRelocationProfile } from "../engine/controller/relocationProfileController";
import type { StoredRelocationProfile } from "../engine/lib/relocationProfile";

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  const userId = await getAuthenticatedUserId().catch(() => null);
  if (!userId) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (Array.isArray(value)) value.forEach((entry) => query.append(key, entry));
      else if (value !== undefined) query.set(key, value);
    }
    redirect(loginPath(`/map${query.size ? `?${query}` : ""}`));
  }
  const account = await getAccountSummary().catch(() => null);
  const query = await searchParams;
  // Returning from the editor uses the verified server revision, not an old browser draft.
  let confirmedProfile: StoredRelocationProfile | null | undefined;
  let profileLoadFailed = false;
  if (query.profile === "updated" && query.onboarding !== "demo") {
    try { confirmedProfile = await getSavedRelocationProfile(userId); }
    catch (error) {
      console.error("Unable to load updated profile for map", error);
      profileLoadFailed = true;
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-hidden">
      <JejakMap key={`${userId}:${confirmedProfile?.revision ?? "explore"}`} userId={userId} account={account} confirmedProfile={confirmedProfile} profileLoadFailed={profileLoadFailed} />
    </main>
  );
}
