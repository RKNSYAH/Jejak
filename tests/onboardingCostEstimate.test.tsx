import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import CostEstimate from "../app/components/map/onboarding/CostEstimate";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import { evaluateLiveOnboarding, formPreviewPreferences } from "../app/engine/onboarding/livePreview";
import type { FormStep, OnboardingArea } from "../app/engine/onboarding/types";

const area: OnboardingArea = {
    zone_id: "district-a", zone_name: "Kecamatan A", city_id: "jakarta-selatan", city_name: "Jakarta Selatan",
    is_sample: false, center: [106.8, -6.25], campuses: [], transit_stop_count: 0,
    facts: [{ metric: "median_monthly_rent_idr", value: 1_500_000, unit: "IDR", source: "Survei sewa kecamatan",
        source_url: "https://example.test/rent", period_end: "2026-06-30", evidence_type: "derived", limitations: "Static research baseline",
        is_sample: false, dimension_key: "housing_type", dimension_value: "kos" }],
    living_cost: { value: 3_000_000, source: "Keranjang biaya kota", source_url: "https://example.test/cost",
        limitations: "Estimasi satu orang", is_sample: false },
};

function render(selectedDistrictId: string | null, district = area, step: FormStep = 2) {
    const preview = evaluateLiveOnboarding(formPreviewPreferences(initialFormAnswers), step, {
        cities: [{ city_id: area.city_id, city_name: area.city_name, district_count: 1, center: area.center, is_sample: false }],
        areas: [district], destinations: [],
    });
    return renderToStaticMarkup(<CostEstimate preview={preview} selectedDistrictId={selectedDistrictId}
        onSelectDistrict={() => {}} disabled={false} />);
}

test("cost section is expanded and shows only the city reference before district selection", () => {
    const html = render(null);
    assert.match(html, /Perkiraan biaya bulanan/);
    assert.match(html, /sekitar Rp3\.000\.000/);
    assert.match(html, /belum termasuk sewa/);
    assert.doesNotMatch(html, /Estimasi satu orang/);
    assert.match(html, /Pilih kecamatan/);
    assert.doesNotMatch(html, /<details|Rp1\.500\.000|Rp4\.500\.000/);
});

test("a fitting district shows rent, city estimate, and total with no status or per-item sources", () => {
    const html = render(area.zone_id);
    for (const value of ["Rp1.500.000", "sekitar Rp3.000.000", "sekitar Rp4.500.000",
        "belum termasuk sewa"]) assert.ok(html.includes(value));
    assert.doesNotMatch(html, /Sumber|example.test|Batas belum terverifikasi/);
    assert.doesNotMatch(html, /Data contoh|Static research baseline/);
    assert.match(render(area.zone_id, { ...area, living_cost: { ...area.living_cost!, is_sample: true } }), /Data contoh/);
});

test("missing rent or city costs never produce a fabricated total or zero-cost fit", () => {
    for (const district of [{ ...area, living_cost: null }, { ...area, facts: [] }]) {
        const html = render(area.zone_id, district);
        assert.match(html, /Belum tersedia/);
        assert.match(html, /Batas biaya belum terverifikasi/);
        assert.doesNotMatch(html, /Rp0|Rp4\.500\.000|Batas sewa dan biaya terpenuhi/);
    }
});

test("missing commute does not relabel a supported financial fit as unknown cost", () => {
    const html = render(area.zone_id, area, 4);
    assert.match(html, /sekitar Rp4\.500\.000/);
    assert.doesNotMatch(html, /Batas biaya belum terverifikasi/);
});
