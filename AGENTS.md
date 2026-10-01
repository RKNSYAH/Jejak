<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commands and generated files

- Use Bun 1.4.2 and Node.js 20.9+ (`package.json`). Common checks: `bun run lint`, `bunx tsc --noEmit` (no typecheck script), and `bun run test` (runs `tests/` only). Focus tests with `bun test tests/mapping.test.ts`, `bun test tests/enrichment.test.ts`, or `bun test tests/hci.test.ts`.
- `bun run test:schema` runs the separate Node test suite against in-memory PGlite/PostGIS; it needs no remote database credentials. `bun run test:e2e` starts a local Supabase Auth/Data API fixture on port 3101, then builds and serves the production app on port 3100 for Playwright tests; install Chromium with `bunx playwright install chromium` first. Both ports must be available. Map tests use signed-in fixture sessions; no remote database credentials are needed.
- `predev` and `prebuild` copy MapLibre workers into `public/maplibre/`; update `scripts/copy-maplibre-worker.mjs`, not copied bundles.

## Architecture and runtime

- `app/page.tsx` renders the landing page; `app/map/page.tsx` renders `app/components/map/JejakMap.tsx`. Map data flows through `useZoneIntelligence` → `zoneApi` → `app/api` → `app/engine/controller/zoneController.ts` → Supabase RPCs in `supabase/migrations/`.
- Map data requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, usually in gitignored `.env.local`. `proxy.ts` refreshes auth claims/cookies for matched requests.
- `JEJAK_INCLUDE_SAMPLE_DATA` defaults to enabled. Preserve `is_sample` in API/UI data; sample rows are demo content, not verified/live evidence. Geometry uses stored boundary first, then the BIG boundary service.
- Evidence enrichment is API-only (no UI trigger yet): signed-in `POST /api/zones/[zoneId]/enrich` claims runs, then `after()` runs `app/engine/enrichment/pipeline.ts` (LF-01 → LF-02 plus a company-office LF-01 pass → Nominatim → PostGIS tiers → acceptance → snapshot; postings placed by their company's office are capped at district precision). It needs `NEXT_LANGFLOW_URL`, `NEXT_LANGFLOW_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `JEJAK_GEOCODER_USER_AGENT`; read env through `process.env` only. Flow IDs live in `app/engine/lib/langflow.ts`. The frontend reads results with `getZoneEvidence()` (`app/engine/lib/evidenceApi.ts`, aggregate snapshot plus run state); raw evidence rows stay server-only. `getEvidenceClusters()` returns per-district counts for map clusters. Evidence feeds the existing metrics, never a separate "web evidence" section: the zone intelligence route merges located offices into the district's `company_count` fact (`mergeLocatedEvidence()` in `app/engine/enrichment/clusters.ts`, flagged `approximate`), and the Pekerjaan lens adds a company point for the selected district only. Evidence counts are never exact totals in the UI: label them with `approxEvidenceLabel()` (`app/engine/enrichment/labels.ts`), e.g. "sekitar 3 lowongan".
- LF-03 (`POST /api/lf03`, conflict review) and LF-04 (`POST /api/lf04`, zone explanation) are linked API-only with no UI or pipeline caller yet. LF-04 loads the user's saved confirmed profile server-side; callers never send `confirmed_profile`. Both re-validate flow output (`app/engine/lib/lf03Validation.ts`, `lf04Validation.ts`), including LF-04 numeric grounding.
- Click telemetry flows from `instrumentation-client.ts` through `/api/hci` to `hci_click_events`; disable with `NEXT_PUBLIC_HCI_TELEMETRY=false`, or tag a study participant with `?study=P01`. Add `data-hci-region` to new UI surfaces.

## Code style

- Match the surrounding file. The inspected controllers/routes use four-space indentation, mostly double-quoted strings and semicolons, named exported functions, straightforward object mapping, and early returns for validation/errors. Existing formatting is inconsistent; avoid reformatting unrelated legacy lines.
- Keep route handlers focused on request parsing, validation, and HTTP status/JSON responses; delegate auth and data access to controllers. Follow `relocationProfileController.ts` with `/api/user/relocation-profile/route.ts`, and `zoneController.ts` with `/api/geometry/route.ts` as examples. Parse JSON bodies with `readJsonBody()` (`app/engine/lib/http.ts`) and map Langflow failures with `flowErrorResponse()` (`app/engine/lib/langflow.ts`). Geometry route loads a region row, then delegates stored/fallback boundary handling to `zoneBoundary.ts`.

## Product guidance

- Read `docs/Jejak_Project_Summary.md` before product/architecture changes and `docs/DESIGN.md` before UI/design changes. Before navigation, onboarding, discovery, map interaction, comparison, or saved-plan changes, read `docs/Jejak_HCI_User_Flow_Summary.md`; its route tree is proposed, not implemented.
- Keep map and list access equivalent, show evidence provenance and sample/stale/missing-data status, and let users understand why results fit. Confirm AI-inferred changes that affect ranking.
- UI copy is Indonesian and addresses the user as "kamu/-mu". Call a map unit "kecamatan", mark sample values with a "Data contoh" badge, and keep labels short: no explanatory disclaimers.



- After code changes, give a full summary and key code snippets/functions for review. Explain snippets in implementation order, tracing input through logic to result and why each step is needed. Use the caveman skill for the summary.
