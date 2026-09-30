import { test } from "node:test";
import assert from "node:assert/strict";
import { getZoneSearchMatches, getZoneSearchScope } from "../app/components/map/zoneSearch";
import type { Zone } from "../app/engine/types";

const zone = (name: string, city: string, cityId = city.toLowerCase().replaceAll(" ", "-")): Zone => ({
    zone_id: `${cityId}-${name}`, zone_name: name, city_id: cityId, city_name: city,
});
const zones = [
    zone("Coblong", "Kota Bandung"),
    zone("Tebet", "Jakarta Selatan"),
    zone("Depok", "Kota Depok"),
    zone("Menteng", "Kota Administrasi Jakarta Pusat"),
    zone("Bogor Tengah", "Kota Bogor"),
    zone("Sukajadi", "Bandung"),
    zone("Cibinong", "Kabupaten Bogor"),
    zone("Bekasi Selatan", "Kota Bekasi"),
    zone("Serpong", "Kota Tangerang Selatan"),
    zone("Ciledug", "Kota Tangerang"),
    zone("Sewon", "Kabupaten Bantul"),
    zone("Lembang", "Kabupaten Bandung Barat"),
    zone("Cimahi Tengah", "Kota Cimahi"),
];

test("search context follows camera centers in Jakarta and its surrounding cities", () => {
    for (const center of [[106.8456, -6.2088], [106.6319, -6.1783], [106.7942, -6.4025], [106.8004, -6.5971], [106.9896, -6.2383]]) {
        assert.equal(getZoneSearchScope(center[0], center[1]), "jabodetabek");
    }
    assert.equal(getZoneSearchScope(107.6191, -6.9175), "bandung");
    assert.equal(getZoneSearchScope(107.542, -6.873), "bandung");
});

test("unrecognized and invalid camera centers do not fall back to Jakarta", () => {
    for (const [longitude, latitude] of [[110.3695, -7.7956], [0, 0], [NaN, -6], [106, Infinity], [106, 91]]) {
        assert.equal(getZoneSearchScope(longitude, latitude), null);
    }
    assert.deepEqual(getZoneSearchMatches(zones, "", null), zones.slice(0, 3));
});

test("empty search returns only the three highest-ranked local results without mutating the catalog", () => {
    const before = structuredClone(zones);
    const matches = getZoneSearchMatches(zones, "", "jabodetabek");
    assert.deepEqual(matches.map((item) => item.zone_name), ["Tebet", "Depok", "Menteng"]);
    assert.equal(matches[0], zones[1]);
    assert.deepEqual(zones, before);
    assert.equal(zones.length, 13);
});

test("text filtering runs before the limit and keeps city/regency members of Jabodetabek", () => {
    assert.deepEqual(getZoneSearchMatches(zones, "  BOGOR  ", "jabodetabek").map((item) => item.zone_name), ["Bogor Tengah", "Cibinong"]);
    for (const name of ["Bekasi Selatan", "Serpong", "Ciledug"]) {
        assert.equal(getZoneSearchMatches(zones, name, "jabodetabek")[0]?.zone_name, name);
    }
    assert.equal(getZoneSearchMatches(zones, "Coblong", "jabodetabek")[0]?.zone_name, "Coblong");
    assert.deepEqual(getZoneSearchMatches(zones, "not found", "jabodetabek"), []);
});

test("empty Bandung search suggests only local areas while typed searches can reach Jakarta", () => {
    assert.deepEqual(getZoneSearchMatches(zones, "", "bandung").map((item) => item.zone_name), ["Coblong", "Sukajadi", "Lembang"]);
    assert.deepEqual(getZoneSearchMatches(zones, "Cimahi", "bandung").map((item) => item.zone_name), ["Cimahi Tengah"]);
    assert.equal(getZoneSearchMatches(zones, "Tebet", "bandung")[0]?.zone_name, "Tebet");
    assert.equal(getZoneSearchMatches([zones[0], zones[1]], "", "bandung").length, 1);
    assert.deepEqual(getZoneSearchMatches([], "", "bandung"), []);
});

test("city codes, administrative prefixes and sample suffixes remain searchable", () => {
    const members = [zone("Pancoran", "Jakarta Selatan (demo parent)", "3174"),
        zone("Tebet", "Unknown", "jakarta-selatan"), zone("Bekasi", "Kabupaten Bekasi", "3216")];
    assert.equal(getZoneSearchMatches(members, "", "jabodetabek").length, 3);
    assert.deepEqual(getZoneSearchMatches([zone("Bantul", "Kabupaten Bantul", "3402")], "", "jabodetabek"), []);
});

test("typed search prioritizes local matches without blocking other cities or mutating catalog order", () => {
    const candidates = [zone("Sukajadi", "Bandung"), zone("Sukamaju", "Depok"),
        zone("Sukahati", "Kabupaten Bogor"), zone("Sukabumi Selatan", "Jakarta Barat"),
        zone("Sukamaju", "Yogyakarta")];
    const before = structuredClone(candidates);
    assert.deepEqual(getZoneSearchMatches(candidates, "Suka", "jabodetabek").map((item) => item.zone_name),
        ["Sukamaju", "Sukahati", "Sukabumi Selatan"]);
    assert.deepEqual(getZoneSearchMatches(candidates, "Suka", "bandung").map((item) => item.zone_name),
        ["Sukajadi", "Sukamaju", "Sukahati"]);
    assert.deepEqual(getZoneSearchMatches(candidates, "Yogyakarta", "jabodetabek"), [candidates[4]]);
    assert.deepEqual(getZoneSearchMatches(candidates, "Suka", null), candidates.slice(0, 3));
    assert.deepEqual(candidates, before);
});
