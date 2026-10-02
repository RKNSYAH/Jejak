import JejakMap from '../components/map/JejakMap';
import { redirect } from "next/navigation";
import { getAccountSummary, getAuthenticatedUserId } from "../engine/controller/userServerController";
import { loginPath } from "../engine/lib/authDestination";

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

  return (
    <main className="min-h-0 flex-1 overflow-hidden">
      <JejakMap key={userId} userId={userId} account={account} />
    </main>
  );
}
