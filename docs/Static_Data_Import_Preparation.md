# Static research import preparation

## Current status

### Housing expansion refresh: 2026-10-08

The user authorized another push of the updated workbook. The housing-only
refresh is **committed and reconciled** on
`https://zucvrejoloiuxpaotedt.supabase.co`.

- Source: `../outputs/01a0f5ae-03b7-7221-8db1-5712fc57628c/Jejak_Static_Data_Research_Completed.xlsx`.
  It is not in `public/` and was not copied there. SHA-256:
  `446e80d7a181e8c3d72fd0e97ec3c04c49364a0ea7758bdc5dec39e85ed63a19`.
- Compared with the October 2 promoted snapshot, housing adds **36 kos rows**
  for 36 previously uncovered districts, retrieved October 8. The existing 77
  housing rows and all other data sheets are unchanged; the quality-audit tab
  also changed but is not a destination table.
- `public.housing_statistics` now has **113 rows**. All 113 scoped payloads
  reconcile exactly; all original 77 full rows and IDs are unchanged. All 16
  other contract/reference table fingerprints are unchanged, including regions,
  boundaries, education, verified enrollment corrections and cost scenarios.
- All housing rows remain derived static baselines with unknown observation
  periods and retained source limitations. No dates, prices or geographic
  identities were fabricated. No schema migration, scenario recalculation,
  evidence discovery or application UI changes were performed.
- Fresh backup and eight local verification checks passed: exact snapshot
  restoration, changed-data guard, late-failure rollback, payload reconciliation,
  ID retention, repeat import, recovery approval and scoped recovery. The exact
  recovery SQL bound to the hosted result also passed local restoration.
- Hosted public RPC checks verified all **36 newly covered districts** and
  **144 rent metrics**, including values, provenance, derived evidence status,
  unknown periods and baseline caveats. Scenario browser access returned 401;
  private audit access returned 406. UI was not tested; enrichment was not run.
- Preparation tests: 18 passed. ESLint passed for the changed refresh runner.

Private artifacts are in
`ingestion/data/prepared/static_research_refresh_446e80d7a181/scoped/refresh-backup/`.
The October 2 manifest is the explicit predecessor; its hash is pinned in the
fresh backup. Historical backups were not overwritten. `restore-data.sql`
requires separate approval and unchanged hosted housing fingerprints, restores
only housing data, and retains audit/history. It was not run remotely and is
not a full project/Auth/Storage backup. Sequence increments are not rewound.

`ingestion/refresh_static_research.mjs` now accepts optional predecessor-manifest
and source-workbook paths after its existing four arguments. It takes scope
from the prepared manifest, restricted to education/housing, verifies source
and archived workbook hashes, and pins the predecessor hash before promotion.
Execution remains `backup`, `verify`, `promote`, then `reconcile`; `checkRows()`
verifies results and `restoreSql()` generates the tested, guarded recovery file.
This refresh confirmed original rows were unchanged and new rows were appended;
the runner still rejects reordered/deleted predecessor rows rather than guessing
their correspondence.

### Education and housing refresh: 2026-10-02

The user supplied an updated workbook and authorized re-pushing sheet
`09_education_facilities` and `13_housing_statistics`. The scoped refresh is
**committed and reconciled** on `https://zucvrejoloiuxpaotedt.supabase.co`.
The updated workbook SHA-256 is
`158503212de2d5f4164bb12143a6b2abae206dcf94977ac43e7a335dd1ff0a75`.

- Education: 21 existing workbook rows changed, six added; destination now has
  **86 rows**. Housing: all 77 workbook rows changed; destination still has
  **77 rows**. The quality-audit tab also changed; it is not a destination table.
- The refresh staged **163 scoped rows**, including 83 accepted baselines
  (77 housing and six new education rows), under `static-research-v1-baseline`.
  Original cells and all citations remain in private staging. Housing remains
  derived with unknown observation periods; retrieval dates are not periods.
