# Jejak routing

## Current onboarding: estimated areas, no journey service required

Onboarding now displays a local **planning reach** model directly from the selected
destination, transport mode and time limit. `app/engine/onboarding/planningReach.ts`
creates two geodesic radius bands and classifies database kecamatan center points.
Form/story, map and list share the same calculation; changing or clearing inputs
updates/removes the estimate immediately. The map no longer requests commute routes.
After exiting the preview with **Jelajahi data peta**, exploration retains the saved
profile's circles, destination pin and kilometer labels. **Lihat jangkauan** frames
both rings without resetting a manually panned map on each data response. Setup also
frames the full outer radius, instead of zooming to a destination with offscreen rings.
A fresh exploration visit frames the saved destination once, including a saved
Bandung/Surabaya plan rather than leaving it offscreen behind the default Jakarta camera.

Kecamatan fills and list-card tints share center-point bands: blue inside the inner
radius, light blue between the radii, and unhighlighted outside/unknown. Regular-map
labels/counts follow the current metro and visible budget-filtered district set.
Summary/mobility show reach fills. Other thematic lenses keep their own metric
fills; reach is indicated by district outlines and center-point dots instead.
Unavailable boundaries leave the center points and list usable; missing locations
never receive coverage labels. Highlighted polygons are an index to district centers,
not proof that all land inside those administrative boundaries is covered.

The bands are declared assumptions, not OSM network isochrones or measured city speeds:
car 10–20 km/h, motorcycle 15–30 km/h, walking 3–5 km/h, transit 8–18 km/h.
Car/motorcycle reserve two minutes for preparation/parking; transit reserves ten
minutes for access/waiting. Straight-line radii divide assumed travel distance by
detour factors 1.4, 1.2 and 1.5 respectively. These are illustrative planning ranges,
not calibrated probabilities, observed transit service, congestion or departure-time
predictions. Transit service is not implied in Bandung or Surabaya.

Only the kecamatan **center point** receives a reach label. No claim covers every
address in the kecamatan or every point inside a circle. Missing coordinates remain
unknown. This local model never populates measured commute minutes, satisfies a
commute constraint, or becomes route-evidence ranking. Existing graph-backed adapters
below remain optional infrastructure, separate from the current onboarding UI.

## Status and scope

The app integration and fixture tests do not constitute a deployed routing service.
The supplied GTFS passes local structural/reference/timing checks (8,091 stops,
240 routes, 700 trips, 753 frequency entries). This host has no Docker or osmium-tool
and had approximately 1.5 GiB available RAM. **No extracts or graphs have been built,
PBF geographic coverage is not yet verified, and real journeys are not yet tested.**

| Mode | Coverage | Timing basis |
|---|---|---|
| Car | Jakarta metro, Bandung metro, Surabaya metro | Valhalla road model; no live traffic |
| Motorcycle | Same three regions | Access-aware `motor_scooter`, 60 km/h top-speed cap; no live traffic |
| Active | Same three regions | Walking only, 4.5 km/h; not a cycling estimate |
| Public transport | Loaded TransJakarta service only | OTP 2.10 GTFS + walking, frequency waiting estimates |

Legacy `active` profiles can mean walking or cycling. Only an explicit saved
`active_mode: "walk"` can use pedestrian estimates. The form's walking choice and
grounded walking statements save that marker; generic active/cycling profiles remain
unscored for commute until the user chooses a supported specific mode.

OSM road availability is **not** transit coverage. Unsupported transit remains unknown;
road times are never substituted. Rail, Bandung transit, Surabaya transit, realtime,
fares/fuel/parking prices, and observed housing door coordinates are not supplied by
this integration. GTFS fare tables alone are not yet treated as a complete current
door-to-door tariff/transfer policy. Monetary costs remain `null`.

## Private preparation

Raw inputs remain untouched and gitignored under `ingestion/data/`:

- `java-261001.osm.pbf`: OpenStreetMap/Geofabrik, ODbL 1.0. Attribution required.
- `file_gtfs.zip`: TransJakarta. Public availability is not a verified redistribution
  license; confirm permission before distributing the feed or transit graph.

From the repository root:

```sh
bun run check:routing
bun run test:routing-data
```

