"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutUser } from "../engine/controller/userController";
import { clearOnboardingDrafts } from "../engine/onboarding/draftStorage";
import type { AccountScope } from "../engine/lib/accountIdentity";

export default function SignOutButton({ identity }: { identity: AccountScope }) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");

    async function signOut() {
        if (pending) return;
        setPending(true);
        setError("");
        try {
            identity.invalidate(false);
            await logoutUser();
            clearOnboardingDrafts(identity.userId);
            router.replace("/login?status=signed-out");
            router.refresh();
        } catch {
            setError("Tidak dapat keluar sekarang. Coba lagi.");
            setPending(false);
        }
    }

    return (
        <div data-hci-region="account-sign-out">
            <button type="button" onClick={() => void signOut()} disabled={pending} className="btn btn-outline min-h-11 border-ink text-ink">
                {pending ? "Keluar…" : "Keluar dari akun"}
            </button>
            {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
        </div>
    );
}
