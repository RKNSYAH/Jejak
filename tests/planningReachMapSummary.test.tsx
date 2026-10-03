import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import PlanningReachSummary from "../app/components/map/PlanningReachSummary";
import MapBottomSheet from "../app/components/map/MapBottomSheet";
import { evaluateLiveOnboarding, formPreviewPreferences } from "../app/engine/onboarding/livePreview";
import { initialFormAnswers } from "../app/engine/onboarding/demoData";
import type { OnboardingArea } from "../app/engine/onboarding/types";

const preferences = { ...formPreviewPreferences(initialFormAnswers), transport: "car" as const,
    destinationPoint: [106.82, -6.24] as [number, number] };
const area: OnboardingArea = { zone_id: "a", zone_name: "A", city_id: "jakarta-selatan", city_name: "Jakarta Selatan",
    center: preferences.destinationPoint, is_sample: false, campuses: [], facts: [], transit_stop_count: 0, living_cost: null };
const preview = evaluateLiveOnboarding(preferences, 4, { cities: [], areas: [area, { ...area, zone_id: "b", center: null }], destinations: [] });
const props = { reach: preview.planningReach!, districts: preview.districts, destinationName: "Kantor", loading: false,
    error: null, geometryMissing: false, geometryError: null, districtsAvailable: true, onShowReach: () => {}, onRetry: () => {} };

test("regular map summarizes radius, center-point coverage and missing locations without fine print", () => {
    const html = renderToStaticMarkup(<PlanningReachSummary {...props} />);
    assert.match(html, /5,1–10,2 km/);
    assert.match(html, /1 kecamatan dalam kisaran · 1 lokasi belum tersedia/);
    assert.match(html, /Lihat jangkauan/);
    assert.doesNotMatch(html, /bukan seluruh wilayah|bukan jangkauan jaringan|Layanan transit belum diperiksa|Asumsi/);
});

test("unavailable district data is never reported as zero coverage", () => {
    const html = renderToStaticMarkup(<PlanningReachSummary {...props} districts={[]} districtsAvailable={false} />);
    assert.match(html, /Titik kecamatan belum tersedia/);
    assert.doesNotMatch(html, /0 kecamatan dalam kisaran/);
});

test("missing boundaries preserve distance and list counts and offer a retry", () => {
    const html = renderToStaticMarkup(<PlanningReachSummary {...props} geometryMissing geometryError="Batas belum tersedia" />);
    assert.match(html, /1 kecamatan dalam kisaran/);
    assert.match(html, /Sebagian batas belum tersedia/);
    assert.match(html, /Coba data kecamatan lagi/);
    assert.match(html, /5,1–10,2 km/);
});

test("sample district evidence stays visibly marked on the regular map", () => {
    const districts = [{ ...preview.districts[0], district: { ...area, is_sample: true } }];
    assert.match(renderToStaticMarkup(<PlanningReachSummary {...props} districts={districts} />), /Data contoh/);
});

test("save feedback lives inside the reach summary without a floating banner obscuring distance", () => {
    const html = renderToStaticMarkup(<PlanningReachSummary {...props} savedRevision={7} />);
    assert.match(html, /Profil tersimpan di akunmu · revisi 7/);
    assert.match(html, /Perkiraan jangkauan/);
});

test("empty budget-filtered exploration explains filtering instead of claiming missing locations", () => {
    const html = renderToStaticMarkup(<MapBottomSheet zones={[]} recommendations={[]} reachActive
        emptyMessage="Tidak ada kecamatan dengan batas anggaran ini." ref={null}
        onSelect={() => {}} onStateChange={() => {}} onHeightChange={() => {}} />);
    assert.match(html, /Tidak ada kecamatan dengan batas anggaran ini\./);
    assert.doesNotMatch(html, /Titik kecamatan di wilayah ini belum tersedia/);
});
