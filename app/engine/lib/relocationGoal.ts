export type RelocationGoal = "work" | "study" | "both";

export const relocationGoalLabels: Record<RelocationGoal, string> = {
    work: "Kerja", study: "Kuliah", both: "Kerja dan kuliah",
};

export function isRelocationGoal(value: unknown): value is RelocationGoal {
    return value === "work" || value === "study" || value === "both";
}

export function getRelocationGoal(profile: { hard_constraints: Record<string, unknown>; soft_preferences: Record<string, unknown> }): RelocationGoal | null {
    if (profile.hard_constraints.goal != null && profile.soft_preferences.goal != null &&
        profile.hard_constraints.goal !== profile.soft_preferences.goal) return null;
    const goal = profile.hard_constraints.goal ?? profile.soft_preferences.goal;
    return isRelocationGoal(goal) ? goal : null;
}
