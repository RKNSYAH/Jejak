"""Estimate office workers per H3 cell from GHSL and OpenStreetMap buildings.

Method building-workers-v0 (ranges from parameters.json):
  1. H3 resolution-9 cells cover BIG kecamatan boundaries; a cell belongs to the
     district that contains its centre.
  2. GHSL non-residential volume / storey height = non-residential floor area.
  3. OSM buildings with a floor count or height add known office floor area
     (office, government, office points, a share of commercial) and remove other
     known non-residential floor area (retail, hotels, hospitals, schools, ...).
  4. Office floor area = OSM office area + a default office share of the GHSL
     floor area that OSM does not explain.
  5. Workers = office floor area x usable share x occupancy / m2 per worker,
     as low / central / high.

Run download_sources.py for the city first. Outputs go to ingestion/data/<city>/.
    .venv/Scripts/python ingestion/building_workers.py jakarta setiabudi
    .venv/Scripts/python ingestion/building_workers.py jakarta --sample-sql
"""
import argparse
import csv
import json
import math
import re
import urllib.parse
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

import duckdb
import h3
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import xy

from download_sources import CITIES, DATA, RAW, download

BIG_KECAMATAN = ("https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/"
                 "BATAS_KECAMATAN_AR/MapServer/0/query")
KEMENDAGRI_PREFIX = {"jakarta": "31.", "bandung": "32.73.", "surabaya": "35.78."}
PARAMETERS = json.loads((Path(__file__).parent / "parameters.json").read_text(encoding="utf-8"))
# +1: a higher value means more workers; -1: fewer.
DIRECTION = {"floor_height_m": -1, "net_to_gross": 1, "occupancy": 1, "area_per_worker_m2": -1,
             "mixed_office_share": 1, "unknown_office_share": 1}

INACTIVE = {"construction", "proposed", "demolished", "ruins", "disused", "abandoned"}
RESIDENTIAL = {"apartments", "residential", "house", "detached", "semidetached_house", "terrace",
               "dormitory", "bungalow", "hut", "cabin", "farm", "houseboat", "static_caravan"}
OFFICE = {"office", "government"}
MIXED = {"commercial"}
OTHER = {"retail", "mall", "supermarket", "kiosk", "hotel", "hospital", "school", "university",
         "college", "kindergarten", "mosque", "church", "temple", "religious", "cathedral", "chapel",
         "shrine", "civic", "public", "train_station", "transportation", "industrial", "warehouse",
         "factory", "garage", "garages", "parking", "service", "stadium", "sports_hall",
         "sports_centre", "fire_station", "hangar", "roof", "carport", "shed", "toilets", "greenhouse"}
RESIDENTIAL_NAME = re.compile(r"\b(apartemen|apartments?|residences?|condominium|condo|suites|kos|kost|"
                              r"rusun|rusunawa|rusunami|hunian|perumahan)\b", re.I)
OFFICE_NAME = re.compile(r"\b(menara|wisma|gedung|office|tower)\b", re.I)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")


def districts(city: str, wanted: list[str]) -> dict[str, dict]:
    """Kecamatan boundaries from BIG (cached), keyed by the app's district code."""
    query = urllib.parse.urlencode({
        "where": f"KDCPUM LIKE '{KEMENDAGRI_PREFIX[city]}%'", "outFields": "WADMKC,KDCPUM",
        "returnGeometry": "true", "outSR": "4326", "geometryPrecision": "6", "f": "geojson"})
    path = download(f"{BIG_KECAMATAN}?{query}", RAW / "big" / f"{city}_kecamatan.geojson")
    west, south, east, north = CITIES[city]
    found = {}
    for feature in json.loads(path.read_text(encoding="utf-8"))["features"]:
        geometry = feature["geometry"]
        polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
        points = [point for polygon in polygons for point in polygon[0]]
        lng, lat = sum(p[0] for p in points) / len(points), sum(p[1] for p in points) / len(points)
        # Skip districts outside the downloaded box, e.g. Kepulauan Seribu.
        if west <= lng <= east and south <= lat <= north:
            found[slug(feature["properties"]["WADMKC"])] = feature
    missing = [code for code in wanted if code not in found]
    if missing:
        raise SystemExit(f"unknown districts {missing}; available: {sorted(found)}")
    return {code: found[code] for code in (wanted or found)}


def number(value: str | None) -> float | None:
    values = [float(x.replace(",", ".")) for x in re.findall(r"\d+(?:[.,]\d+)?", value or "")]
    return max(values) if values else None