- All **157 existing destination IDs** survived. Source names are part of SQL
  uniqueness, so the refresh updates matched prior IDs before upserting rather
  than retaining stale duplicates with old source labels.
- All 15 other contract/reference tables have exactly unchanged row fingerprints,
  including all 689 regions, boundaries/provenance, enrollment corrections and
  both 32-row cost-scenario tables. No schema migration, zone evidence discovery run, UI changes,
  or scenario recalculation was part of this refresh.
- Preflight found a live edit to Pancoran's old kos row: median 2,200,000,
  average 1,950,000 and maximum 4,500,000 IDR, compared with the previous workbook's
  500,000 for each field. Those exact live edits were reviewed and backed up;
  the user's new kos values are median 1,600,000, average 1,679,857 and maximum
  3,918,000 IDR. Unexpected additional live edits would block backup.
- Local verification passed exact live snapshot restoration, changed-data guard,
  late-failure rollback, payload reconciliation, ID preservation, repeat import,
  recovery approval and scoped recovery. The exact hosted recovery artifact was
  also tested locally after reconciliation. Sequence increments are not rewound.
- All 163 live payloads match preparation. Public RPC checks passed eight parent
  district lists and four updated district reads (33 updated metric/source checks).
  Scenario and private-audit browser access remain denied. Application UI was
  not tested and enrichment was not triggered.
- Preparation tests: 18 passed; schema tests: 30 passed. TypeScript passed. Lint had no errors; one
  unrelated unused-variable warning remains in `RelocationOnboarding.tsx`.

Private artifacts and scoped recovery live in
`ingestion/data/prepared/static_research_refresh_158503212de2/scoped/refresh-backup/`.
`backup.json` captures actual pre-refresh rows, reviewed drift and all table
fingerprints; `verification.json` pins the tested backup/promotion hashes;
`remote-verification.json` records reconciliation; `hosted-api-verification.json`
records updated public facts. `restore-data.sql` requires separate explicit
approval and unchanged post-refresh scoped fingerprints. It restores only the
two destination tables, retaining import audit/history; it is not a project,
Auth, Storage or physical backup. It was **not run remotely**.

Implementation order:

1. `scope_manifest()` in `ingestion/prepare_static_research.py` validates the
   whole workbook first, then filters selected rows and recomputes scoped report
   counts. `--scope education_facilities housing_statistics` prevents unrelated
   tables from being included in the compiled import.
2. `ingestion/refresh_static_research.mjs backup` matches previous workbook
   identities to live IDs, captures actual rows and rejects unreviewed live drift.
3. `verify` restores live rows locally and tests the exact transaction envelope.
   `promote` checks project/workbook/artifact hashes, locks and checks table
   fingerprints, updates existing IDs, then stages/upserts in one transaction.
4. `reconcile` compares every scoped field, checks untouched tables and ID
   preservation, and tests a recovery file bound to the actual hosted result.

For this promotion, the refresh runner used the original approved manifest and
the two-table scope; it was not an automatic arbitrary future-workbook uploader.
Do not rerun the initial-load promotion runner or overwrite its historical
backup. Future refreshes need a new artifact folder, reviewed predecessor
manifest/identity mapping and fresh backup, verification and scope approval.

### Initial full promotion: 2026-10-01

`public/Jejak_Static_Data_Research_Completed.xlsx` is preserved byte-for-byte.
Preparation is offline; neither script reads database credentials or writes to
the linked Supabase project. **Remote promotion completed on 2026-10-01** for
`https://zucvrejoloiuxpaotedt.supabase.co`, after the user explicitly accepted the
static baseline, including the flagged research rows. Migration
`20261001100106_prepare_static_research_import.sql` and the complete import ran
in one explicit transaction through the CLI's direct database connection.
All 270 previous region IDs and all six stored boundaries/provenance survived;
boundary EWKB bytes also match the pre-import backup exactly.

The reviewed source SHA-256 is:

```text
4e65839f83cc2b979dcc54e49cb44583c88bcd300400572dc9b5f2e6b6afb2dc
```

