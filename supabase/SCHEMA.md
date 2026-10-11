# Jejak database schema

Prepared facts, private enrichment evidence,
public aggregates, user decisions, subscriptions, and anonymous interaction
telemetry have separate responsibilities.

Migrations `0001`–`0009` have been applied to the linked Supabase project.
Subsequent changes are additive migrations; do not edit previously applied SQL.

## Design in one page

```text
Prepared datasets                  Zone evidence discovery
       |                                  |
sheet-shaped static tables         backend validation + geocoding
       |                                  |
regions / places / region_data     zone_evidence_cache
       |                                     |
       +---------------+---------------------+
                       |
              backend aggregation
                       |
               region_snapshots --------> public map RPCs

auth.users -> relocation_profiles -> recommendation_runs
     |                                      |
     +--------------> shortlist_items <-----+
     |
     +--> subscriptions <-- subscription_plans
```

- **Prepared data:** official statistics, institution identities, campus locations,
  and enrollment arrive through scheduled ETL in tables matching the research-sheet
  columns, not user-triggered LLM calls. The map API presents those wide rows as
  metric facts while retaining provenance and dimensions.
- **Dynamic data:** openings, listings, office presence, and local employment use
  a private cache. Zone evidence discovery finds candidates; the backend validates and writes.
- **Public data:** browsers receive prepared facts, public places, and aggregate
  snapshots. They cannot read private company evidence or execute write RPCs.
- **Geography:** trusted datasets provide boundaries. The ingestion service
  classifies evidence after geocoding. Unknown locality is never assumed local.
- **Samples:** `is_sample = true` rows never satisfy cache counts or public fact
  reads. The aggregation worker must also exclude them from snapshot inputs.
- **IDs:** regions and institutions use integer identities. New transactional
  tables and places use `bigint generated always as identity`, capped at
  `9007199254740991` so JSON IDs remain exact in JavaScript. Omit IDs on insert.
  Auth users and the existing evidence-cache primary key retain UUIDs.

There is no custom random-ID generator, retry-counter table, or generic entity
framework. SQL files are the authoritative column definitions.

## Tables

### 1. `regions`

Canonical geographic hierarchy and trusted boundaries.

| Fields | Meaning |
|---|---|
| `id`, `parent_id` | Integer identity and parent region FK |
| `region_code`, `region_name`, `region_type` | Workbook key, display name, geographic level |
| `parent_region_code`, `kemendagri_code`, `bps_code` | Workbook parent and official administrative codes |
| `geometry` | Nullable `MultiPolygon` in WGS84 / SRID 4326 |
| `source_name`, `source_updated_at` | Boundary provenance |
| `source_url`, `source_urls`, `code_source_name`, `code_source_url` | Research citations and separate official-code provenance |
| `is_supported`, `created_at`, `updated_at` | Product coverage and audit fields |

Types: country, province, regency, city, district, neighborhood, grid, metro.
The geometry has a GiST index. Missing geometry stays missing; no model invents it.
`region_code`, `region_name`, and `source_name` are synchronized with the legacy
`code`, `name`, and `source` columns for compatibility with existing database
functions. Workbook imports use the sheet-facing names. `parent_region_code` is
the spreadsheet relationship and is kept in sync with the internal `parent_id`.

The synthetic H3 heatmap cells and their housing/employment facts were removed
by `20260928161244`. District boundaries and the grid read contract remain
available without a fabricated thematic value.

### 2. `institutions`

Canonical universities, polytechnics, schools, training providers, and other
education institutions. Identity is separate from a physical campus.

Fields include the sheet columns `institution_code`, `institution_name`,
`institution_type`, `website`, `source_name`, `source_url`, and `is_active`, plus
internal identity/timestamp fields. The legacy `code`, `name`, and `source`
columns stay synchronized for existing functions.

The research import allows `is_active = NULL` for unknown activity rather
than asserting that an unverified institution is active.

### 3. `places`

Public point features: campuses, transit stops, stations, hospitals, public
facilities, and other public places. Private company offices stay in the cache.

