import { test } from "node:test";
import assert from "node:assert/strict";
import { getCityAreaName, getMetroCityIds } from "../app/engine/lib/metroArea";

const cities = [
    { city_id: "jakarta-selatan", city_name: "Kota Administrasi Jakarta Selatan" },
    { city_id: "jakarta-pusat", city_name: "Kota Administrasi Jakarta Pusat" },
    { city_id: "kepulauan-seribu", city_name: "Kabupaten Administrasi Kepulauan Seribu" },
    { city_id: "depok-kota", city_name: "Kota Depok" },
    { city_id: "bogor-kabupaten", city_name: "Kabupaten Bogor" },
    { city_id: "bandung-kota", city_name: "Kota Bandung" },
    { city_id: "surabaya-kota", city_name: "Kota Surabaya" },
    { city_id: "bantul", city_name: "Kabupaten Bantul" },
];

test("a Jabodetabek city expands to every Jabodetabek city, chosen city first", () => {
    assert.deepEqual(getMetroCityIds("jakarta-selatan", cities),
        ["jakarta-selatan", "jakarta-pusat", "kepulauan-seribu", "depok-kota", "bogor-kabupaten"]);
    assert.deepEqual(getMetroCityIds("depok-kota", cities)[0], "depok-kota");
});

test("cities outside Jabodetabek keep their own metro or stay alone", () => {
    assert.deepEqual(getMetroCityIds("bandung-kota", cities), ["bandung-kota"]);
    assert.deepEqual(getMetroCityIds("surabaya-kota", cities), ["surabaya-kota"]);
    assert.deepEqual(getMetroCityIds("bantul", cities), ["bantul"]);
    assert.deepEqual(getMetroCityIds("unknown", cities), ["unknown"]);
});

test("metro cities are labeled by their metro", () => {
    assert.equal(getCityAreaName(cities[0]), "Jabodetabek");
    assert.equal(getCityAreaName(cities[5]), "Bandung Raya");
    assert.equal(getCityAreaName(cities[7]), "Kabupaten Bantul");
});
