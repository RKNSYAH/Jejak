#!/bin/sh
set -eu
test -s /data/road-network.osm.pbf
test -s /data/source-java.osm.pbf
test ! -e /data/valhalla || { echo 'Existing build directory: use a fresh generated directory for a rebuild.' >&2; exit 1; }
mkdir -p /data/valhalla/tiles
valhalla_build_config --mjolnir-tile-dir /data/valhalla/tiles --mjolnir-admin /data/valhalla/admins.sqlite --mjolnir-timezone /data/valhalla/timezones.sqlite --mjolnir-concurrency 1 > /data/valhalla/valhalla.json
valhalla_build_timezones > /data/valhalla/timezones.sqlite
# Use the uncut source for administrative/country access rules, not clipped boundaries.
valhalla_build_admins -c /data/valhalla/valhalla.json /data/source-java.osm.pbf
valhalla_build_tiles -c /data/valhalla/valhalla.json /data/road-network.osm.pbf
