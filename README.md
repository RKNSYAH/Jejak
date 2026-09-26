# Jejak

Jejak is a relocation-planning project for people choosing where to study or work in Indonesia. In the current alpha, you can explore districts on a map, compare available employment, education, housing, and transport data, and inspect the sources behind those figures.

## Current features

- Explore a full-screen map with search, ranked area cards, selectable district boundaries, and a 3D-building toggle.
- Switch between Ringkasan (summary), Pekerjaan (employment), Pendidikan (education), Hunian (housing), and Mobilitas (mobility).
- Inspect regional facts and campus locations in a desktop sidebar or mobile sheet, including source, period, confidence, and sample-data labels where available.
- Browse areas ranked by wage-to-rent ratio, with population as a secondary sort key.
- Measure click-to-paint and response latency through anonymous alpha-study telemetry.

The broader plan includes relocation profiles, personalized recommendations, saved shortlists, and AI-assisted explanations. See the [project summary](docs/Jejak_Project_Summary.md) for that scope. The current `/api/lf01` endpoint validates enrichment requests but returns `503 ENRICHMENT_UNAVAILABLE`; it does not execute a Langflow flow.

Sample data is enabled by default. Treat rows marked `is_sample` as demo content, not verified or live evidence. Coverage depends on the regions and facts in your database.

## Dependencies

Use **Bun 1.4.2**, as specified in `package.json`, and **Node.js 20.9 or newer**. The worker-copy scripts and database tests invoke Node.js. You also need a WebGL-capable browser and a Supabase project with the Jejak schema and map data.

| Area | Packages |
| --- | --- |
| Application | Next.js 16.3.5, React 19.2.8, TypeScript 5 |
| Maps | MapLibre GL JS 6, react-map-gl 8, OpenFreeMap basemap |
| Styling | Tailwind CSS 4, daisyUI 5, Lucide React icons |
| Data and authentication | Supabase JavaScript client 2, Supabase SSR, PostgreSQL with PostGIS |
| Client state and analytics | Zustand 5, Vercel Analytics |
| Checks | ESLint 9, Bun test runner, Playwright Test |
| Database tests | PGlite and its PostGIS extension, installed through `supabase/package.json` |

Check [`package.json`](package.json) for dependency ranges and `bun.lock` for resolved versions. The database test package has its own manifest and lockfile in `supabase/`.

## Run locally

### 1. Install packages

From the repository root:

```bash
bun install --frozen-lockfile
```

### 2. Configure the environment

Create `.env.local` in the repository root:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-project-anon-key

# Optional; both features default to enabled.
JEJAK_INCLUDE_SAMPLE_DATA=true
NEXT_PUBLIC_HCI_TELEMETRY=true
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Required Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required public anon key for browser and server clients. Use the anon key, not a service-role key. |
| `JEJAK_INCLUDE_SAMPLE_DATA` | Set to `false` to exclude sample rows from map reads. |
| `NEXT_PUBLIC_HCI_TELEMETRY` | Set to `false` to disable click telemetry. Keep it enabled for the interaction-latency tests. |

Git ignores `.env.local`. Restart the development server after changing environment variables; rebuild production assets after changing `NEXT_PUBLIC_*` values.

### 3. Connect the database

Use a Supabase project that contains the Jejak schema, map-read RPCs, and regional data. The schema lives in [`supabase/migrations/`](supabase/migrations/); [`supabase/SCHEMA.md`](supabase/SCHEMA.md) describes the tables, access rules, and evidence model. Installing JavaScript packages does not provision or populate the database.

**Fresh-database blocker:** the schema test currently fails while applying `20260926_global_map_regions.sql` because `r.is_sample` does not exist at that point in the migration chain. Resolve the migration dependency order before provisioning a fresh database from these files.

The app reads stored boundaries first and falls back to Indonesia's BIG boundary service when needed. Map tiles and fallback boundaries require network access.

### 4. Start development

```bash
bun run dev
```

