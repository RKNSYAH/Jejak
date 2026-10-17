import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import "../../e2e/fixtures/supabase.mjs";

// Capture-only API: the real /map UI reads sample facts and official BIG geometry.
// Start with the local preview environment documented in README.md, never production.
const boundaries = JSON.parse(await readFile(new URL("../../.temp/landing-capture/boundaries.geojson", import.meta.url), "utf8"));
const examples = [
    { name: "Setiabudi", slug: "setiabudi", center: [106.829, -6.222], rent: 2_600_000, wage: 6_400_000, population: 120_000, stops: 18, campuses: 3 },
    { name: "Tebet", slug: "tebet", center: [106.852, -6.236], rent: 1_800_000, wage: 6_000_000, population: 240_000, stops: 12, campuses: 2 },
];

const fact = (metric, value, unit) => ({
    metric, value, unit, source: "Data contoh Jejak", source_url: null, period_end: "2026-09-30",
    evidence_type: "estimated", limitations: "Contoh untuk ilustrasi produk", is_sample: true,
});

const regions = examples.map((example, index) => {
    const feature = boundaries.features.find((item) => item.properties.WADMKC.toLowerCase() === example.name.toLowerCase());
    if (!feature) throw new Error(`Official boundary missing: ${example.name}`);
    return {
        region_id: index + 1, region_code: `jakarta-selatan-${example.slug}`, region_name: example.name,
        parent_code: "jakarta-selatan", parent_name: "Kota Administrasi Jakarta Selatan", is_sample: true,
        center: example.center, geometry: feature.geometry,
        average_monthly_wage_idr: example.wage, median_monthly_rent_idr: example.rent,
        population: example.population, wage_to_rent_ratio: example.wage / example.rent,
        facts: [
            fact("average_monthly_wage_idr", example.wage, "IDR"),
            { ...fact("median_monthly_rent_idr", example.rent, "IDR"), dimension_key: "housing_type", dimension_value: "kos" },
            fact("population", example.population, "orang"),
            fact("public_transport_stops", example.stops, "halte"),
            fact("universities", example.campuses, "kampus"),
        ],
        places: [], campuses: [], transit_stop_count: example.stops,
        living_cost_monthly_idr: 2_300_000, living_cost_source: "Data contoh Jejak",
        living_cost_source_url: null, living_cost_limitations: "Contoh untuk ilustrasi produk", living_cost_is_sample: true,
    };
});

createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin === "http://127.0.0.1:3102" || origin === "http://localhost:3102") response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info, x-supabase-api-version");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    if (request.method === "OPTIONS") { response.writeHead(204); return response.end(); }
    const url = new URL(request.url, "http://127.0.0.1:3103");
    const send = (value) => { response.writeHead(200, { "Content-Type": "application/json" }); response.end(JSON.stringify(value)); };
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const rpc = url.pathname.replace("/rest/v1/rpc/", "");
    if (rpc === "get_map_regions") return send(regions);
    if (rpc === "get_map_region") return send(regions.filter((region) => region.region_code === body.p_region_code));
    if (rpc === "get_map_cells" || rpc === "get_evidence_clusters") return send([]);
    if (rpc === "get_my_subscription") return send({ plan_name: "Gratis" });
    if (rpc === "get_onboarding_cities") return send([{
        city_id: "jakarta-selatan", city_name: "Kota Administrasi Jakarta Selatan", district_count: 2,
        center: [106.831, -6.239], is_sample: true,
    }]);
    if (rpc === "get_onboarding_city_preview") return send(regions);
    try {
        const headers = { ...request.headers, host: "127.0.0.1:3101" };
        delete headers.connection;
        const result = await fetch(`http://127.0.0.1:3101${request.url}`, {
            method: request.method, headers, ...(raw ? { body: raw } : {}),
        });
        const payload = await result.text();
        response.writeHead(result.status, { "Content-Type": result.headers.get("content-type") ?? "application/json" });
        if (result.ok && url.pathname.startsWith("/auth/v1/") && payload) {
            const data = JSON.parse(payload);
            const user = data.user ?? data;
            if (user.user_metadata) user.user_metadata.name = "Akun Demo";
            return response.end(JSON.stringify(data));
        }
        response.end(payload);
    } catch {
        response.writeHead(502, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: "Local auth fixture unavailable" }));
    }
}).listen(3103, "127.0.0.1", () => console.log("Landing capture API ready on http://127.0.0.1:3103"));
