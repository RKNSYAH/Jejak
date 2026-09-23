export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const zoneName = searchParams.get("zone_name");

    if (!zoneName) {
        return new Response(JSON.stringify({ error: "Missing zone_name parameter" }), { status: 400 });
    }

    const query = new URLSearchParams({
        where: `WADMKC='${zoneName.replaceAll("'", "''")}'`,
        outFields: "KDCBPS,WADMKC,WADMKK,WADMPR",
        returnGeometry: "true",
        outSR: "4326",
        geometryPrecision: "5",
        maxAllowableOffset: "0.0001",
        f: "geojson",

    });
    const res = await fetch(
        `https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query?${query}`,
        {
            next: {
                revalidate: 60 * 60 * 24 * 30,
            },
        }
    );

    if (!res.ok) {
        return Response.json(
            { error: "Failed to fetch geometry" },
            { status: 502 }
        );
    }

    const data = await res.json();

    return Response.json(data);
}