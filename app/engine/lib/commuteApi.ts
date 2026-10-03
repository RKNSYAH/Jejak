import type { CommuteRequest, CommuteResponse } from "../routing/types";

export async function getCommute(request: CommuteRequest, signal: AbortSignal): Promise<CommuteResponse> {
    const response = await fetch("/api/onboarding/commute", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request), cache: "no-store", signal });
    if (!response.ok) throw new Error(response.status === 429 ? "Estimasi sedang sibuk. Coba lagi." : "Estimasi rute belum dapat dimuat.");
    return await response.json() as CommuteResponse;
}
