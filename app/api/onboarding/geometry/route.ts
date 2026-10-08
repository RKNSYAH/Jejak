import { getOnboardingCityBoundaries } from "@/app/engine/controller/onboardingController";
import { mapAccessDenied } from "@/app/engine/lib/mapAuth";
import { getCityZoneBoundaries } from "@/app/engine/lib/zoneBoundary";
import { isRegionCode } from "@/app/engine/lib/zoneGeometry";

export async function GET(request: Request) {
    const denied = await mapAccessDenied();
    if (denied) return denied;
    const cityId = new URL(request.url).searchParams.get("city_id");
    if (!cityId || !isRegionCode(cityId)) {
        return Response.json({ error: "Unsupported city_id" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    let stage = "load-boundary-rows";
    try {
        const rows = await getOnboardingCityBoundaries(cityId);
        stage = "resolve-boundaries";
        const result = await getCityZoneBoundaries(rows);
        console.info("Onboarding geometry request completed", {
            requestId, cityId, districts: rows.length, returned: result.geometry.features.length,
            missing: result.missingZones.length, elapsedMs: Date.now() - startedAt,
        });
        return Response.json(result, { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } });
    } catch (error) {
        console.error("Onboarding geometry request failed", {
            requestId, cityId, stage, elapsedMs: Date.now() - startedAt, error,
        });
        return Response.json({ error: "Batas kecamatan belum dapat dimuat." }, {
            status: 502, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
        });
    }
}
