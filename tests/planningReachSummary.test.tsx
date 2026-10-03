import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import CommuteSummary from "../app/components/map/onboarding/CommuteSummary";
import { evaluateLiveOnboarding, formPreviewPreferences } from "../app/engine/onboarding/livePreview";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import type { OnboardingArea } from "../app/engine/onboarding/types";

test("local reach summary discloses assumptions without requiring routes", () => {
    const preferences = { ...formPreviewPreferences(initialFormAnswers), transport: "transit" as const,
        destinationPoint: [112.75, -7.25] as [number, number] };
    const preview = evaluateLiveOnboarding(preferences, 3, { cities: [], areas: [], destinations: [] });
    const html = renderToStaticMarkup(<CommuteSummary preview={preview} />);
    assert.match(html, /Perkiraan jangkauan 3,1–7,0 km/);
    assert.match(html, /asumsi 8–18 km\/jam/);
    assert.match(html, /bukan jangkauan jaringan/);
    assert.match(html, /Layanan transit belum diperiksa/);
    assert.doesNotMatch(html, /TransJakarta|Estimasi rute belum tersedia|Menghitung rute/);
});

test("cleared destination removes old area summary and asks for a new point", () => {
    const preview = evaluateLiveOnboarding(formPreviewPreferences(initialFormAnswers), 3, { cities: [], areas: [], destinations: [] });
    const html = renderToStaticMarkup(<CommuteSummary preview={preview} />);
    assert.match(html, /Pilih tujuan untuk melihat jangkauan/);
    assert.doesNotMatch(html, /Perkiraan jangkauan|Estimasi rute belum tersedia/);
});

test("reach count follows the same hidden-budget districts as map and list", () => {
    const center: [number, number] = [106.82, -6.24];
    const area: OnboardingArea = { zone_id: "a", zone_name: "A", city_id: "jakarta-selatan", city_name: "Jakarta Selatan",
        center, is_sample: false, campuses: [], transit_stop_count: 0, living_cost: null, facts: [{
            metric: "median_monthly_rent_idr", value: 10_000_000, unit: "IDR", source: "Survei", period_end: null,
            evidence_type: "derived", limitations: null, is_sample: false, dimension_key: "housing_type", dimension_value: "kos",
        }] };
    const preferences = { ...formPreviewPreferences(initialFormAnswers), destinationPoint: center, overBudget: "hide" as const };
    const preview = evaluateLiveOnboarding(preferences, 3, { cities: [], areas: [area], destinations: [] });
    assert.equal(preview.districts[0].reachBand, "near");
    assert.equal(preview.districts[0].eligible, false);
    assert.match(renderToStaticMarkup(<CommuteSummary preview={preview} />), /0 titik kecamatan/);
});
