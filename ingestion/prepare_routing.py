"""Validate private routing inputs and optionally create complete-way regional extracts.

No source downloads, database writes, public outputs, or graph builds. Requires osmium-tool
only for --extract. Run --check with Python's standard library alone.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
BOUNDS = {
    "jakarta": [106.35, -6.85, 107.4, -5.85],
    "bandung": [107.2, -7.35, 108.05, -6.55],
    "surabaya": [112.25, -7.85, 113.15, -6.8],
}
REQUIRED = {
    "agency": ["agency_name", "agency_url", "agency_timezone"],
    "stops": ["stop_id", "stop_name", "stop_lat", "stop_lon"],
    "routes": ["route_id", "route_type"],
    "trips": ["route_id", "service_id", "trip_id"],
    "stop_times": ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def gtfs_time(value: str) -> int | None:
    if not value:
        return None  # GTFS permits interpolated intermediate stop times.
    parts = value.split(":")
    if len(parts) != 3 or not all(part.isdigit() for part in parts):
        raise ValueError(f"Invalid GTFS time: {value}")
    hour, minute, second = map(int, parts)
    if minute > 59 or second > 59:
        raise ValueError(f"Invalid GTFS time: {value}")
    return hour * 3600 + minute * 60 + second


def validate_gtfs(path: Path) -> dict:
    with ZipFile(path) as archive:
        if sum(info.file_size for info in archive.infolist()) > 200_000_000:
            raise ValueError("GTFS exceeds the 200 MB uncompressed validation limit")
        tables = {}
        for info in archive.infolist():
            if not info.filename.endswith(".txt"):
                continue
            name = Path(info.filename).stem
            if name in tables:
                raise ValueError(f"Duplicate GTFS table: {name}")
            with archive.open(info) as file:
                reader = csv.DictReader(io.TextIOWrapper(file, encoding="utf-8-sig", newline=""))
                missing = set(REQUIRED.get(name, [])) - set(reader.fieldnames or [])
                if missing:
                    raise ValueError(f"{name}: missing columns {sorted(missing)}")
                tables[name] = list(reader)
    for name in REQUIRED:
        if not tables.get(name):
            raise ValueError(f"Missing or empty GTFS table: {name}")
    if not tables.get("calendar") and not tables.get("calendar_dates"):
        raise ValueError("GTFS needs calendar.txt or calendar_dates.txt")

    def identifiers(table: str, column: str) -> set[str]:
        values = [row.get(column, "") for row in tables.get(table, [])]
        if any(not value for value in values) or len(set(values)) != len(values):
            raise ValueError(f"{table}: empty or duplicate {column}")
        return set(values)

    stops = identifiers("stops", "stop_id")
    routes = identifiers("routes", "route_id")
    trips = identifiers("trips", "trip_id")
    if tables.get("calendar"):
        identifiers("calendar", "service_id")
    services = {row.get("service_id") for name in ["calendar", "calendar_dates"] for row in tables.get(name, [])}
    shapes = {row.get("shape_id") for row in tables.get("shapes", [])}

    def reference(value: str, known: set[str], label: str) -> None:
        if value not in known:
            raise ValueError(f"Dangling {label}: {value}")

    if any(row["agency_timezone"] != "Asia/Jakarta" for row in tables["agency"]):
        raise ValueError("Unexpected agency timezone; expected Asia/Jakarta")
    for row in tables["stops"]:
        lon, lat = float(row["stop_lon"]), float(row["stop_lat"])
        west, south, east, north = BOUNDS["jakarta"]
        if not (west <= lon <= east and south <= lat <= north):
            raise ValueError(f"GTFS stop outside Jakarta road extract: {row['stop_id']}")
        if row.get("parent_station"):
            reference(row["parent_station"], stops, "parent_station")
    agency_ids = {row.get("agency_id", "") for row in tables["agency"]}
    for row in tables["routes"]:
        int(row["route_type"])
        if row.get("agency_id"):
            reference(row["agency_id"], agency_ids, "agency_id")
    for row in tables["trips"]:
        reference(row["route_id"], routes, "route_id")
        reference(row["service_id"], services, "service_id")
        if row.get("shape_id"):
            reference(row["shape_id"], shapes, "shape_id")
    by_trip = {}
    for row in tables["stop_times"]:
        reference(row["trip_id"], trips, "trip_id")
        reference(row["stop_id"], stops, "stop_id")
        sequence = int(row["stop_sequence"])
        if sequence < 0:
            raise ValueError("Negative stop sequence")
        by_trip.setdefault(row["trip_id"], []).append((sequence, gtfs_time(row["arrival_time"]), gtfs_time(row["departure_time"])))
    if set(by_trip) != trips:
        raise ValueError("One or more trips have no stop times")
    interpolated = 0
    for trip, times in by_trip.items():
        if len(times) < 2 or len({entry[0] for entry in times}) != len(times):
            raise ValueError(f"Trip {trip}: insufficient or duplicate stop sequences")
        previous = 0
        for _, arrival, departure in sorted(times):
            if arrival is None or departure is None:
                interpolated += 1
            for event in [arrival, departure]:
                if event is not None:
                    if event < previous:
                        raise ValueError(f"Trip {trip}: non-monotonic stop times")
                    previous = event
    for row in tables.get("frequencies", []):
        reference(row["trip_id"], trips, "frequency trip_id")
        start, end = gtfs_time(row["start_time"]), gtfs_time(row["end_time"])
        if start is None or end is None or start >= end or int(row["headway_secs"]) <= 0 or row.get("exact_times", "0") not in ["", "0", "1"]:
            raise ValueError("Invalid frequency entry")
    for row in tables.get("transfers", []):
        for field in ["from_stop_id", "to_stop_id"]:
            if row.get(field):
                reference(row[field], stops, field)
        for field in ["from_trip_id", "to_trip_id"]:
            if row.get(field):
                reference(row[field], trips, field)
        if row.get("min_transfer_time") and int(row["min_transfer_time"]) < 0:
            raise ValueError("Negative minimum transfer time")
    dates = []
    for name, fields in [("calendar", ["start_date", "end_date"]), ("calendar_dates", ["date"])]:
        seen = set()
        for row in tables.get(name, []):
            for field in fields:
                value = row.get(field, "")
                datetime.strptime(value, "%Y%m%d")
                dates.append(value)
            if name == "calendar":
                if row["start_date"] > row["end_date"] or any(row.get(day) not in ["0", "1"] for day in
                        ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]):
                    raise ValueError("Invalid calendar entry")
            else:
                key = (row.get("service_id"), row["date"])
                if key in seen or row.get("exception_type") not in ["1", "2"]:
                    raise ValueError("Invalid calendar exception")
                seen.add(key)
    for row in tables.get("shapes", []):
        if not (-180 <= float(row["shape_pt_lon"]) <= 180 and -90 <= float(row["shape_pt_lat"]) <= 90):
            raise ValueError("Invalid shape coordinate")
    return {
        "counts": {name: len(rows) for name, rows in tables.items()},
        "timezone": "Asia/Jakarta",
        "agencies": [row["agency_name"] for row in tables["agency"]],
        "calendar_range": [min(dates), max(dates)],  # Not a freshness or daily-service assertion.
        "stop_extent": [min(float(row["stop_lon"]) for row in tables["stops"]), min(float(row["stop_lat"]) for row in tables["stops"]),
                        max(float(row["stop_lon"]) for row in tables["stops"]), max(float(row["stop_lat"]) for row in tables["stops"])],
        "frequency_based": any(row.get("exact_times", "0") in ["", "0"] for row in tables.get("frequencies", [])),
        "interpolated_stop_times": interpolated,
        "warnings": ["Public availability does not establish the GTFS redistribution license", "Calendar range does not establish freshness"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate and print source metadata without writing")
    parser.add_argument("--extract", action="store_true", help="Run installed osmium-tool; create extracts and OTP inputs")
    parser.add_argument("--force", action="store_true", help="Replace previously generated outputs only")
    parser.add_argument("--data-dir", type=Path, default=ROOT / "ingestion/data")
    args = parser.parse_args()
    if args.check and args.extract:
        parser.error("--check and --extract are mutually exclusive")
    data = args.data_dir.resolve()
    osmium = shutil.which("osmium") if args.extract else None
    if args.extract and not osmium:
        raise ValueError("osmium-tool is required for --extract; no outputs or graph builds attempted")
    pbf, gtfs = data / "java-261001.osm.pbf", data / "file_gtfs.zip"
    report = {
        "schema_version": 1, "validated_at": datetime.now(timezone.utc).isoformat(),
        "bounds": BOUNDS, "gtfs": validate_gtfs(gtfs), "graphs_built": False,
        "inputs": {
            "osm": {"filename": pbf.name, "bytes": pbf.stat().st_size, "sha256": sha256(pbf), "license": "ODbL-1.0",
                    "source_url": "https://download.geofabrik.de/asia/indonesia/java.html", "snapshot_date": None},
            "gtfs": {"filename": gtfs.name, "bytes": gtfs.stat().st_size, "sha256": sha256(gtfs), "license": "unconfirmed",
                     "source_url": "https://gtfs.transjakarta.co.id/files/file_gtfs.zip", "snapshot_date": None},
        },
        "pbf_extent_checked": False, "extract_references_checked": False,
        "network_coverage_verified": False, "outputs": {},
    }
    if args.check:
        print(json.dumps(report, indent=2))
        return
    output = data / "routing"
    if output.exists() and any(output.iterdir()) and not args.force:
        raise ValueError("Routing output directory is not empty; use fresh staging or explicitly review --force")
    output.mkdir(parents=True, exist_ok=True)
    config = {"directory": str(output), "extracts": [{"output": f"{region}.osm.pbf", "bbox": box} for region, box in BOUNDS.items()]}
    config_path = output / "extracts.json"
    if config_path.exists() and not args.force:
        raise ValueError("Generated routing outputs exist; review them or use --force")
    config_path.write_text(json.dumps(config, indent=2), encoding="utf-8")
    if args.extract:
        report["osmium_version"] = subprocess.check_output([osmium, "--version"], text=True).splitlines()[0]
        report["pbf_header"] = json.loads(subprocess.check_output([osmium, "fileinfo", "--extended", "--json", str(pbf)], text=True))
        extent_text = subprocess.check_output([osmium, "fileinfo", "--extended", "--get", "data.bbox", str(pbf)], text=True)
        extent = [float(value) for value in re.findall(r"-?\d+(?:\.\d+)?", extent_text)]
        if len(extent) != 4 or any(not (extent[0] <= box[0] and extent[1] <= box[1] and extent[2] >= box[2] and extent[3] >= box[3]) for box in BOUNDS.values()):
            raise ValueError("PBF data bounds do not contain every configured region")
        report["pbf_extent"] = extent
        command = [osmium, "extract", "--strategy", "smart", "-S", "types=restriction,multipolygon", "--config", str(config_path), str(pbf)]
        if args.force:
            command.append("--overwrite")
        subprocess.run(command, check=True)
        for region in BOUNDS:
            path = output / f"{region}.osm.pbf"
            subprocess.run([osmium, "check-refs", str(path)], check=True)
            way_count = int(subprocess.check_output([osmium, "fileinfo", "--extended", "--get", "data.count.ways", str(path)], text=True))
            if way_count < 1:
                raise ValueError(f"Empty network for {region}")
            report["outputs"][region] = {"filename": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
        merged = output / "road-network.osm.pbf"
        merge = [osmium, "merge", *[str(output / f"{region}.osm.pbf") for region in BOUNDS], "--output", str(merged)]
        if args.force:
            merge.append("--overwrite")
        subprocess.run(merge, check=True)
        subprocess.run([osmium, "check-refs", str(merged)], check=True)
        otp = output / "otp"
        otp.mkdir(exist_ok=True)
        for source, destination in [(output / "jakarta.osm.pbf", otp / "jakarta.osm.pbf"), (gtfs, otp / "transjakarta.gtfs.zip")]:
            if destination.exists() and not args.force:
                raise ValueError(f"Output exists: {destination}")
            shutil.copyfile(source, destination)
        # Data extent and complete references do not establish routable coverage.
        report["pbf_extent_checked"] = True
        report["extract_references_checked"] = True
        report["outputs"]["roads"] = {"filename": merged.name, "bytes": merged.stat().st_size, "sha256": sha256(merged)}
    (output / "manifest.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
