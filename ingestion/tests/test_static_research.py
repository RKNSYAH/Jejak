import importlib.util
import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook

SCRIPT = Path(__file__).resolve().parents[1] / "prepare_static_research.py"
spec = importlib.util.spec_from_file_location("static_research", SCRIPT)
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)

REGIONS = [
    {"region_code": "indonesia", "region_name": "Indonesia", "region_type": "country", "is_supported": True},
    {"region_code": "province", "region_name": "Province", "region_type": "province", "parent_region_code": "indonesia", "kemendagri_code": "31", "is_supported": True},
    {"region_code": "city", "region_name": "City", "region_type": "city", "parent_region_code": "province", "kemendagri_code": "31.74", "is_supported": True},
    {"region_code": "district", "region_name": "District", "region_type": "district", "parent_region_code": "city", "kemendagri_code": "31.74.02", "is_supported": True},
]
PROVENANCE = {"period_start": "2025-01-01", "period_end": "2025-12-31", "source_name": "Official table",
              "source_url": "https://example.test/table", "retrieved_at": "2026-10-01", "evidence_type": "observed", "is_sample": False}


class PreparationTests(unittest.TestCase):
    def prepare(self, include_review_as_baseline=False, **sheets):
        with tempfile.TemporaryDirectory() as folder:
            workbook = Workbook()
            workbook.remove(workbook.active)
            for table, records in {"regions": REGIONS, **sheets}.items():
                sheet = workbook.create_sheet(table)
                headers = [c for c in prep.TABLES[table]["columns"].split() if c not in {"as_of", "method_version"}]
                sheet.append(headers)
                for record in records:
                    sheet.append([record.get(c) for c in headers])
            path = Path(folder) / "source.xlsx"
            workbook.save(path)
            before = path.read_bytes()
            manifest = prep.prepare(path, include_review_as_baseline)
            self.assertEqual(path.read_bytes(), before, "read-only preparation preserves original bytes")
            return manifest

    def entries(self, manifest, table):
        return [e for e in manifest["rows"] if e["target_table"] == table]

    def test_unknown_names_activity_and_bad_websites_are_not_invented(self):
        manifest = self.prepare(
            institutions=[{"institution_code": "uni", "institution_name": "University", "institution_type": "university", "source_name": "Registry", "source_url": "https://example.test/uni"}],
            public_places=[{"region_code": "district", "category": "transit_stop", "osm_type": "node", "osm_id": 1,
                            "latitude": -6.2, "longitude": 106.8, "website": "http://example.test/stop", "source_name": "OpenStreetMap",
                            "source_url": "https://www.openstreetmap.org/node/1", "observed_at": "2026-10-01", "is_active": True}],
        )
        university = self.entries(manifest, "institutions")[0]
        place = self.entries(manifest, "public_places")[0]
        self.assertEqual(university["status"], "prepared")
        self.assertIsNone(university["payload"]["is_active"])
        self.assertEqual(place["status"], "prepared")
        self.assertIsNone(place["payload"]["place_name"])
        self.assertIsNone(place["payload"]["website"])
        self.assertEqual(place["raw_data"]["website"], "http://example.test/stop")

    def test_mixed_periods_and_missing_housing_periods_are_review_only(self):
        manifest = self.prepare(
            population=[{**PROVENANCE, "region_code": "district", "population": 100,
                         "limitations": "Consolidated 2 rows into one current record."}],
            housing_statistics=[{**PROVENANCE, "region_code": "district", "housing_type": "kos", "observation_count": 2,
                                 "median_monthly_rent_idr": 1000000, "period_start": None, "period_end": None}],
        )
        self.assertEqual(self.entries(manifest, "population")[0]["status"], "review")
        housing = self.entries(manifest, "housing_statistics")[0]
        self.assertEqual(housing["status"], "review")
        self.assertEqual(housing["payload"]["evidence_type"], "derived")
        self.assertIsNone(housing["payload"]["period_end"])
        sql = prep.compile_import(manifest)
        self.assertNotIn("insert into public.population", sql)
        self.assertNotIn("insert into public.housing_statistics", sql)
        self.assertIn("explicit workbook hash approval", sql)

    def test_manual_same_year_source_merges_are_not_a_single_observation(self):
        manifest = self.prepare(population=[{**PROVENANCE, "region_code": "district", "population": 100,
                            "male_population": 50, "female_population": 50, "source_name": "Health profile; RPJMD",
                            "limitations": "District male/female totals from a separate table."}])
        entry = self.entries(manifest, "population")[0]
        self.assertEqual(entry["status"], "review")
        self.assertIn("mixed_provenance", [i["code"] for i in entry["issues"]])

    def test_baseline_opt_in_preserves_numbers_and_unknown_periods(self):
        manifest = self.prepare(include_review_as_baseline=True,
            population=[{**PROVENANCE, "region_code": "district", "population": 100,
                         "male_population": 40, "female_population": 50,
                         "limitations": "Consolidated 2 rows into one current record."}],
            housing_statistics=[{**PROVENANCE, "region_code": "district", "housing_type": "kos",
                                 "observation_count": 2, "median_monthly_rent_idr": 1000000,
                                 "period_start": None, "period_end": None}],
        )
        population = self.entries(manifest, "population")[0]
        housing = self.entries(manifest, "housing_statistics")[0]
        self.assertEqual(population["status"], "baseline")
        self.assertEqual(population["payload"]["population"], 100)
        self.assertEqual(population["payload"]["male_population"], 40)
        self.assertEqual(population["raw_data"]["period_end"], "2025-12-31")
        self.assertIsNone(population["payload"]["period_end"])
        self.assertEqual(population["payload"]["evidence_type"], "estimated")
        self.assertTrue(all(i["accepted_as_baseline"] for i in population["issues"]))
        self.assertEqual(housing["status"], "baseline")
        self.assertEqual(housing["payload"]["evidence_type"], "derived")
        self.assertIsNone(housing["payload"]["period_end"])
        self.assertIn("Static research baseline", housing["payload"]["limitations"])
        self.assertEqual(manifest["report"]["baseline_rows"], 2)
        self.assertEqual(manifest["report"]["method_version"], prep.BASELINE_METHOD)
        sql = prep.compile_import(manifest)
        self.assertIn("s.status in ('prepared', 'baseline')", sql)
        self.assertIn("insert into public.housing_statistics", sql)

    def test_baseline_mode_never_bypasses_invalid_values_or_duplicate_keys(self):
        row = {**PROVENANCE, "region_code": "district", "population": 100,
               "limitations": "Consolidated 2 rows into one current record."}
        manifest = self.prepare(include_review_as_baseline=True,
            population=[row, row, {**row, "region_code": "missing"}, {**row, "population": "bad"}])
        self.assertTrue(all(e["status"] == "review" for e in self.entries(manifest, "population")))
        self.assertNotIn("insert into public.population", prep.compile_import(manifest))

    def test_baseline_unclassified_area_is_never_an_official_supported_region(self):
        unknown = {"region_code": "unknown", "region_name": "Unclassified", "region_type": "unclassified_area",
                   "parent_region_code": "city", "is_supported": False}
        manifest = self.prepare(include_review_as_baseline=True, regions=REGIONS + [unknown])
        self.assertEqual(self.entries(manifest, "regions")[-1]["status"], "baseline")
        for changes in [{"is_supported": True}, {"kemendagri_code": "31.74.99"}, {"bps_code": "999"}]:
            invalid = self.prepare(include_review_as_baseline=True, regions=REGIONS + [{**unknown, **changes}])
            self.assertEqual(self.entries(invalid, "regions")[-1]["status"], "review")

    def test_nonreconciling_population_is_not_forced_to_balance(self):
        manifest = self.prepare(population=[{**PROVENANCE, "region_code": "district", "population": 100,
                                            "male_population": 40, "female_population": 50}])
        entry = self.entries(manifest, "population")[0]
        self.assertEqual(entry["status"], "review")
        self.assertEqual(entry["payload"]["population"], 100)

    def test_invalid_program_code_and_note_cells_do_not_crash_review(self):
        manifest = self.prepare(student_enrollment=[{**PROVENANCE, "institution_code": "missing", "metric": "program_enrollment",
                            "student_count": 1, "data_scope": "program", "program_code": 123, "limitations": 123}])
        self.assertEqual(self.entries(manifest, "student_enrollment")[0]["status"], "review")

    def test_verified_repairs_are_bound_to_source_hash_and_expected_cells(self):
        workbook_hash, repairs = next(iter(prep.VERIFIED_REPAIRS.items()))
        repair = repairs[0]
        entry = {"sheet": repair["sheet"], "row_number": repair["row_number"], "target_table": repair["target_table"],
                 "payload": dict(repair["expected"]), "status": "prepared", "issues": [], "transformations": []}
        prep.apply_verified_repairs(entry, "0" * 64)
        self.assertEqual(entry["transformations"], [])
        prep.apply_verified_repairs(entry, workbook_hash)
        self.assertEqual(entry["payload"]["student_count"], 29819)
        self.assertEqual(entry["payload"]["retrieved_at"], "2026-10-01")
        self.assertNotIn("Consolidated", entry["payload"]["limitations"])
        self.assertEqual(entry["status"], "prepared")
        self.assertIn("source_rechecked", [i["code"] for i in entry["issues"]])

    def test_verified_repair_mismatch_stays_in_review(self):
        workbook_hash, repairs = next(iter(prep.VERIFIED_REPAIRS.items()))
        repair = repairs[0]
        entry = {"sheet": repair["sheet"], "row_number": repair["row_number"], "target_table": repair["target_table"],
                 "payload": {**repair["expected"], "student_count": 999}, "status": "prepared", "issues": [], "transformations": []}
        prep.apply_verified_repairs(entry, workbook_hash)
        self.assertEqual(entry["status"], "review")
        self.assertEqual(entry["payload"]["student_count"], 999)
        self.assertEqual(entry["transformations"], [])

    def test_program_names_keep_distinct_rows_without_fake_codes(self):
        manifest = self.prepare(
            institutions=[{"institution_code": "uni", "institution_name": "University", "institution_type": "university", "source_name": "Registry", "source_url": "https://example.test/uni", "is_active": True}],
            student_enrollment=[{**PROVENANCE, "institution_code": "uni", "data_scope": "program", "metric": "program_enrollment", "student_count": 10, "program_name": name} for name in ["Computing - S1", "Computing - S2"]],
        )
        entries = self.entries(manifest, "student_enrollment")
        self.assertEqual([e["status"] for e in entries], ["prepared", "prepared"])
        self.assertNotEqual(prep.identity(entries[0]), prep.identity(entries[1]))
        self.assertTrue(all(e["payload"]["program_code"] is None for e in entries))

    def test_kbli_groups_and_full_citations_survive_normalization(self):
        raw_code = "G,H,I,J,K,L,M,N,O,P,Q,R,S,T,U"
        manifest = self.prepare(sector_employment=[{**PROVENANCE, "region_code": "city", "kbli_2020_code": raw_code,
                            "kbli_2020_name": "Services", "source_sector_code": "services",
                            "source_url": "https://example.test/a\nhttps://example.test/b", "employment_percentage": 0.7}])
        entry = self.entries(manifest, "sector_employment")[0]
        self.assertEqual(entry["status"], "prepared")
        self.assertEqual(entry["payload"]["kbli_2020_code"], raw_code.lower().replace(",", "_"))
        self.assertEqual(entry["payload"]["source_urls"], ["https://example.test/a", "https://example.test/b"])
        self.assertEqual(entry["raw_data"]["kbli_2020_code"], raw_code)

    def test_duplicate_rows_and_missing_references_fail_closed(self):
        row = {**PROVENANCE, "region_code": "district", "population": 100}
        manifest = self.prepare(population=[row, row, {**row, "region_code": "unknown"}])
        self.assertTrue(all(e["status"] == "review" for e in self.entries(manifest, "population")))

    def test_invalid_numeric_cells_and_local_survey_grain_are_held(self):
        manifest = self.prepare(labor_force=[{**PROVENANCE, "region_code": "district", "unemployment_rate": 6.7}],
                                population=[{**PROVENANCE, "region_code": "city", "population": "Rp1.000"}])
        self.assertEqual(self.entries(manifest, "labor_force")[0]["status"], "review")
        self.assertEqual(self.entries(manifest, "population")[0]["status"], "review")

    def test_uncached_formulas_are_not_zero(self):
        manifest = self.prepare(living_cost_rates=[{"region_code": "city", "spending_tier": "budget", "food_monthly_idr": 1,
                     "utilities_monthly_idr": 2, "transport_monthly_idr": 3, "connectivity_monthly_idr": 4,
                     "laundry_monthly_idr": 5, "living_cost_total_monthly_idr": "=SUM(C2:G2)", "persons": 1,
                     "source_name": "Scenario", "source_url": "https://example.test/scenario", "retrieved_at": "2026-10-01",
                     "evidence_type": "estimated", "assumptions": "Analyst assumptions", "limitations": "One person", "is_sample": False}])
        entry = self.entries(manifest, "living_cost_rates")[0]
        self.assertEqual(entry["status"], "review")
        self.assertIsNone(entry["payload"]["living_cost_total_monthly_idr"])
        self.assertIn("missing_formula_cache", [i["code"] for i in entry["issues"]])

    def test_sql_data_is_quoted_and_unknown_status_retained(self):
        manifest = self.prepare(institutions=[{"institution_code": "uni", "institution_name": "O'Reilly $$; DROP TABLE regions; --",
                  "institution_type": "university", "source_name": "Registry", "source_url": "https://example.test/uni"}])
        sql = prep.compile_import(manifest)
        self.assertIn("O''Reilly", sql)
        self.assertNotIn("DISABLE TRIGGER", sql)
        self.assertNotIn("COPY", sql)
        self.assertNotIn("geometry = excluded.geometry", sql)
        self.assertIn("case when regions.geometry is not null then regions.source_name", sql)


if __name__ == "__main__":
    unittest.main()
