import { create } from "zustand";
import type { StoredRelocationProfile } from "../engine/lib/relocationProfile";
import { clearRelocationProfileCache, writeRelocationProfileCache } from "../engine/lib/relocationProfileCache";

type UserProfileStore = {
    relocationProfile: StoredRelocationProfile | null;
    relocationProfileUserId: string | null;
    setRelocationProfile: (userId: string, profile: StoredRelocationProfile | null) => void;
    resetProfile: (userId?: string) => void;
};

export const useUserProfileStore = create<UserProfileStore>((set, get) => ({
    relocationProfile: null,
    relocationProfileUserId: null,

    setRelocationProfile: (userId, relocationProfile) => {
        writeRelocationProfileCache(userId, relocationProfile);
        set({ relocationProfile, relocationProfileUserId: userId });
    },

    resetProfile: (signedOutUserId) => {
        const userId = signedOutUserId ?? get().relocationProfileUserId;
        if (userId) clearRelocationProfileCache(userId);
        set({ relocationProfile: null, relocationProfileUserId: null });
    },
}));