All **11,403 data rows are imported: 11,196 prepared and 207 flagged baselines**.
The opt-in method is `static-research-v1-baseline`; no structurally invalid rows
were admitted. Strict preparation still holds these 207 rows for source review.
The workbook's quality-audit tab is not a data table; the archived workbook
retains it. All 96 scenario formulas are checked against their cached values,
components, and referenced region/tier. A prepared row is not a certification of
its source's accuracy, licensing, geographic assignment, or freshness.

Accepted baseline rows whose source-quality issues remain unresolved:

| Table | Rows | Required resolution |
|---|---:|---|
| `regions` | 1 | Resolve the unsupported `unclassified_area` without inventing an administrative unit. |
| `population` | 114 | Reconstruct independently sourced fields as separate source/period observations. This includes 64 manually merged district rows, not just the 50 marked “Consolidated”. |
| `wages_income` | 1 | Separate DKI 2025 formal-worker wages from the 2026 statutory minimum. |
| `transport_infrastructure` | 5 | Separate observations with different sources/reporting periods. |
| `housing_statistics` | 77 | Establish quote observation periods and retain nonrepresentative-sample limitations. Retrieval dates are not substitutes. |
| `cost_of_living` | 9 | Separate historical BPS observations from modeled budget components. |

The 17 nonreconciling population totals remain unchanged and flagged. No values
are forced to balance. A human must validate the original sources before these
rows are split; the importer does not turn narrative notes into asserted facts.

### Verified repair and remaining input requirements

The ITS source page's April 2026 section confirms **29,819 students**. Its single
current institution-wide observation does not combine several periods. The
hash-bound correction in `ingestion/static_research_verified_repairs.json`
replaces the misleading consolidated note and records the 2026-10-01 source
recheck without changing the count, scope, or April reporting period. Original
cells remain in the audit. The captured source HTML is stored at
`ingestion/data/prepared/static_research/source_checks/its_april_2026.html`.

Independently certifying the flagged baselines still requires source material
that this workbook does not contain:

- The **dated, offer-level rental export** used to calculate the 77 housing
  aggregates: source/listing identity, quoted price, crawl/observation date,
  housing type, and district. Current listing pages cannot establish when the
  original quotes were observed or reproduce a historical aggregate.
- The **pre-consolidation statistical observations/source extracts**, especially
  the manually merged population fields, with each value's publisher, table,
  population definition, and reporting period. Many narrative notes identify
  candidate splits, but they are not sufficient to verify every reassignment.
- A source-supported disposition for the single unclassified BIG feature. It
  cannot be silently relabeled as a kelurahan or made a supported kecamatan.

The user superseded repair-before-publication with an all-row static-baseline
push. `include_static_baseline()` accepts only known source-quality issues, not
invalid numbers, formulas, identities or relationships. Mixed-source rows keep
their numbers and original field-specific notes, but shared observation and
publication dates/confidence become `NULL`, with `evidence_type='estimated'`.
Housing summaries stay `derived`, with unknown observation periods left `NULL`.
The unclassified feature remains unsupported, without geometry or official codes.

### Read-time enrichment precedence

`withCachedEvidence()` reads accepted, non-sample, unexpired enrichment cache rows
for map details, map catalogue rents, and onboarding previews. It overlays supported
fields without changing stored static rows. Geography, population, city living costs,
education data, and other unsupported fields continue to use their static sources.
Cache failures or missing values retain the static fallback. These reads do not run zone evidence discovery.

- Housing: calculate medians from actual district-local listings for each housing type.
  A pooled rent range cannot supply a per-type median.
- Career: retain boundary-based office binning for approximate company counts, and
  include scoped opening counts. An observed salary range cannot replace an average wage.
- Provenance: retain limitations, housing sample sizes, and geographic scope. Cache
  retrieval times describe cache age; they do not fill missing observation periods.
  Refresh-due housing/opening aggregates carry `freshness: stale` until expiry.