Fields include `id`, `region_id`, optional `institution_id`, `name`, `category`,
latitude/longitude, address, website, phone, operator, source/source URL,
`observed_at`, `is_active`, and timestamps. Optional `osm_type` + `osm_id` form a
unique OSM identity; `osm_tags` stores its metadata.

Coordinates are required and range-checked. Only a campus can reference an
institution. The `(id, institution_id)` key supports ownership checks for facts.

### 4. Sheet-shaped static datasets

The workbook's statistical sheets each have a matching wide table, with the same
lowercase snake-case data columns and date/numeric types:

| Sheet/table | Distinguishing fields |
|---|---|
| `population` | Population, age, household, and density measures |
| `labor_force` | Labor force, employment, unemployment, participation, sample size |
| `sector_employment` | `kbli_2020_code`, employment count, employment percentage |
| `wages_income` | Wage, minimum-wage, household-income, expenditure measures |
| `education_facilities` | School, university, polytechnic, and training counts |
| `healthcare_facilities` | Hospital, clinic, pharmacy, and bed counts |
| `transport_infrastructure` | Stop, station, airport, port, and road measures |
| `housing_statistics` | `housing_type`, rent range, observation count, price index |
| `cost_of_living` | Food, utility, transport, connectivity, CPI, and inflation measures |
| `student_enrollment` | Institution/campus/program scope, metric, student count, academic year |
| `campuses`, `public_places` | Sheet-facing names, region/institution codes, OSM identity and provenance |
| `sector_mapping` | KBLI-to-Jejak sector reference mapping |
| `geospatial_sources` | Source files, CRS, resolution, coverage, and license |
| `estimation_parameters` | Named low/high ETL parameters and provenance |

Each table retains the sheet's source, time period, evidence, confidence,
limitations, and sample fields where specified. Internal `id` columns and indexes
support safe relationships and idempotent imports; they are not workbook fields.
Repeat-import indexes include the region/institution, period, source, and relevant
row dimension such as housing type or KBLI code.
The research import extends program identity to the source program name
when no official program code exists, supports broad KBLI groups up to 64
characters, and uses institution plus campus name for non-OSM campus imports.
It preserves unknown public-place names as `NULL`; public RPCs return an explicit
unnamed-category label and include neighborhood points under their parent district
without assigning city-only points to a kecamatan.
Every varchar `source`/`source_name` label supports 255 characters, and reviewed
read RPCs return full labels without truncating them.

`private.static_region_facts` turns these rows into metric/value facts for the
existing map RPCs. Housing metrics preserve housing type (the `kos` metric keeps
the current base metric name); sector facts include their KBLI section. New
campus/public-place rows are also included in the reviewed public-place/map reads.

### Static research import (applied 2026-10-01)

`living_cost_rates` and `monthly_budgets` are separate estimated-scenario tables,
not observed cost distributions. They preserve tier, person count, assumptions
and limitations, retrieval/as-of date, method version, and structured citations.
Totals are constrained, and monthly budgets reference their living-cost scenario.
They have RLS and service-role-only access and are not added to the observed-fact
view or public cost RPCs.

`private.static_import_batches` and `private.static_import_rows` retain workbook
hash/version, original sheet/row identities, raw cells, transformed payloads,
formula strings, issues, and prepared/review/baseline status. Both are private,
RLS-enabled and service-role-only. The authorized `static-research-v1-baseline`
import promoted all 11,403 data rows: 11,196 prepared plus 207 flagged baselines.
Mixed-source shared periods remain unknown; housing aggregates remain derived.
Structural/key/formula errors still block promotion. `unclassified_area` is
allowed only when unsupported, without geometry or official codes.
Existing region IDs, boundaries, and boundary
provenance survive the generated upserts.

See [Static data import preparation](../docs/Static_Data_Import_Preparation.md)
for the local workflow, source-quality caveats, backup and hosted verification.

### 5. `region_data`

Legacy/runtime regional facts in a tall format: **one metric per row**. It remains
the import target for ETL-generated grid-cell facts and for existing application
data; workbook statistics now go to their sheet-shaped tables above.

