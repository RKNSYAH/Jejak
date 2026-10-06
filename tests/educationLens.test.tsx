import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { RegionFact, ZoneDetailResult, ZoneGeometry } from "../app/engine/types";
import { getMapMetricConfig } from "../app/components/map/mapMetrics";
import { createZoneLayerData } from "../app/components/map/zoneLayerData";
import { getMetricRange, getZoneFillLayer } from "../app/components/map/zoneLayers";
import { getZoneMapData } from "../app/engine/lib/zoneApi";
import MapLegend from "../app/components/map/MapLegend";
import ZoneIntelligencePanel from "../app/components/map/ZoneIntelligencePanel";

function count(metric: string, value: number, overrides: Partial<RegionFact> = {}): RegionFact {
    return { metric, value, unit: "count", source: "Direktori pendidikan", source_url: "https://example.test/pendidikan",
        period_end: "2025-12-31", evidence_type: "observed", limitations: null, is_sample: false, ...overrides };
}

const details: Record<string, ZoneDetailResult> = {
    positive: { is_sample: false, places: [], facts: [count("schools", 51), count("universities", 3)] },
    zero: { is_sample: false, places: [], facts: [count("schools", 24), count("universities", 0)] },
    schoolOnly: { is_sample: false, places: [], facts: [count("schools", 12)] },
    universityOnly: { is_sample: false, places: [], facts: [count("universities", 2)] },
    missing: { is_sample: false, places: [], facts: [] },
    unavailable: { is_sample: false, places: [], facts: [count("schools", 0, { evidence_type: "unavailable" }),
        count("universities", 0, { evidence_type: "unavailable" })] },
};
const geometry: ZoneGeometry = {
    type: "FeatureCollection",
    features: Object.keys(details).map((id) => ({ type: "Feature", properties: { zone_id: id, zone_name: id },
        geometry: { type: "Polygon", coordinates: [[[106, -6], [107, -6], [107, -5], [106, -6]]] } })),
};

function panel(data: ZoneDetailResult | null, loading = false, category: "education" | "employment" = "education"): string {
    return renderToStaticMarkup(<ZoneIntelligencePanel zoneName="Kecamatan uji" category={category} details={data}
        loading={loading} error={null} isSample={data?.is_sample ?? false} geometryMissing={false}
        onRetry={() => {}} onClose={() => {}} mobileOpen={false} />);
}

test("education uses one chosen metric everywhere and preserves all district boundaries", () => {
    const schools = createZoneLayerData(geometry, details, "education");
    const universities = createZoneLayerData(geometry, details, "education", "universities");
    assert.deepEqual(schools.features.map((feature) => feature.properties.value), [51, 24, 12, null, null, null]);
    assert.deepEqual(universities.features.map((feature) => feature.properties.value), [3, 0, null, 2, null, null]);
    assert.deepEqual(schools.features.map((feature) => feature.properties.zone_id), Object.keys(details));
    assert.deepEqual(universities.features.map((feature) => feature.geometry), schools.features.map((feature) => feature.geometry));
    assert.deepEqual(getMetricRange(universities.features.map((feature) => feature.properties.value)), { min: 0, max: 3 });
    assert.deepEqual(getZoneFillLayer("education", { min: 0, max: 3 }).paint?.["fill-opacity"],
        ["case", ["==", ["get", "value"], null], 0, 0.6]);
    assert.equal(getMapMetricConfig("education").popupLabel, "Sekolah");
    assert.equal(getMapMetricConfig("education", "universities").label, "Jumlah universitas");
    assert.equal(getMapMetricConfig("education", "universities").metric, "universities");
    assert.equal(getMapMetricConfig("employment", "universities").metric, "company_count");
});

test("education panel always shows both cards, retaining zero separately from missing data", () => {
    const positive = panel(details.positive);
    assert.match(positive, />Sekolah<\/dt>/);
    assert.match(positive, />Universitas<\/dt>/);
    assert.match(positive, />51<\/dd>/);
    assert.match(positive, />3<\/dd>/);
    assert.doesNotMatch(positive, /Belum tersedia/);
    const zero = panel(details.zero);
    assert.match(zero, />0<\/dd>/);
    assert.doesNotMatch(zero, /Belum tersedia/);
    const schoolOnly = panel(details.schoolOnly);
    assert.match(schoolOnly, />12<\/dd>/);
    assert.match(schoolOnly, />Universitas<\/dt><dd[^>]*>Belum tersedia<\/dd>/);
    assert.doesNotMatch(schoolOnly, /Belum ada data pendidikan/);
    assert.match(panel(details.universityOnly), />Sekolah<\/dt><dd[^>]*>Belum tersedia<\/dd>/);
    for (const data of [details.missing, details.unavailable]) {
        const html = panel(data);
        assert.match(html, />Sekolah<\/dt><dd[^>]*>Belum tersedia<\/dd>/);
        assert.match(html, />Universitas<\/dt><dd[^>]*>Belum tersedia<\/dd>/);
        assert.doesNotMatch(html, />0<\/dd>/);
    }
});

