<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project guidance

- Read `docs/Jejak_Project_Summary.md` to understand the product before making product or architecture changes. Read `docs/DESIGN.md` before any design or UI work.
- This is a single Bun-managed Next.js App Router app. `app/page.tsx` redirects `/` to `/map`; the map UI is in `app/components/map`, API routes are in `app/api`, and engine logic is in `app/engine`.
- Use Bun 1.4.2 (`packageManager` in `package.json`): `bun run dev`, `bun run build`, `bun run lint`, and `bun run test`. Run a focused test with `bun test tests/mapping.test.ts` or `bun test tests/lf01.test.ts`.
- `predev` and `prebuild` copy MapLibre worker files into `public/maplibre`; edit `scripts/copy-maplibre-worker.mjs` rather than the copied vendor files.
- Zone intelligence in `app/datas/mockData.ts` is sample data. Do not present it as live evidence.