| Fields | Meaning |
|---|---|
| `id`, `region_id`, `metric` | Fact identity, region, metric code |
| `numeric_value`, `text_value`, `json_value`, `unit` | Exactly one value for available evidence |
| `evidence_type` | `observed`, `estimated`, `derived`, or `unavailable` |
| `period_start`, `period_end` | Period described by the fact |
| `source`, `source_url`, `published_at`, `retrieved_at` | Provenance |
| `sample_size`, `confidence`, `limitations`, `is_sample` | Evidence quality |
| `created_at`, `updated_at` | Audit fields |

An `unavailable` fact has no value. Public reads return non-sample releases with
their periods; consumers must select a consistent release, not sum history.
Imports can be repeated using the unique key
`(region_id, metric, period_start, period_end, source) NULLS NOT DISTINCT`.
An upsert refreshes one source/period without replacing different releases or
sources. The layer RPC orders period, publication, retrieval, then ID when
selecting the latest row.

### 6. `institution_data`

Legacy versioned institution, campus, and program facts. New workbook enrollment
rows are stored in `student_enrollment`. This table uses the one-value rule,
period/provenance fields, confidence, limitations, and sample marker as regional
facts, plus `institution_id`, `campus_place_id`, `data_scope`, and `academic_year`.

- `campus` scope requires a campus belonging to this institution.
- `institution` and `unknown` scope must not specify a campus.
- `program` scope may optionally identify a campus.
- A referenced campus cannot be deleted and silently detach its facts.

Examples: enrolled students, active students, new intake, graduates, international
students, and program enrollment. Insert new releases rather than overwrite old
years. Institution totals are never copied into every campus.

### 7. `evidence_cache_policies`

One policy per dynamic evidence type. Counts mean **accepted evidence records**,
not workers, vacancies, or people.

| Type | Required | Target | Refresh after | Expire after |
|---|---:|---:|---:|---:|
| `active_opening` | 25 | 25 | 24 hours | 72 hours |
| `kos_listing` | 15 | 25 | 5 days | 7 days |
| `apartment_listing` | 15 | 25 | 5 days | 7 days |
| `house_listing` | 15 | 25 | 5 days | 7 days |
| `office_presence` | 15 | 25 | 21 days | 30 days |
| `local_employment` | 25 | 25 | 21 days | 30 days |
| `salary_observation` | 5 | 25 | 21 days | 30 days |

Other fields: `max_sources_per_run` (8 since `20260928120000`), `retry_after_minutes`
(0 for every type: users trigger runs from prompts, so a failed or partial run never
blocks the next request; a policy may opt back into a cooldown), and `updated_at`.
Enrollment belongs in prepared `student_enrollment` rows, not this cache.

### 8. `zone_evidence_cache`

Private dynamic evidence, unique by `(region_id, scope_hash, dedup_hash)`.
The backend canonicalizes `scope_key` and hashes it; evidence type and filters
must be included. Different occupations, sectors, or housing types cannot share
unrelated evidence just because the requested zone matches.

| Fields | Meaning |
|---|---|
| `id` | Existing UUID primary key |
| `region_id`, `evidence_type`, `scope_key`, `scope_hash`, `dedup_hash` | Exact requested scope and candidate identity |
| `entity_name`, `value`, `canonical_url`, `source`, `publisher`, `content_hash` | Private evidence and provenance |
| `latitude`, `longitude`, `geographic_precision`, `locality_tier` | Resolved location and relevance to the requested region |
| `confidence`, `validation_status`, `is_sample` | Validation outcome |
| `run_id`, `first_seen_at`, `last_seen_at`, `retrieved_at` | Ingestion history |
| `refresh_after`, `expires_at` | Soft and hard freshness boundaries |

Statuses: candidate, accepted, rejected, expired, overflow. Missing status defaults
to **candidate**. Acceptance must be explicit and requires both coordinates,
known precision, and a locality tier. Coordinates must be supplied together.

Locality order is **zone → city → region → national**, followed by precision and
confidence. Both reads and target-cap selection use that order. Global evidence
is not an allowed tier. The backend verifies geographic membership; SQL checks
that the required classification fields exist.

Legacy columns from `0001` remain: `zone_id`, `claim_type`, `normalized_value`,
`raw_name`, `raw_text`, `raw_address`, `precision`, `scope`,
`extractor_confidence`, `model_id`, `legacy_run_id`, `created_at`, and generated
`dedup_key`. The new writer maintains compatibility fields it can populate.
Legacy rows without normalized scope fields cannot satisfy new cache counts.