Form preview and confirmed-profile ranking share `evaluateLiveOnboarding()`. Career
fit normalizes scoped company counts, opening counts, and database-mapped KBLI worker
counts separately, then averages indicators common to career-evidenced candidates.
Disjoint evidence coverage leaves career fit unavailable. For overlapping KBLI mappings,
the scorer uses the strongest available count rather than adding overlapping groups.
Sector fit remains a broad industry signal, not proof of an occupation match.

The scorer retains occupation, sector, study field, education level, and confirmed
career stage. Current datasets cannot support occupation/stage or program/qualification
matching; the result reports these criteria as unavailable and omits unsupported fit
dimensions. Generic campus counts do not satisfy a selected program or qualification.
The scorer keeps city wages out of district fit. These changes do not certify the
207 flagged static baselines or supply their missing source material.

## Run preparation locally

Prerequisites: Python 3.10+, `openpyxl==3.1.5` (also pinned in
`ingestion/requirements.txt`), and the repository's installed Bun/Node dependencies.

```powershell
bun run test:research
bun run prepare:research
bun run check:research
bun run test:schema
```

To regenerate the **promoted baseline policy**, use this instead of strict
`prepare:research`, then rerun `check:research`:

```powershell
python -B ingestion/prepare_static_research.py --include-review-as-baseline
```

- `test:research` tests validation and normalization with synthetic workbooks.
- `prepare:research` reads the original workbook, validates rows, and generates
  a complete audit manifest and guarded SQL. It does not connect to any database.
- `check:research` applies the migration chain and the complete prepared import
  to an isolated in-memory PGlite/PostGIS database, then repeats the import. Its
  fixtures and reconciliation checks are specific to the completed workbook.
- `test:schema` runs the existing schema/boundary tests plus focused research
  contract and permission tests, without remote credentials.

To inspect a workbook without writing preparation artifacts:

```powershell
python -B ingestion/prepare_static_research.py --check-only
```

Optional positional workbook path and `--output` select another input/folder.
The output cannot be under `public/`. Missing reference sheets are reported, not
fabricated; this workbook does not include `sector_mapping`,
`geospatial_sources`, or `estimation_parameters`, or adjacent map source files.

## Generated artifacts

Default folder: `ingestion/data/prepared/static_research/` (already gitignored).

- `source.xlsx`: an unchanged copy, checked against the source hash.
- `manifest.json`: every original data row, normalized payload, formula, issue,
  transformation, source sheet/row number, and disposition.
- `report.json`: counts, issue/transform summaries, and missing reference sheets.
- `review.jsonl`: unresolved review/baseline rows, including their accepted caveats.
- `import.sql`: transactional staging and upserts for prepared rows and, only
  under the explicit baseline opt-in, accepted flagged rows.
- `local-verification.json`: successful full-workbook test results, including
  the source and generated SQL hashes. Regenerate this verification after any
  workbook, contract, migration, or importer change.
- `remote-verification.json`: all-row payload/key/count reconciliation, preserved
  catalog IDs/boundaries and hosted database permission checks.
- `hosted-api-verification.json`: read-only hosted RPC/API smoke results.
- `remote-backup/`: pre-import affected-table snapshot, migration/schema/RPC
  references, local restore verification, deployment artifact and guarded
  `restore-data.sql`. This is a **scoped data backup**, not a complete project,
  Auth, Storage or physical database backup. Restoration retains the additive
  schema, audit and migration history, and refuses changed post-import data.

Do not deploy these audit artifacts through `public/`, commit credentials, or
copy generated rows into historical migration files. The original workbook was
already placed in `public/` and has not been moved; review whether it should be
publicly downloadable before any application deployment.

## Implementation and data flow

1. **Read and identify.** `prepare()` in
   `ingestion/prepare_static_research.py` hashes the input, loads formulas and
   cached values separately, and maps numbered tabs through
   `ingestion/static_research_contract.json`. Unknown/repeated headers and sheets
   fail preparation rather than silently dropping data.
