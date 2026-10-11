import type { RelocationGoal } from "../lib/relocationGoal";
import { priorityKeys, redistributeWeights } from "./preview";
import type { Priority, Weights } from "./types";

const groups: Record<Priority, string[]> = {
    opportunity: ["career", "education"],
    affordability: ["housing", "cost_of_living"],
    mobility: ["commute"],
    environment: ["environment"],
};

// Four controls, six stored dimensions. Keep profile interpretation's split within each group.
export function storyPriorityWeights(weights: Record<string, number>): Weights {
    const raw = Object.fromEntries(priorityKeys.map((key) => [key,
        groups[key].reduce((sum, dimension) => sum + (weights[dimension] ?? 0), 0),
    ])) as Weights;
    const total = priorityKeys.reduce((sum, key) => sum + raw[key], 0);
    if (!total) return raw;
    const percentages = Object.fromEntries(priorityKeys.map((key) => [key, raw[key] / total * 100])) as Weights;
    return redistributeWeights(percentages, "opportunity", percentages.opportunity);
}

export function updateStoryPriority(weights: Record<string, number>, goal: RelocationGoal, key: Priority, value: number): Record<string, number> {
    const next = redistributeWeights(storyPriorityWeights(weights), key, value);
    const result = { ...weights };
    for (const group of priorityKeys) {
        const dimensions = groups[group];
        const total = dimensions.reduce((sum, dimension) => sum + (weights[dimension] ?? 0), 0);
        const fallback = group === "opportunity" && goal !== "both" ? [goal === "study" ? "education" : "career"] : dimensions;
        for (const dimension of dimensions) {
            const share = total ? (weights[dimension] ?? 0) / total : fallback.includes(dimension) ? 1 / fallback.length : 0;
            result[dimension] = next[group] / 100 * share;
        }
    }
    return result;
}