### 9. `enrichment_runs`

One zone evidence discovery attempt for one region/type/scope. Fields include an identity `id`, UUID
`external_run_id`, scope fields, count/budget at claim time, `status`, `stage`,
structured `input`/`output`, private `error`, request/start/completion timestamps,
`lease_expires_at`, `next_retry_at`, and audit timestamps.

Statuses: queued, running, partial, completed, failed, cancelled. A partial unique
index permits only one queued/running run for a scope. An advisory transaction
lock coordinates claim, evidence writes, and completion.

Every expired or missing lease becomes a failed run with the normal policy
cooldown. There is no attempt counter that can reset accidentally on replacement.

### 10. `region_snapshots`

Versioned public aggregates for `(region_id, snapshot_type, scope_hash)`.

Fields: identity `id`, scope fields, `snapshot` JSON, `evidence_count`,
`contributor_count`, `coverage`, `confidence`, `generated_at`, `refresh_after`,
`expires_at`, `status`, `is_current`, and `previous_snapshot_id`.

Only one accepted current snapshot exists per scope. Publication accepts drafts
and cannot replace a newer current snapshot with an older one. Failed refreshes
preserve the last accepted snapshot. The read RPC returns explicit `is_stale`
and `is_expired` flags so expired fallbacks can be labeled correctly.

#### Public JSON contract

A table constraint rejects unknown keys and arbitrary nested evidence, including
on direct backend inserts. Allowed fields:

| Keys | Value |
|---|---|
| `observed_office_count`, `offices_with_local_headcount_evidence`, `sources_monitored`, `opening_count`, `housing_count` | Nonnegative integer |
| `observed_organizations`, `organizations_without_headcount` | Nonnegative integer |
| `estimated_employment`, `monthly_rent_idr`, `salary_idr` | Range object described below |
| `as_of` | `YYYY-MM-DD` string |
| `oldest_material_evidence` | `YYYY-MM-DD` string |
| `coverage` | `complete`, `partial`, or `unavailable` |
| `confidence` | Number from 0 to 1 |
| `limitations` | Array of explanatory strings |

Ranges are `{minimum, maximum, status}` with nonnegative ordered bounds and
status `observed` or `estimated`. Unavailable ranges are `{status: "unavailable"}`
without bounds. Any employment range requires at least three contributors,
regardless of snapshot type.
An available `estimated_employment` range may also include a short lowercase
`method_version` identifier; other ranges and unavailable values may not.
Indices such as sector presence and hiring activity are **not stored here**:
the API calculates documented, deterministic comparisons across the returned
cells and leaves missing evidence as unavailable, not zero.

```json
{
  "observed_office_count": 14,
  "estimated_employment": {"minimum": 450, "maximum": 780, "status": "estimated"},
  "as_of": "2026-09-25",
  "limitations": ["Local headcount evidence covers only six offices."]
}
```

The backend must count distinct offices, exclude sample evidence, round ranges,
and keep identifying information out of prose. Office presence alone does not
support employment estimates. National/global headcount is not local headcount.
Extend this explicit contract when adding a new aggregate.

### 11. `relocation_profiles`

Fields: identity `id`, `user_id`, `profile_name`, `revision`, `profile` JSON,
`confirmed`, `confirmed_at`, `created_at`, `updated_at`.

`(user_id, profile_name, revision)` is unique. A confirmed revision is immutable;
refinement inserts another revision. The backend validates the profile JSON.
Users can read their own revisions; backend operations handle writes/deletion.

### 12. `recommendation_runs`

Fields: identity `id`, UUID `external_request_id`, `user_id`, `profile_id`,
`scoring_version`, `status`, `results`, optional `explanation`, `created_at`,
`completed_at`.

A recommendation requires a confirmed profile owned by the same user. Results
come from deterministic scoring; AI explanations do not change arithmetic. Users
can read their own runs. Auth account deletion cascades through profiles and runs.

### 13. `shortlist_items`