2. **Normalize without inventing.** `normalize()` converts Excel dates to ISO
   dates, parses OSM tags, and canonicalizes KBLI section groups. All original
   cells stay in `raw_data`. Missing place names and institution activity stay
   `NULL`; 24 unusable/non-HTTPS website cells are omitted from the published
   payload but retained in the audit. No HTTPS rewrite is guessed. `source_urls`
   preserves every URL listed in citation cells; inline citations in narrative
   notes also remain intact, but are not guessed into field-level provenance.
   Before normalization, `apply_verified_repairs()` applies only curated source
   corrections whose workbook hash, sheet/row identity, and expected cells match.
   A mismatched correction stays in review instead of altering another release.
3. **Validate and quarantine.** `validate_observation()`, `verify_scenarios()`,
   and `validate_dependencies()` check types, periods, scopes, formulas, natural
   keys, official codes, hierarchy, and referenced catalog rows. Review status
    propagates to dependent rows. `include_static_baseline()` runs only with the
    explicit opt-in, accepts a narrow issue allowlist and records warnings while
    removing claims of a shared observation period. Dependency/formula/key
    errors remain blockers even in baseline mode.
4. **Prepare the schema.**
   `supabase/migrations/20261001100106_prepare_static_research_import.sql` widens
   KBLI groups, adds provenance, and allows the genuine unknown values. Program
   identities prefer official codes and otherwise use the source program name;
   no fake program codes are created. Non-OSM campuses use institution plus
   source campus name as their fallback key. The migration restores the exact
   existing static-fact view definition after widening its dependent column.
5. **Keep scenarios separate.** `living_cost_rates` and `monthly_budgets` store
   32 rows each with `evidence_type='estimated'`, assumptions/limitations,
   person count, method version, and `as_of` from the workbook retrieval date.
   `as_of` is not a shared observation period or a freshness guarantee. Database
   constraints check totals and the linked living-cost scenario. These tables
   have RLS and service-role-only access; they do not feed observed-cost RPCs.
6. **Stage and promote atomically.** `compile_import()` generates a guarded
    transaction: stage all 11,403 rows, reconcile the count, then upsert eligible
   rows in foreign-key order. Regions are ordered by hierarchy depth; institutions
   precede campuses/enrollment. Unique keys preserve repeat-import IDs. Region
   IDs, stored geometry, existing geometry provenance, and sample flags are not
   overwritten. Constraints and synchronization triggers stay enabled. Incoming
   catalog provenance remains available in staging if stored geometry takes
   precedence.
7. **Preserve public read contracts.** `private.static_place_rows()` includes
   neighborhood places under their actual parent district. `get_map_region()`
   and `get_public_places()` share this logic and show an explicit Indonesian
   unnamed-category label when necessary. Raw names stay unknown. City-only or
   province-only places are not guessed into kecamatan. Inactive records remain
   stored but excluded from public reads. No frontend contract changes are needed.
8. **Verify before promotion.** `checkStaticImport()` in
   `ingestion/check_static_import.mjs` tests the hash guard, service-role import,
   reconciliation, repeated imports, ID/geometry/provenance preservation,
   district child-place reads, browser access denial, and rollback of a new batch
   after an injected late failure. No live source checks or hosted PostgREST/UI
   integration are claimed by these local tests.

## Remote promotion and verification — completed

`ingestion/push_static_research.mjs` implements `backup`, `verify`, `promote` and
read-only `reconcile` for this initial load. Each requires the explicit project
ref and source hash. It checks the linked target, workbook/import/migration
hashes, zero structural review rows, a tested backup and unchanged live data.
The private deployment folder contains only archived applied migrations and
the approved schema-plus-data artifact. It does not push unrelated working files,
Vault settings, roles or seeds.