These commands need only Python's standard library and do not build graphs or change
source data. Validation checks IDs/references, stop coverage, service dates, ordered
stop times (including hours after midnight), frequencies, transfer references, and
shape coordinates. It is not a replacement for the MobilityData canonical GTFS
validator; run that validator and review its notices before publishing.

On a machine with **osmium-tool** already installed:

```sh
bun run extract:routing
```

`ingestion/prepare_routing.py --extract` records SHA-256 hashes, reads PBF metadata and
data bounds, creates metro-sized extracts with surrounding roads, uses `smart` complete
ways plus restriction/multipolygon relations, checks referenced nodes, merges overlap
without duplicate objects, and stages Jakarta OSM + `transjakarta.gtfs.zip` for OTP.
Outputs and `manifest.json` stay under `ingestion/data/routing/`. No database or public
file writes. Existing generated outputs require explicit `--force`; original inputs
are never overwritten. The boxes are service limits, not administrative boundaries
or a guarantee that every enclosed point is routable.

Manifest flags `pbf_extent_checked` and `extract_references_checked` record only
extent/reference checks. `network_coverage_verified` stays false: complete ways and
a containing data extent do not prove routable coverage. Real graph journeys still
need verification in each region.

Relation completion is limited to objects present in the supplied Java extract.
Before release, review missing restriction members in the routing inputs; ordinary
`check-refs` verifies way-node completeness, not every relation member. Administrative
access rules are built from the original Java file, not clipped metro boundaries.

## Build once, serve separately

Docker/Compose installation and host changes are **not** performed by this task.
The pinned images are OTP 2.10.0 (Linux amd64 digest) and Valhalla 3.9.0 (manifest
digest). The bare Valhalla image has no automatic build/start entrypoint.

On a capable Linux/container host, after successful extraction:

```sh
docker compose -f routing/compose.yaml --profile build run --rm road-build
docker compose -f routing/compose.yaml --profile build run --rm transit-build
docker compose -f routing/compose.yaml up -d road transit
```

Build sequentially, not alongside app builds. OTP is configured with an 8 GiB heap;
allow additional RAM for the JVM/container. Osmium multi-extract relation completion
and Valhalla builds also need substantial RAM and disk. Measure actual peak usage
before selecting hosting resources; the current free memory is insufficient. The
build script refuses any existing Valhalla build directory, including partial output. Use a fresh staging directory for
a new version rather than deleting an active graph. Swap graphs and their bound
manifest atomically after smoke tests; never rebuild on a Next.js request.

Ports bind to loopback by default. A remote deployment needs private/authenticated
service networking; do not expose unauthenticated graph endpoints publicly. Valhalla's
config must retain access, turn restriction, and one-way handling. Before accepting
motorcycle routes, verify Indonesian toll/access rules and admin-country classification
against the exact deployed tiles. Highway preference is not a substitute for legality.

Copy the **values**, not the file, from `routing/env.example` into the app's private
environment. URLs refer to service roots, and input hashes must match the deployed
graph manifest. Optional snapshot dates must be supported by source metadata. Calendar
range `20040115–20271231` does not prove feed freshness. Without a URL and bound input
hashes, estimates stay unavailable. The pinned engine versions in provenance assume
you use the supplied images; different engines require updating the adapter contract.

## Shared API and recommendation flow

Authenticated `POST /api/onboarding/commute` accepts:

```json
{
  "purpose": "district_preview",
  "destination": [106.82, -6.24],
  "mode": "motorcycle",
  "departureAt": null,
  "maxMinutes": 45,
  "origins": [{ "id": "jakarta-selatan-a", "points": [[106.8, -6.25]] }],
  "selectedOriginId": "jakarta-selatan-a",
  "includeReach": true
}
```

Coordinate order is longitude/latitude. Transit requires a concrete ISO departure
with `+07:00`; the onboarding's coarse time choice is disclosed as a **next-weekday
scenario** at 07:00, 12:00, or 17:00 WIB. Flexible/unknown time does not invent a
transit departure. The API can also accept an explicitly supplied date/time.

