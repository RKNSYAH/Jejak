import { create } from "zustand";
import { UserProfile, TargetSector } from "../engine/types";
import type { StoredRelocationProfile } from "../engine/lib/relocationProfile";
import { clearRelocationProfileCache, writeRelocationProfileCache } from "../engine/lib/relocationProfileCache";

type UserProfileStore = {
    profile: UserProfile | null;
    relocationProfile: StoredRelocationProfile | null;
    relocationProfileUserId: string | null;
    setProfile: (profile: UserProfile) => void;
    setRelocationProfile: (userId: string, profile: StoredRelocationProfile | null) => void;
    setTargetSectors: (sectors: TargetSector[]) => void;
    resetProfile: (userId?: string) => void;
};

const initialProfile: UserProfile = {
    target_sectors: [],
    monthly_budget: 0,
    maximum_rent: 0,
    maximum_commute_minutes: 0,

    priorities: {
        career: 0,
        education: 0,
        affordability: 0,
        mobility: 0,
    },
};

export const useUserProfileStore = create<UserProfileStore>((set, get) => ({
    profile: null,
    relocationProfile: null,
    relocationProfileUserId: null,

    setProfile: (profile) => set({ profile }),
    setRelocationProfile: (userId, relocationProfile) => {
        writeRelocationProfileCache(userId, relocationProfile);
        set({ relocationProfile, relocationProfileUserId: userId });
    },

    setTargetSectors: (sectors) =>
        set((state) => ({
            profile: {
                ...(state.profile ?? initialProfile),
                target_sectors: sectors,
            },
        })),

    resetProfile: (signedOutUserId) => {
        const userId = signedOutUserId ?? get().relocationProfileUserId;
        if (userId) clearRelocationProfileCache(userId);
        set({ profile: null, relocationProfile: null, relocationProfileUserId: null });
    },
}));