def classify(building: str, name: str, office_tag: bool, other_use: bool, office_point: bool,
             construction: bool, floors: float | None) -> str:
    if building in INACTIVE or construction:
        return "inactive"
    if building in RESIDENTIAL:
        return "residential"
    if office_tag or building in OFFICE:
        return "office"
    # A mall or hotel keeps its own use even when a small office inside it is mapped as a point.
    if other_use:
        return "other"
    if office_point:
        return "office"
    if name and RESIDENTIAL_NAME.search(name):
        return "residential"
    if building in MIXED:
        return "mixed"
    if building in OTHER:
        return "other"
    if name and OFFICE_NAME.search(name) and floors and floors >= 5:
        return "office"
    return "unknown"


def ghsl_volume(city: str, owner: dict[str, str]) -> dict[str, float]:
    """Sums 1-ha GHSL pixels into the H3 cell containing each pixel centre."""
    with rasterio.open(DATA / city / "ghsl_nres_volume_2020_100m.tif") as src:
        volume = src.read(1, masked=True).filled(0)
        rows, cols = np.nonzero(volume)
        xs, ys = xy(src.transform, rows, cols)
        lngs, lats = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True).transform(xs, ys)
    totals: dict[str, float] = defaultdict(float)
    for lat, lng, value in zip(lats, lngs, volume[rows, cols]):
        cell = h3.latlng_to_cell(lat, lng, 9)
        if cell in owner:
            totals[cell] += float(value)
    return totals


def osm_buildings(city: str, owner: dict[str, str]) -> tuple[list[dict], list[dict]]:
    lats, lngs = zip(*(h3.cell_to_latlng(cell) for cell in owner))
    margin = 0.005  # ~500 m, so buildings straddling cell edges are included
    envelope = f"ST_MakeEnvelope({min(lngs) - margin}, {min(lats) - margin}, {max(lngs) + margin}, {max(lats) + margin})"
    utm = f"EPSG:{32700 + math.floor((sum(lngs) / len(lngs) + 180) / 6) + 1}"
    source = (DATA / city / "osm_buildings_offices.parquet").as_posix()
    con = duckdb.connect()
    con.sql("INSTALL spatial; LOAD spatial;")
    rows = con.sql(f"""
        WITH f AS (SELECT feature_id, tags, geometry::GEOMETRY AS g FROM '{source}'
                   WHERE ST_Intersects(geometry::GEOMETRY, {envelope})),
             b AS (SELECT * FROM f WHERE map_contains(tags, 'building')
                   AND ST_GeometryType(g) IN ('POLYGON', 'MULTIPOLYGON')),
             p AS (SELECT g FROM f WHERE map_contains(tags, 'office') AND ST_GeometryType(g) = 'POINT'),
             o AS (SELECT DISTINCT b.feature_id FROM b JOIN p ON ST_Contains(b.g, p.g))
        SELECT b.feature_id, b.tags['building'], b.tags['name'], b.tags['building:levels'], b.tags['height'],
               map_contains(b.tags, 'office'),
               map_contains(b.tags, 'shop') OR map_contains(b.tags, 'amenity') OR map_contains(b.tags, 'tourism')
                   OR map_contains(b.tags, 'leisure') OR map_contains(b.tags, 'healthcare'),
               o.feature_id IS NOT NULL, map_contains(b.tags, 'construction'),
               ST_Area(ST_Transform(b.g, 'EPSG:4326', '{utm}', always_xy := true)),
               ST_Y(ST_Centroid(b.g)), ST_X(ST_Centroid(b.g))
        FROM b LEFT JOIN o USING (feature_id)""").fetchall()

    buildings, rejected = [], []
    for fid, building, name, levels, height, office_tag, other_use, office_point, construction, area, lat, lng in rows:
        cell = h3.latlng_to_cell(lat, lng, 9)
        if cell not in owner:
            continue
        reject = lambda reason: rejected.append({"feature_id": fid, "name": name, "building": building,
                                                 "building_levels": levels, "height": height, "reason": reason})
        floors = number(levels)
        if floors is not None and floors > PARAMETERS["max_plausible_floors"]:
            reject("implausible building:levels")
            floors = None
        floors = floors if floors and floors >= 1 else None
        # A height is only used when there is no floor count.
        metres = None if floors else number(height)
        if metres is not None and metres > PARAMETERS["max_plausible_floors"] * 5:
            reject("implausible height")
            metres = None
        use = classify(building or "", name or "", bool(office_tag), bool(other_use), bool(office_point),
                       bool(construction), floors or (metres and metres / 3.8))
        buildings.append({"cell": cell, "use": use, "area": area, "floors": floors,
                          "height": None if floors else metres, "name": name})
    return buildings, rejected