The 24 MB import exceeded the Management API's request limit (HTTP 413; no SQL
executed). CLI 2.119.0's direct push requires explicit transaction control for
this envelope; an initial attempt without it stopped at `LOCK TABLE`, before
schema/data changes. The successful direct artifact has one `BEGIN`/`COMMIT`,
publishes with `service_role`, and retains constraints/triggers. The CLI records
migration history after commit; that record was independently verified.

Completed checks:

- 16 preparation tests and all 29 schema tests pass; full isolated import,
  repeat-import identities and late-failure rollback pass.
- Live pre-import catalog was restored locally, imported, then fully rolled
  back from the scoped backup, including IDs, timestamps and boundary provenance.
  An injected late failure rolls back **both schema and data**.
- All 11,403 rows reconcile by dataset identity, payload and count. Coordinate
  floating-point representations are compared within `1e-10` degrees.
- Destination totals include 689 regions, 534 population rows, 9,385 places,
  77 housing aggregates, nine cost-of-living rows and 32 scenarios in each
  separate scenario table. All 207 baseline caveats remain in private audit.
- Hosted PostgREST lists all 105 supported kecamatan under eight city/regency
  parents. Setiabudi and Coblong return imported facts, housing provenance and
  places. Setiabudi reads descendant places without changing their region IDs.
  Unclassified features are excluded; browser scenario/audit reads are denied.
- New tables have RLS; audit reads and scenario browser writes are denied to
  browser roles. Pre-existing advisor warnings remain. The four added
  [RLS-without-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
  reflect intentionally service-only tables, not missing browser access.
  Existing [mutable search paths](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable),
  [public read RPCs](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
  and [six unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys)
  are outside this import's scope.
- Lint and TypeScript checks pass. The broader `bun run test` has 121 passes and
  two failures in `tests/relocationProfileInterpretation.test.ts` (transport inference), outside these import
  changes. No application UI or zone evidence discovery run was triggered/tested by hosted checks.

Read-only verification can be repeated:

```powershell
node ingestion/push_static_research.mjs reconcile zucvrejoloiuxpaotedt 4e65839f83cc2b979dcc54e49cb44583c88bcd300400572dc9b5f2e6b6afb2dc
node --env-file=.env.local ingestion/check_remote_static_research.mjs
```

Before any **future** promotion:

1. Obtain explicit approval for the target project, schema migration, and
   import policy/subset; validate source accuracy/licensing and coverage. Baseline
   acceptance does not independently certify the 207 flagged source observations.
2. Take a restorable backup and record existing IDs, boundaries/provenance, row
   counts, and any matching-key records that would be updated. Recheck live
   security/performance advisories, available disk space, and migration history.
3. Review all pending migrations and apply only the approved scope; the working
   tree contains unrelated ongoing work. Test with a real local Supabase stack
   or isolated development database before hosted promotion where available.
4. Regenerate and verify the exact artifact. Review both the source SHA-256 and
   `local-verification.json`'s SQL SHA-256; the source hash alone does not certify
   an edited SQL artifact. Bump the contract's `method_version` if changing an
   already-promoted transformation policy.
5. Apply the approved additive migration, then execute `import.sql` using a
   trusted PostgreSQL connection with privileges matching the tested service
   role. The script refuses to stage anything unless the **same database session**
   has `jejak.static_import_approved_sha256` set to its exact source hash. This
   setting is an operator safety latch, not authentication or user approval.
   Session state requires a direct/session connection, not a transaction pooler.
6. Use a SQL client that stops on the first error. The import has its own
   `BEGIN`/`COMMIT`; issue `ROLLBACK` after an error and never continue a partially
   failed session. Imports do not delete old releases or unrelated records.
7. Reconcile staged/prepared/baseline/review counts and matching dataset keys, verify
   browser read/write boundaries and map RPC responses, then run hosted API/UI
   smoke checks. A committed rollback needs the backup/pre-import records;
   deleting only new rows cannot undo updates to existing catalogs.

The offline preparation scripts/artifacts contain no database credentials.
The separate operator runner uses the CLI's existing authenticated session;
credentials are never printed or committed.
