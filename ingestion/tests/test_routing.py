import csv
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

SCRIPT = Path(__file__).resolve().parents[1] / "prepare_routing.py"
spec = importlib.util.spec_from_file_location("routing_preparation", SCRIPT)
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)


def feed():
    return {
        "agency": [{"agency_name": "Transjakarta", "agency_url": "https://example.test", "agency_timezone": "Asia/Jakarta"}],
        "stops": [{"stop_id": "a", "stop_name": "A", "stop_lon": "106.8", "stop_lat": "-6.2"},
                  {"stop_id": "b", "stop_name": "B", "stop_lon": "106.9", "stop_lat": "-6.3"}],
        "routes": [{"route_id": "r", "route_type": "3"}],
        "trips": [{"trip_id": "t", "route_id": "r", "service_id": "s"}],
        "stop_times": [{"trip_id": "t", "stop_id": "a", "arrival_time": "25:00:00", "departure_time": "25:01:00", "stop_sequence": "1"},
                       {"trip_id": "t", "stop_id": "b", "arrival_time": "25:10:00", "departure_time": "25:11:00", "stop_sequence": "2"}],
        "calendar_dates": [{"service_id": "s", "date": "20261005", "exception_type": "1"}],
        "frequencies": [{"trip_id": "t", "start_time": "25:00:00", "end_time": "26:00:00", "headway_secs": "600", "exact_times": "0"}],
    }


class RoutingPreparationTests(unittest.TestCase):
    def validate(self, tables):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "feed.zip"
            with ZipFile(path, "w") as archive:
                for name, rows in tables.items():
                    output = io.StringIO()
                    writer = csv.DictWriter(output, fieldnames=list(rows[0]))
                    writer.writeheader()
                    writer.writerows(rows)
                    archive.writestr(name + ".txt", output.getvalue())
            before = prep.sha256(path)
            result = prep.validate_gtfs(path)
            self.assertEqual(before, prep.sha256(path))
            return result

    def test_valid_frequency_feed_keeps_after_midnight_times_and_source_bytes(self):
        report = self.validate(feed())
        self.assertTrue(report["frequency_based"])
        self.assertEqual(report["calendar_range"], ["20261005", "20261005"])
        self.assertEqual(report["counts"]["stops"], 2)
        self.assertEqual(prep.gtfs_time("25:00:00"), 90000)

    def test_dangling_reference_fails(self):
        tables = feed()
        tables["trips"][0]["route_id"] = "missing"
        with self.assertRaisesRegex(ValueError, "Dangling route_id"):
            self.validate(tables)

    def test_duplicate_stop_fails(self):
        tables = feed()
        tables["stops"].append(tables["stops"][0])
        with self.assertRaisesRegex(ValueError, "duplicate stop_id"):
            self.validate(tables)

    def test_uncovered_stop_fails(self):
        tables = feed()
        tables["stops"][0]["stop_lon"] = "112.75"
        with self.assertRaisesRegex(ValueError, "outside Jakarta"):
            self.validate(tables)

    def test_missing_service_dates_fail(self):
        tables = feed()
        del tables["calendar_dates"]
        with self.assertRaisesRegex(ValueError, "needs calendar"):
            self.validate(tables)

    def test_time_backwards_fails(self):
        tables = feed()
        tables["stop_times"][1]["arrival_time"] = "24:00:00"
        with self.assertRaisesRegex(ValueError, "non-monotonic"):
            self.validate(tables)

    def test_invalid_frequency_fails(self):
        tables = feed()
        tables["frequencies"][0]["headway_secs"] = "0"
        with self.assertRaisesRegex(ValueError, "frequency"):
            self.validate(tables)

    def test_invalid_date_fails(self):
        tables = feed()
        tables["calendar_dates"][0]["date"] = "20260231"
        with self.assertRaises(ValueError):
            self.validate(tables)

    def test_check_never_claims_network_coverage_or_writes_outputs(self):
        with tempfile.TemporaryDirectory() as folder:
            data = Path(folder)
            # --check does not parse PBF contents; only the input hash is established.
            (data / "java-261001.osm.pbf").write_bytes(b"unverified test input")
            with ZipFile(data / "file_gtfs.zip", "w") as archive:
                for name, rows in feed().items():
                    output = io.StringIO()
                    writer = csv.DictWriter(output, fieldnames=list(rows[0]))
                    writer.writeheader()
                    writer.writerows(rows)
                    archive.writestr(name + ".txt", output.getvalue())
            report = json.loads(subprocess.check_output([sys.executable, "-B", str(SCRIPT), "--check", "--data-dir", folder], text=True))
            self.assertFalse(report["pbf_extent_checked"])
            self.assertFalse(report["extract_references_checked"])
            self.assertFalse(report["network_coverage_verified"])
            self.assertFalse(report["graphs_built"])
            self.assertFalse((data / "routing").exists())


if __name__ == "__main__":
    unittest.main()
