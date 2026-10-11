import { getOnboardingCityPreview } from "@/app/engine/controller/onboardingController";
import { mapAccessDenied } from "@/app/engine/lib/mapAuth";
import { isRegionCode } from "@/app/engine/lib/zoneGeometry";

export async function GET(request: Request) {
    const denied = await mapAccessDenied();
    if (denied) return denied;

    const cityId = new URL(request.url).searchParams.get("city_id");
    if (cityId !== null && !isRegionCode(cityId)) {
        return Response.json({ error: "Unsupported city_id" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    try {
        return Response.json(await getOnboardingCityPreview(cityId), { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
        if (error instanceof Error && error.message === "Unsupported city_id") {
            return Response.json({ error: error.message }, { status: 404, headers: { "Cache-Control": "no-store" } });
        }
        return Response.json({ error: "Data onboarding belum dapat dimuat." }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
}