def cell_inputs(owner: dict[str, str], volume: dict[str, float], buildings: list[dict]) -> dict[str, dict]:
    """Per cell: GHSL volume and, per use, sum(area x floors) and sum(area x height)."""
    cells = {cell: {"volume": volume.get(cell, 0.0), "buildings": 0, "candidates": 0, "with_floors": 0,
                    "by_floors": Counter(), "by_height": Counter(), "offices": []} for cell in owner}
    for b in buildings:
        c = cells[b["cell"]]
        c["buildings"] += 1
        if b["use"] in ("office", "mixed", "other", "unknown") and b["area"] >= 30:
            c["candidates"] += 1
        if b["floors"]:
            c["with_floors"] += 1
            c["by_floors"][b["use"]] += b["area"] * b["floors"]
        elif b["height"]:
            c["with_floors"] += 1
            c["by_height"][b["use"]] += b["area"] * b["height"]
        if b["use"] == "office" and b["name"]:
            c["offices"].append((b["area"] * (b["floors"] or 1), b["name"]))
    return cells


def estimate(c: dict, p: dict[str, float]) -> tuple[float, float]:
    """Returns (workers, office floor area m2) for one cell under one parameter set."""
    fh = p["floor_height_m"]
    floor = lambda use: c["by_floors"][use] + c["by_height"][use] / fh
    ghsl_floor = c["volume"] / fh
    osm_office = floor("office") + p["mixed_office_share"] * floor("mixed")
    osm_other = floor("other") + (1 - p["mixed_office_share"]) * floor("mixed")
    unexplained = max(0.0, ghsl_floor - osm_office - osm_other)
    office_floor = osm_office + p["unknown_office_share"] * unexplained
    return office_floor * p["net_to_gross"] * p["occupancy"] / p["area_per_worker_m2"], office_floor


def scenario(kind: str, override: tuple[str, str] | None = None) -> dict[str, float]:
    def value(name: str, end: str) -> float:
        low, high = PARAMETERS[name]["low"], PARAMETERS[name]["high"]
        if end == "central":
            return (low + high) / 2
        fewer = high if DIRECTION[name] < 0 else low
        more = low if DIRECTION[name] < 0 else high
        return fewer if end == "fewer" else more
    params = {name: value(name, kind) for name in DIRECTION}
    if override:
        params[override[0]] = value(*override)
    return params