Open [http://localhost:3000/map](http://localhost:3000/map). The root URL redirects to `/map`.

The `predev` and `prebuild` scripts copy MapLibre worker files into `public/maplibre/`. Edit `scripts/copy-maplibre-worker.mjs` if that setup needs to change.

### Production build

```bash
bun run build
bun run start
```

Configure the environment before building and starting the server.

## Checks and tests

### Lint and type checking

```bash
bun run lint
bunx tsc --noEmit
```

There is no separate `typecheck` script.

### Application tests

Run the application suite from the repository root:

```bash
bun test ./tests
```

For a focused run:

```bash
bun test tests/mapping.test.ts
bun test tests/lf01.test.ts
bun test tests/hci.test.ts
```

- `mapping.test.ts`: boundary validation, sample labels, map metrics, ranking, API response validation, and partial-load failures.
- `lf01.test.ts`: enrichment request validation and the unavailable-enrichment response.
- `hci.test.ts`: click payload validation and malformed-request handling.

These tests use fixtures and mocks for external data. The root `bun run test` command runs `bun test` without a directory filter, so it also discovers `supabase/tests/schema.test.mjs`. That database test can exceed Bun's default five-second timeout; use its Node test command below.

### Database contract tests

Install the separate test dependencies and run the suite from `supabase/`:

```bash
cd supabase
bun install --frozen-lockfile
bun run test
cd ..
```

This command invokes `node --test tests/schema.test.mjs` against an in-memory PostgreSQL/PostGIS instance. You do not need remote database credentials. The suite checks migration replay, database access rules, and data contracts. The migration-order failure noted above currently blocks the later checks.

### Browser and interaction-latency tests

From the repository root, install Chromium once, then run Playwright:

```bash
bunx playwright install chromium
bun run test:e2e
```

Playwright builds the app and serves it at `http://localhost:3100`. It runs desktop Chrome and Pixel 7 emulation with one worker, mocks the map-data and telemetry API requests, and checks click-to-paint and selection-response budgets. Keep the environment configuration in place for the server build and runtime. Outside CI, Playwright can reuse an existing server on port 3100; use a production server for meaningful latency measurements.

Open the HTML report with:

```bash
bunx playwright show-report
```

Find report files in `playwright-report/` and test artifacts in `test-results/`. Playwright retains traces on failure.

## Code layout

```text
app/
  api/                 Map data, geometry, auth, telemetry, and LF-01 routes
  components/map/      Map canvas, controls, discovery sheet, and detail panel
  engine/              Data controllers, API clients, validation, and types
  map/page.tsx         Map route
  stores/              Client state
docs/                  Product, design, AI, and data-research specifications
e2e/                   Playwright interaction-latency tests
scripts/               MapLibre worker setup
supabase/              Migrations, schema documentation, and database tests
tests/                 Application and route tests
instrumentation-client.ts  Click-telemetry startup
proxy.ts               Supabase auth cookie refresh
```

For map-data changes, follow this path:

```text
JejakMap → useZoneIntelligence → zoneApi → app/api → zoneController → Supabase RPCs
```

The main read routes are `/api/zones`, `/api/zones/[zoneId]/intelligence`, and `/api/geometry`. Click telemetry posts to `/api/hci`; adding `?study=P01` to the map URL tags a study participant. Give new UI surfaces a `data-hci-region` attribute so telemetry can identify them.

## Project documentation

- [Project summary](docs/Jejak_Project_Summary.md): product goals, intended user journey, and planned scope.
- [Design guide](docs/DESIGN.md): map layout, interaction patterns, and visual rules.
- [Database schema](supabase/SCHEMA.md): tables, evidence storage, and access contracts.
- [Langflow AI specification](docs/Jejak_Langflow_AI_Specification.md): planned AI workflows and enrichment contracts.
- [Static-data research handoff](docs/Static_Data_Research_Handoff.md): data sourcing and preparation.
- [Contributor instructions](AGENTS.md): repository conventions and implementation guidance.