test("education cards avoid source text dumps while retaining a source link and period", () => {
    const html = panel({ is_sample: true, places: [], facts: [count("schools", 51, {
        source: "Kota Jakarta Selatan Dalam Angka 2026, Tables 4.1.3, 4.1.5; Workbook 06_institutions + 07_campuses",
        is_sample: true, limitations: "Cakupan terbatas dengan metodologi panjang", evidence_type: "estimated",
    })] });
    assert.match(html, /Data contoh/);
    assert.match(html, /2025-12-31/);
    assert.match(html, /href="https:\/\/example.test\/pendidikan"/);
    assert.match(html, />Sumber<\/a>/);
    assert.doesNotMatch(html, /Kota Jakarta Selatan Dalam Angka|metodologi panjang/);
    const loading = panel(null, true);
    assert.match(loading, /Memuat…/);
    assert.doesNotMatch(loading, /Belum tersedia/);
});

test("other lens cards use the same concise source link", () => {
    const html = panel({ is_sample: false, places: [], facts: [count("company_count", 4, {
        source: "Long company registry source description",
    })] }, false, "employment");
    assert.match(html, />Sumber<\/a>/);
    assert.doesNotMatch(html, /Long company registry source description/);
});

test("campus points do not turn incomplete university counts into invented totals", () => {
    const campusOnly: ZoneDetailResult = { is_sample: false, facts: [], places: [{
        id: 1, name: "Kampus uji", category: "campus", latitude: -6.2, longitude: 106.8,
        source: "Direktori kampus", observed_at: null, is_sample: false,
    }] };
    const html = panel(campusOnly);
    assert.match(html, /Kampus uji/);
    assert.match(html, />Universitas<\/dt><dd[^>]*>Belum tersedia<\/dd>/);
    const layer = createZoneLayerData(geometry, { positive: campusOnly }, "education", "universities");
    assert.equal(layer.features[0].properties.value, null);
});

test("education legend uses the selected measure for its heading, source, scale, and coverage", () => {
    const provenanceDetails = Object.fromEntries(Object.entries(details).map(([id, data]) => [id, {
        ...data, facts: data.facts.map((fact) => ({ ...fact,
            source: fact.metric === "universities" ? "Direktori universitas" : "Survei sekolah",
            period_end: fact.metric === "universities" ? "2024-12-31" : "2025-12-31", is_sample: true,
        })),
    }]));
    const html = renderToStaticMarkup(<MapLegend category="education" range={{ min: 0, max: 3 }}
        detailsByZone={provenanceDetails} visibleZoneIds={Object.keys(details)} selectedZoneName={null}
        cellLayerOptions={[]} activeCellLayer={null} cellSummary={null} cellsLoading={false} cellsError={null}
        onCellLayerChange={() => {}} companyPointShown={false} educationMetric="universities" onEducationMetricChange={() => {}} />);
    assert.match(html, /Jumlah universitas/);
    assert.match(html, /Metrik pendidikan/);
    assert.match(html, /checked="" value="universities"/);
    assert.match(html, /3 dari 6 kecamatan memiliki data/);
    assert.match(html, /Tanpa warna: data belum tersedia/);
    assert.doesNotMatch(html, /Direktori universitas/);
    assert.match(html, /2024-12-31/);
    assert.match(html, /Data contoh/);
    assert.doesNotMatch(html, /Survei sekolah|2025-12-31/);
});

test("education counts survive the browser API as recorded, including zero", async (context) => {
    context.mock.method(globalThis, "fetch", async () => Response.json({ details: details.zero, geometry: null, geometry_error: null }));
    const result = (await getZoneMapData("district-zero", new AbortController().signal)).details;
    assert.deepEqual(result.facts.map((fact) => [fact.metric, fact.value]), [["schools", 24], ["universities", 0]]);
    context.mock.restoreAll();
});