Fields: identity `id`, `user_id`, `region_id`, optional `recommendation_run_id`,
`note`, `created_at`.

One saved region per user, enforced by `(user_id, region_id)`. A composite FK
ensures any linked recommendation has the same owner, including backend writes.
Deleting a recommendation clears only that reference, preserving the saved item.
Authenticated users can create/read/update/delete their own items and omit IDs
on insert. The RLS policy needs only the ownership predicate.

### 14. `hci_click_events`

Append-only alpha click telemetry from `instrumentation-client.ts` through
`POST /api/hci`. Fields: identity `id`, random per-tab `session_id`, optional
`?study=` `participant`, `elapsed_ms` since session start, `region` (from the
nearest `data-hci-region`), `target` (the control's accessible label, never an
input value), viewport-fraction `x`/`y` (null for keyboard), viewport size,
`paint_ms` (click to next frame), `response_ms` (click through completion of
its explicitly registered work and result frame; equals `paint_ms` for clicks
without async work, null on cancellation or a 30 s timeout), and `received_at`.
Zone selection and retry register their work with the originating click;
unrelated loading and background preloads do not extend its response time.

Sessions are not linked to `auth.users`. CHECK constraints mirror the API
validation because the anon key can insert directly. Browsers can insert but
never read. `hci_region_summary` (security invoker, no browser grants) reports
clicks, share, clicks per active minute, and p50/p90 paint and response times
per region. The existing `response_timeouts` count includes all null responses,
including cancelled interactions.

### 15. `subscription_plans`

Fields: integer identity `id`, unique `code`, `name`, `billing_interval`
(`month`/`year`), `price_amount` in major units, `currency` (default `IDR`),
`features` JSON object of entitlements, `is_active`, `created_at`, `updated_at`.

Anyone can read the catalog, including retired plans that existing subscribers
still reference; a pricing page filters on `is_active`. Only the backend writes.

### 16. `subscriptions`

Fields: identity `id`, `user_id`, `plan_id`, `status`, `current_period_start`,
optional `current_period_end` (null means no end), `cancel_at_period_end`,
`canceled_at`, optional `provider`, `provider_customer_id`,
`provider_subscription_id`, `created_at`, `updated_at`.

Provider-neutral: the backend maps provider webhook states to `incomplete`,
`trialing`, `active`, `past_due`, `canceled`, or `expired` and upserts on the
unique `(provider, provider_subscription_id)`. Manual grants leave the provider
fields null. A partial unique index allows one `trialing`/`active`/`past_due`
row per user; ended rows remain as history. Users can read their own rows;
only the backend writes. Account deletion cascades.

`get_my_subscription()` returns the caller's current subscription with its plan
code, name, and features, or no rows for the free tier. `past_due` keeps access
while the provider retries. A lapsed `current_period_end` ends access even if a
renewal webhook was missed.

### 17. `geocode_cache`

Backend-only cache of geocoder responses for discovered candidate addresses, keyed by
`query_hash` (SHA-256 of provider, country, viewbox, and normalized query).
Fields: `query`, `provider`, `status` (`found`/`not_found`), `result` JSON (required
exactly when found), `fetched_at`, `expires_at`. Nominatim's usage policy requires
caching; misses are cached for 7 days and hits for 90. RLS is on with no policies;
only `service_role` can read or write.

## Dynamic request lifecycle

1. The backend resolves the region and canonicalizes evidence type and filters.
2. Call `check_and_claim_zone_enrichment()`.
   - Enough fresh evidence: `cache_hit`, no discovery call.
   - Active run: `refresh_running`, no duplicate call.
   - Failed/partial cooldown: `retry_cooldown`, no new call.
   - Missing/stale evidence: claim one queued run, return the discovery flag (`call_lf01 = true`, retained as a deployed RPC field).
3. Read existing evidence if preparing a refresh, then call zone evidence discovery once.
4. Validate and geocode its candidates, classify them with
   `classify_evidence_points()`, and explicitly accept eligible records through
   `upsert_zone_evidence()`.
5. Build a public aggregate and publish it with `publish_region_snapshot()`.
6. Call `complete_enrichment_run()`; use `partial` if requested work is incomplete.

