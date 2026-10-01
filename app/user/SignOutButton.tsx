"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { logoutUser } from "../engine/controller/userController";
import { useUserProfileStore } from "../stores/userStores";
import { FORM_DRAFT_KEY, STORY_DRAFT_KEY } from "../engine/onboarding/types";

export default function SignOutButton({ userId }: { userId: string }) {
    const router = useRouter();
    const [pending, setPending] = useState(false);
    const [error, setError] = useState("");
    const resetProfile = useUserProfileStore((state) => state.resetProfile);

    async function signOut() {
        if (pending) return;
        setPending(true);
        setError("");
        try {
            await logoutUser();
            resetProfile(userId);
            sessionStorage.removeItem(STORY_DRAFT_KEY);
            sessionStorage.removeItem(FORM_DRAFT_KEY);
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
