import { create } from "zustand";
import { UserProfile, TargetSector } from "../engine/types";
import type { StoredRelocationProfile } from "../engine/lib/relocationProfile";

type UserProfileStore = {
    profile: UserProfile | null;
    relocationProfile: StoredRelocationProfile | null;
    setProfile: (profile: UserProfile) => void;
    setRelocationProfile: (profile: StoredRelocationProfile | null) => void;
    setTargetSectors: (sectors: TargetSector[]) => void;
    resetProfile: () => void;
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

export const useUserProfileStore = create<UserProfileStore>((set) => ({
    profile: null,
    relocationProfile: null,

    setProfile: (profile) => set({ profile }),
    setRelocationProfile: (relocationProfile) => set({ relocationProfile }),

    setTargetSectors: (sectors) =>
        set((state) => ({
            profile: {
                ...(state.profile ?? initialProfile),
                target_sectors: sectors,
            },
        })),

    resetProfile: () => set({ profile: null }),
}));