```text
missing_count = max(target_count - live_count, 0)
refresh_count = accepted live rows past the soft freshness boundary
needed_count = min(target_count, missing_count + refresh_count)
source_budget = min(max_sources_per_run, max(1, ceil(needed_count / 4)))
```

A full cache of 25 stale rows requests 25 revalidations, not zero new records.
Accepted rows beyond the target become overflow. Hard-expired evidence does not
count. Explicit closure evidence can expire an observation immediately; failure
to rediscover it is not closure evidence.

Upsert and completion re-check status and lease **under the scope lock**. Expired
or terminal workers cannot write. Repeating the same terminal completion is a
no-op; changing it to another terminal state is rejected.

### Zone evidence discovery integration

The checked-in `Jejak Prepared Request` adapter replaces the old database reader
without changing its node/class identity. It carries backend-provided
`zone_stats`, `db_satisfied`, and `missing_evidence` through, has no Supabase
credentials, and never calls the retired `get_zone_data` RPC. Prepared population
or wage statistics do not satisfy a dynamic office/headcount evidence request.

The application must invoke zone evidence discovery only after a successful backend claim. The
backend maps policy names such as `active_opening` to the flow's request vocabulary
such as `active_openings`. Deploy the updated flow export with that orchestration.
`POST /api/zones/[zoneId]/enrich` implements this orchestration
(`app/engine/enrichment/pipeline.ts`); a live Langflow deployment remains
separate work.

## Access and RPCs

| Objects | Browser access | Backend access |
|---|---|---|
| Regions, places, institutions, prepared facts | Public read RPCs only | CRUD |
| Cache policies, evidence, enrichment runs | None | Tables and backend RPCs |
| Snapshots | Public read RPC only | Tables and publication RPC |
| Profiles and recommendations | Own rows, read-only | CRUD |
| Shortlists | Own rows, CRUD | CRUD |
| Subscription plans | Read | CRUD |
| Subscriptions | Own rows, read-only | CRUD |
| Click telemetry | Insert only | Dashboard reads |
| Legacy prototype tables/RPCs | None | Compatibility only |

All active tables have RLS. Browser ownership policies use
`(select auth.uid()) = user_id`. Backend RPCs explicitly revoke execution from
`PUBLIC`, `anon`, and `authenticated`; granting `service_role` alone is not enough.
New function defaults are private for the migration role.

**Public read RPCs** (also available to `service_role`):

- `get_region_layer(integer, varchar, varchar, text, varchar)` — direct supported
  children of a parent, filtered optionally by region type; GeoJSON for trusted
  boundaries, latest non-sample prepared metric, and current accepted snapshot
  for an exact type/hash. A missing boundary, metric, or snapshot is `null`.
  Passing only one of snapshot type/hash is rejected. This is one batch request
   for a district/grid layer, not one call per cell. It returns source, period,
   limitations, coverage, and freshness needed for a trustworthy legend.
- `get_map_cells(text, text[], boolean)` — returns grid cells and available facts
  for a district. With mock rows removed it returns an empty list until verified
  data is imported.
- `get_region_snapshot(integer, varchar, text)`
- `get_region_data(integer, varchar)`
- `get_public_places(integer, varchar)`
- `get_institution_data(integer, bigint)` — legacy institution facts plus new
  enrollment rows, including program code/name.

The map-region/detail/layer reads also include static sheet-backed rows. Returned
facts retain their sheet metric, evidence/provenance fields, and optional
`dimension_key`/`dimension_value` for KBLI sections and housing types.

**Authenticated RPC** (invoker rights, limited by RLS to the caller):

- `get_my_subscription()`

**Backend-only RPCs:**

- `check_and_claim_zone_enrichment(integer, varchar, varchar, text)`
- `get_zone_evidence(integer, varchar, text, integer)`
- `upsert_zone_evidence(bigint, jsonb)`
- `complete_enrichment_run(bigint, varchar, jsonb, text)`
- `publish_region_snapshot(bigint)`
- `zone_evidence_gc()`
- `calculate_relocation_fit(...)`
- `get_evidence_clusters(varchar, text[], boolean)` — accepted, unexpired evidence
  under a parent city counted per district for map clusters: only points placed at
  district precision or finer, binned by trusted district boundaries, one row per
  (district, evidence type), each claim counted once by `dedup_hash`. Counts only;
  `GET /api/evidence/clusters` is the public gateway and labels them as approximate.
