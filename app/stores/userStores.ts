import { create } from "zustand";
import { UserProfile, TargetSector } from "../engine/types";

type UserProfileStore = {
    profile: UserProfile | null;
    setProfile: (profile: UserProfile) => void;
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

    setProfile: (profile) => set({ profile }),

    setTargetSectors: (sectors) =>
        set((state) => ({
            profile: {
                ...(state.profile ?? initialProfile),
                target_sectors: sectors,
            },
        })),

    resetProfile: () => set({ profile: null }),
}));