The response includes per-origin sample outcomes, rounded low/high sampled duration,
all-leg selected-route geometry, explicit coverage/error states, source hashes and
links, missing/stale qualifiers, and road reach geometry where available. Caps:
120 groups, 1–3 probes each, 64 KiB JSON, four in-flight requests per app process,
three OTP workers per request, and a 30-second total routing deadline. Road matrix
batches have at most 50 sources. Deployments still need shared rate limiting; the
process-local guard is not a distributed quota.

Timing:

- Road: matrix origin → destination network seconds, plus **120 seconds total**
  assumed preparation/parking for car/motorcycle. Walking has no extra allowance.
  Network correlation is capped at 100 meters (not Valhalla's broad default), with
  nearest candidates preferred. This does not verify a building's door access or
  private driveway; the values remain network-probe planning estimates.
- Transit: requested departure → final arrival, including initial wait, walking,
  transfers and in-vehicle time. **No extra 1–2 minutes per stop:** GTFS stop timing
  already includes dwell. Only itineraries with an actual BUS leg count as transit.
- Meeting: use `purpose: "meeting"` with exactly two groups, one point each. Response
  `meeting` returns each traveler's full seconds and their sum; a missing traveler
  makes the sum `null`. Monetary cost remains unknown. The API supports this scenario;
  there is no new meeting-point UI or multi-mode optimizer.

`useCommutePreview` debounces and aborts requests; response keys prevent old mode,
destination, city, geometry, or departure results from replacing current evidence.
The same `evaluateLiveOnboarding` result drives form/story previews, list, map,
selection and ranking. Financial fit (`financialEligible`) is independent of overall
fit: missing/partial/stale journey evidence cannot satisfy a commute constraint.
Samples straddling the limit remain unknown; all samples over it are excluded as
**sample-based** estimates, not a statement about every home in a kecamatan.

Road reachable polygons use Valhalla `reverse: true`, subtract the same endpoint
allowance, and retain holes/disconnected pieces. They represent origins able to reach
the destination, not travel outward from it. Polygon generalization is approximate;
every enclosed point is not guaranteed access. Transit reach is sampled points only,
not a road polygon or invented circle. Each selected route represents one probe.
Boundary-less districts use one labeled centroid; other districts use up to three
interior probes. These are not observed addresses or district-wide commute bounds.

Upstream query caching is private, process-local, bounded (128 entries, five minutes),
and keyed by graph/input versions and request values. Personal coordinates are never
logged or persisted; client API responses are `private, no-store`.

## Release verification still required

1. Run the canonical GTFS validator; verify licensing and source snapshot dates.
2. Run extraction and inspect PBF bounds, restriction completeness, and the manifest.
3. Build graphs; check the pinned OTP GraphiQL schema at `/graphiql` and server startup.
4. Test representative journeys in **each** region, all road modes, one-way/asymmetric
   routing, legally forbidden scooter roads, disconnected origins and boundary edges.
5. Test TransJakarta walks, waits, transfers, frequency trips, inactive service dates,
   and empty itineraries. Ensure no Jakarta rail route is implied.
6. Measure resource/latency/cache behavior, source expiry, and distributed rate limits.
7. Re-run unit, data/schema and desktop/mobile E2E suites against the deployed adapters.

After configuring real services and the extracted manifest, `bun run smoke:routing`
checks matrix, route and reverse reach for each road mode in all three regions.
For transit, set `JEJAK_ROUTING_SMOKE_DEPARTURE` to a known active service scenario
(ISO datetime with `+07:00`). This script fails on absent inputs/services and never
manufactures a passing route. It has **not** been run against real routers here.

Local fixtures validate contracts and UI behavior, not real-world travel accuracy.

Official references: [OTP 2.10 schema](https://raw.githubusercontent.com/opentripplanner/OpenTripPlanner/v2.10.0/application/src/main/resources/org/opentripplanner/apis/gtfs/schema.graphqls),
[OTP containers](https://docs.opentripplanner.org/en/v2.10.0/Container-Image/),
[Valhalla matrix](https://valhalla.github.io/valhalla/api/matrix/),
[Valhalla reach](https://valhalla.github.io/valhalla/api/isochrone/),
[Valhalla builds](https://valhalla.github.io/valhalla/start/building/),
[Osmium extracts](https://osmcode.org/osmium-tool/manual.html#9-creating-geographic-extracts).