- `classify_evidence_points(integer, jsonb)` — locality tier of geocoded points
  against trusted district boundaries: `zone` (inside the target district),
  `city` (a sibling district), `region` (same grandparent), or null when no
  boundary decides; the backend then falls back to geocoder address fields.

Definer RPCs use an empty search path and qualified relations. Public functions
never read the private cache. The legacy `get_zone_data`, cache upsert/read
signatures, and housing aggregate function are retired from browser access;
they are not the new write/read path.

## Migrations and verification

| Migration | Responsibility |
|---|---|
| `0001`–`0004` | Applied prototype history |
| `0005` | Extensions, private function defaults, timestamps, legacy hardening |
| `0006` | Geographic/education catalog and prepared facts |
| `0007` | Cache policy, evidence, claim/upsert/completion lifecycle |
| `0008` | Public aggregates, confirmed profiles, recommendations, shortlists |
| `0009` | Explicit privileges, RLS, public read RPCs |
| `20260925194332` | Batch heatmap read, repeatable regional imports, aggregate fields for the map |
| `20260925194645` | Correct aggregate date validation after remote deployment |
| `20260926073400` | `regions.is_sample`, sample-aware map region reads (`get_map_regions`, `get_map_region`) |
| `20260926075100` | Wage-to-rent ranking columns in `get_map_regions` |
| `20260926084200` | `get_map_regions` with an optional parent (full catalogue) |
| `20260926112145` | Anonymous click telemetry table and region summary view |
| `20260926194550` | Synthetic heatmap point table (superseded by `20260927032800`) |
| `20260926225056` | Subscription plans, user subscriptions, and `get_my_subscription()` |
| `20260927032800` | Drops the heatmap point table; `get_map_cells()` for H3 cell heatmaps |
| `20260927121326` | Idempotently restores click telemetry and subscription objects |
| `20260928100000` | `salary_observation` cache policy, `geocode_cache`, `classify_evidence_points()` |
| `20260928120000` | Zero retry cooldown and 8 sources per run for every cache policy; lifts recorded cooldowns |
| `20260928140000` | `get_evidence_clusters()` backend-only per-district evidence counts |
| `20260928161244` | Remove synthetic grids, mock district facts and housing observations |
| `20260928161436` | Preserve/restore `get_map_cells()` after remote cleanup |
| `20260930120000` | Sheet-shaped static data tables, catalog sheet columns, and static-data API reads |
| `20260930130000` | Widen source labels to `varchar(255)` and retain full names through read RPCs |
| `20261001100106` | Research identities/unknowns, structured citations, private audit, estimated scenarios, safe unclassified features and district child-place reads; authorized all-row baseline imported separately from the schema-only file |

The three `202609260...` files were renamed from `20260926_*`, which sorted after
every later `20260926hhmmss_*` file and shared one version. If the hosted project
recorded them under other versions, align the names with `supabase migration list`
(or `supabase migration repair`) before the next push.

Each draft migration is transactional and takes the same schema advisory lock.
Cache operations lock the exact enrichment scope; publication locks its snapshot
scope. Unique indexes remain the final duplicate/current-row safeguards.

From the repository root:

```powershell
bun run test:schema
```

Pinned PGlite and PostGIS packages execute every migration **without SQL
substitutions** in isolated in-memory PostgreSQL. The harness bootstraps only
Supabase roles and the Auth objects used here. No remote credentials are needed.

Tests cover migration validity, browser/backend permissions, RLS, default IDs,
confirmed revisions, ownership, duplicate claims, sample exclusion, locality
ranking, refresh work, expired-worker rejection/cooldowns, campus integrity,
snapshot validation, a batch of 85 generic child regions with scoped aggregates,
idempotent fact imports, subscription ownership and current-subscription rules,
stored region boundaries, and account deletion.

PGlite is single-connection: duplicate-claim tests verify sequential behavior,
not real multi-session contention. Hosted PostgREST and the real map adapter
still need integration verification.
