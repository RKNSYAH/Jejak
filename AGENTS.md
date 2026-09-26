<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working in this repo

- Use Bun 1.4.2 (`package.json`/`bun.lock`): `bun run dev`, `bun run build`, `bun run lint`, `bun run test`. Focus tests with `bun test tests/mapping.test.ts` or `bun test tests/lf01.test.ts`; there is no typecheck script (`bunx tsc --noEmit`).
- `predev`/`prebuild` copy MapLibre workers from the installed package into `public/maplibre/`. Change `scripts/copy-maplibre-worker.mjs`, not the copied bundles.
- The README is starter boilerplate. `app/page.tsx` redirects `/` to `/map`; `app/map/page.tsx` renders `app/components/map/JejakMap.tsx`. Map requests flow through `useZoneIntelligence` and `zoneApi` to `app/api` and the Supabase RPCs in `app/engine/controller/zoneController.ts`.
- Map data needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (typically in gitignored `.env.local`). The RPC definitions live in `supabase/migrations/`; `proxy.ts` refreshes auth claims/cookies for matched requests.
- `JEJAK_INCLUDE_SAMPLE_DATA` defaults to enabled unless set to `false`. API responses carry `is_sample`; never present those rows as verified/live evidence. `/api/geometry` uses stored geometry first, then falls back to the external BIG boundary service.
- `/api/lf01` currently validates requests but returns `503 ENRICHMENT_UNAVAILABLE`; it does not run enrichment.
- Read `docs/Jejak_Project_Summary.md` before product or architecture changes and `docs/DESIGN.md` before UI/design changes.

## Implementation and review

- Implement the smallest clear solution. Avoid unnecessary files, functions, and abstractions; reuse existing dependencies or a suitable package when it simplifies the work.
- After code changes, give a short summary and key code snippets for review. Explain the snippets in implementation order, tracing how input flows through the logic to the result and why each step is needed.
