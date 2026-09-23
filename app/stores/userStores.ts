import { create } from "zustand";
import { UserProfile, TargetSector } from "../engine/types";

type UserProfileStore = UserProfile & {
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
    ...initialProfile,
    profile: null,

    setProfile: (profile) => set({ profile }),

    setTargetSectors: (sectors) =>
        set((state) => ({
            profile: state.profile
                ? {
                    ...state.profile,
                    target_sectors: sectors,
                }
                : null,
        })),

    resetProfile: () => set({ profile: null }),
}));