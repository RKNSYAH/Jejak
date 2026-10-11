import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import MonthlyCostSummary from "../app/components/map/onboarding/MonthlyCostSummary";

function render(estimate: { average: number; is_sample: boolean } | null, loading = false) {
    return renderToStaticMarkup(<MonthlyCostSummary estimate={estimate} loading={loading} />);
}

test("monthly cost summary matches the story review amount and provenance", () => {
    const html = render({ average: 4_500_000, is_sample: true });
    assert.match(html, /Perkiraan biaya bulanan di daerah rekomendasi/);
    assert.match(html, /sekitar Rp4\.500\.000 \/ bulan/);
    assert.match(html, /Rata-rata total sewa kecamatan \+ biaya hidup kota/);
    assert.match(html, /Data contoh/);
});

test("monthly cost summary exposes loading and missing-cost states", () => {
    assert.match(render(null, true), /Menghitung…/);
    assert.match(render(null), /Belum ada kecamatan rekomendasi dengan data biaya lengkap/);
});
