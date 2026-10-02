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
    try {
        const rows = await getOnboardingCityBoundaries(cityId);
        const result = await getCityZoneBoundaries(rows);
        return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch {
        return Response.json({ error: "Batas kecamatan belum dapat dimuat." }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
}
