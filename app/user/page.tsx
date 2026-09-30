import Link from "next/link";
import { redirect } from "next/navigation";
import UserHeader from "../components/UserHeader";
import { getAuthenticatedClaims } from "../engine/controller/userServerController";
import SignOutButton from "./SignOutButton";

export default async function UserPage() {
    const claims = await getAuthenticatedClaims().catch(() => null);
    if (!claims || typeof claims.sub !== "string") redirect("/login?next=%2Fuser");

    return (
        <main className="min-h-dvh w-full min-w-0 bg-base-100 font-body text-ink" data-hci-region="account-page">
            <UserHeader />
            <section className="card card-border mx-auto mt-8 w-[calc(100%-2rem)] max-w-xl border-rule bg-base-100 sm:mt-12" aria-labelledby="account-title">
                <div className="card-body gap-4">
                    <h1 id="account-title" className="card-title font-sans text-2xl">Akun Jejak</h1>
                    <p className="wrap-break-word text-sm text-ink-muted">{typeof claims.email === "string" ? claims.email : "Akun aktif"}</p>
                    <div className="card-actions mt-2 flex flex-wrap gap-3">
                        <Link href="/map" className="btn btn-primary min-h-11">Kembali ke peta</Link>
                        <SignOutButton userId={claims.sub} />
                    </div>
                </div>
            </section>
        </main>
    );
}
