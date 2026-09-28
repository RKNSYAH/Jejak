"""Download the building inputs for one MVP city's office-worker heatmap.

- GHSL non-residential built volume, 2020 (JRC GHS-BUILT-V R2023A, 100 m, Mollweide,
  CC BY 4.0), cropped to the city.
- OpenStreetMap buildings and office features with all their tags (Geofabrik Java
  extract, ODbL: credit "© OpenStreetMap contributors"), cropped to the city.

Raw downloads are cached in ingestion/data/raw; city outputs go to ingestion/data/<city>/.

    python -m venv .venv
    .venv/Scripts/python -m pip install -r ingestion/requirements.txt
    .venv/Scripts/python ingestion/download_sources.py jakarta
"""
import argparse
import math
import shutil
import urllib.request
import zipfile
from pathlib import Path

import pyarrow.parquet as pq
import quackosm
import rasterio
from pyproj import Transformer
from rasterio.windows import from_bounds
from shapely.geometry import box

# West, south, east, north. Generous boxes; the import script clips to real boundaries.
CITIES = {
    "jakarta": (106.68, -6.38, 106.98, -6.08),
    "bandung": (107.54, -6.98, 107.74, -6.83),
    "surabaya": (112.59, -7.36, 112.85, -7.18),
}
GHSL_TILE_URL = (
    "https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_V_GLOBE_R2023A/"
    "GHS_BUILT_V_NRES_E2020_GLOBE_R2023A_54009_100/V1-0/tiles/"
    "GHS_BUILT_V_NRES_E2020_GLOBE_R2023A_54009_100_V1_0_{tile}.zip"
)
JAVA_PBF_URL = "https://download.geofabrik.de/asia/indonesia/java-latest.osm.pbf"
DATA = Path(__file__).resolve().parent / "data"
RAW = DATA / "raw"


def download(url: str, path: Path) -> Path:
    """Downloads once; an interrupted download never replaces the cached file."""
    if path.exists():
        return path
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".part")
    print(f"downloading {url}")
    with urllib.request.urlopen(url) as response, open(partial, "wb") as out:
        shutil.copyfileobj(response, out, length=1 << 20)
    partial.replace(path)
    return path


def ghsl_nres(city: str, bbox: tuple[float, float, float, float]) -> Path:
    to_mollweide = Transformer.from_crs("EPSG:4326", "ESRI:54009", always_xy=True).transform
    corners = [to_mollweide(x, y) for x in bbox[0::2] for y in bbox[1::2]]
    # GHSL tiles are 1000 km squares counted from (-18041000, 9000000) in Mollweide.
    tiles = {f"R{math.floor((9_000_000 - y) / 1e6) + 1}_C{math.floor((x + 18_041_000) / 1e6) + 1}"
             for x, y in corners}
    if len(tiles) != 1:
        raise SystemExit(f"{city} spans GHSL tiles {sorted(tiles)}; merge them before cropping")
    tile = tiles.pop()
    archive = download(GHSL_TILE_URL.format(tile=tile), RAW / "ghsl" / f"nres_2020_{tile}.zip")
    tif = next(name for name in zipfile.ZipFile(archive).namelist() if name.endswith(".tif"))

    xs, ys = zip(*corners)
    output = DATA / city / "ghsl_nres_volume_2020_100m.tif"
    output.parent.mkdir(parents=True, exist_ok=True)
    with rasterio.open(f"zip://{archive.as_posix()}!/{tif}") as src:
        window = from_bounds(min(xs), min(ys), max(xs), max(ys), src.transform).round_offsets().round_lengths()
        volume = src.read(1, window=window, masked=True)
        profile = {key: value for key, value in src.profile.items() if key not in ("tiled", "blockxsize", "blockysize")}
        profile.update(width=window.width, height=window.height, transform=src.window_transform(window), compress="deflate")
    with rasterio.open(output, "w", **profile) as dst:
        dst.write(volume.filled(profile.get("nodata") or 0), 1)
    print(f"{output.name}: {window.width}x{window.height} cells of 1 ha, "
          f"{volume.sum() / 1e6:.1f} million m³ non-residential")
    return output


def osm_buildings(city: str, bbox: tuple[float, float, float, float]) -> Path:
    pbf = download(JAVA_PBF_URL, RAW / "osm" / "java-latest.osm.pbf")
    output = DATA / city / "osm_buildings_offices.parquet"
    # Every feature tagged building=* or office=*, keeping all its tags
    # (building:levels, height, name, amenity, ...) in one map column.
    quackosm.convert_pbf_to_parquet(
        pbf,
        tags_filter={"building": True, "office": True},
        keep_all_tags=True,
        geometry_filter=box(*bbox),
        result_file_path=output,
        working_directory=RAW / "osm" / "quackosm",
    )
    print(f"{output.name}: {pq.ParquetFile(output).metadata.num_rows} features")
    return output


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("city", choices=CITIES)
    city = parser.parse_args().city
    ghsl_nres(city, CITIES[city])
    osm_buildings(city, CITIES[city])