def boundary(cell: str) -> dict:
    ring = [[round(lng, 6), round(lat, 6)] for lat, lng in h3.cell_to_boundary(cell)]
    return {"type": "Polygon", "coordinates": [ring + [ring[0]]]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("city", choices=CITIES)
    parser.add_argument("districts", nargs="*", help="district codes, e.g. setiabudi (default: all)")
    parser.add_argument("--sample-sql", action="store_true", help="also write SQL that loads the cells as sample rows")
    args = parser.parse_args()

    areas = districts(args.city, args.districts)
    owner = {cell: code for code, feature in areas.items() for cell in h3.geo_to_cells(feature["geometry"], 9)}
    buildings, rejected = osm_buildings(args.city, owner)
    cells = cell_inputs(owner, ghsl_volume(args.city, owner), buildings)
    low, central, high = (scenario(kind) for kind in ("fewer", "central", "more"))

    out = DATA / args.city
    suffix = "".join(f"_{code}" for code in args.districts)  # a district run never overwrites the city files
    rows = []
    for cell, c in sorted(cells.items()):
        w_low, _ = estimate(c, low)
        w, office_floor = estimate(c, central)
        w_high, _ = estimate(c, high)
        rows.append({"cell_code": f"h3-{cell}", "district": owner[cell],
                     "workers_low": int(round(w_low, -1)), "workers": int(round(w, -1)), "workers_high": int(round(w_high, -1)),
                     "office_floor_m2": round(office_floor), "ghsl_nres_m3": round(c["volume"]),
                     "buildings": c["buildings"], "candidate_buildings": c["candidates"],
                     "buildings_with_floors": c["with_floors"]})
    with open(out / f"workers_cells{suffix}.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    geojson = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": boundary(r["cell_code"][3:]), "properties": r} for r in rows]}
    (out / f"workers_cells{suffix}.geojson").write_text(json.dumps(geojson), encoding="utf-8")
    with open(out / f"rejected_buildings{suffix}.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["feature_id", "name", "building", "building_levels", "height", "reason"])
        writer.writeheader()
        writer.writerows(rejected)

    report(areas, cells, rows, buildings, rejected, central)
    if args.sample_sql:
        write_sample_sql(out / f"workers_cells_sample{suffix}.sql", rows)


def report(areas, cells, rows, buildings, rejected, central) -> None:
    print(f"method {PARAMETERS['method_version']}{' (PLACEHOLDER parameters)' if PARAMETERS['placeholder'] else ''}")
    for code in areas:
        own = [r for r in rows if r["district"] == code]
        hidden = sum(r["candidate_buildings"] < 3 for r in own)
        print(f"{code}: {len(own)} cells, workers {sum(r['workers_low'] for r in own):,.0f} - "
              f"{sum(r['workers_high'] for r in own):,.0f} (central {sum(r['workers'] for r in own):,.0f}), "
              f"{hidden} cells hidden (<3 candidate buildings)")
    uses = Counter(b["use"] for b in buildings)
    with_floors = sum(1 for b in buildings if b["floors"] or b["height"])
    print(f"buildings {len(buildings):,}: " + ", ".join(f"{k} {v:,}" for k, v in uses.most_common())
          + f" | with floors/height {with_floors:,} ({with_floors / max(len(buildings), 1):.1%}) | rejected {len(rejected)}")
    print("busiest cells:")
    for r in sorted(rows, key=lambda r: -r["workers"])[:5]:
        names = [n for _, n in sorted(cells[r["cell_code"][3:]]["offices"], reverse=True)[:3]]
        print(f"  {r['cell_code']} {r['district']}: {r['workers_low']:,.0f}-{r['workers_high']:,.0f} workers | {', '.join(names) or '(no named offices)'}")
    base = sum(estimate(c, central)[0] for c in cells.values())
    swings = []
    for name in DIRECTION:
        fewer = sum(estimate(c, scenario("central", (name, "fewer")))[0] for c in cells.values())
        more = sum(estimate(c, scenario("central", (name, "more")))[0] for c in cells.values())
        swings.append((more - fewer, name, fewer, more))
    print(f"sensitivity of the total ({base:,.0f} central), one parameter at a time:")
    for swing, name, fewer, more in sorted(swings, reverse=True):
        print(f"  {name:22s} {fewer:>10,.0f} - {more:>10,.0f}  (swing {swing / base:.0%})")


def write_sample_sql(path: Path, rows: list[dict]) -> None:
    """Loads the cells as sample rows so the map can show them without claiming verified data."""
    osm_date = date.fromtimestamp((RAW / "osm" / "java-latest.osm.pbf").stat().st_mtime).isoformat()
    values = ",\n".join(
        f"    ('{r['cell_code']}', '{r['district']}', '{json.dumps(boundary(r['cell_code'][3:]))}', "
        f"{r['workers']:.0f}, {r['workers_low']:.0f}, {r['workers_high']:.0f}, {r['candidate_buildings']})"
        for r in rows)
    limitation = (f"Estimated with {PARAMETERS['method_version']} from GHSL 2020 non-residential volume and "
                  f"OpenStreetMap buildings ({osm_date}) using placeholder parameters; not verified.")
    districts_sql = ", ".join(sorted({f"'{r['district']}'" for r in rows}))
    sql = f"""-- Generated by ingestion/building_workers.py. Loads building-based worker estimates as SAMPLE rows.
begin;
-- Other sample worker values in these districts (e.g. the mock seed) would mix with this estimate.
delete from public.region_data as fact
using public.regions as cell, public.regions as district
where fact.region_id = cell.id and cell.parent_id = district.id and cell.region_type = 'grid'
  and district.code in ({districts_sql}) and fact.is_sample
  and fact.metric in ('estimated_office_workers', 'estimated_office_workers_low', 'estimated_office_workers_high')
  and fact.source <> 'Jejak {PARAMETERS['method_version']}';
with cell(code, district, boundary, workers, workers_low, workers_high, buildings) as (values
{values}
), grid as (
    insert into public.regions (parent_id, code, name, region_type, geometry, source, is_supported, is_sample)
    select district.id, cell.code, 'H3 cell ' || substr(cell.code, 4), 'grid',
           extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(cell.boundary), 4326)),
           'H3 resolution 9 grid', false, true
    from cell join public.regions district on district.code = cell.district
    on conflict (code) do update set parent_id = excluded.parent_id, geometry = excluded.geometry
    where public.regions.is_sample = true
    returning id, code
)
insert into public.region_data
    (region_id, metric, numeric_value, unit, evidence_type, period_end, source, sample_size, limitations, is_sample)
select grid.id, fact.metric, fact.value, 'workers', 'estimated', date '{osm_date}',
       'Jejak {PARAMETERS['method_version']}', cell.buildings, '{limitation}', true
from cell join grid on grid.code = cell.code
cross join lateral (values
    ('estimated_office_workers', cell.workers),
    ('estimated_office_workers_low', cell.workers_low),
    ('estimated_office_workers_high', cell.workers_high)
) as fact(metric, value)
on conflict (region_id, metric, period_start, period_end, source) do update
set numeric_value = excluded.numeric_value, sample_size = excluded.sample_size, limitations = excluded.limitations
where public.region_data.is_sample = true;
commit;
"""
    path.write_text(sql, encoding="utf-8")
    print(f"wrote {path}")


if __name__ == "__main__":
    main()
