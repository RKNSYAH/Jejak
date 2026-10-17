# Landing screenshot preview

This local-only fixture renders the existing `/map` page for landing screenshots.
Facts are fictional and carry `is_sample: true`. Geography comes from BIG's
administrative boundary service; it is never drawn or generated for marketing.

Before starting, run `node scripts/landing-preview/download-boundaries.mjs` to
download Jakarta Selatan's district FeatureCollection into
`.temp/landing-capture/boundaries.geojson` from:

`https://geoservices.big.go.id/rbi/rest/services/BATASWILAYAH/BATAS_KECAMATAN_AR/MapServer/0/query`

Query parameters: `where=UPPER(WADMKC) IS NOT NULL AND UPPER(WADMKK) LIKE '%JAKARTA SELATAN'`,
`outFields=KDCBPS,WADMKC,WADMKK,WADMPR`, `returnGeometry=true`, `outSR=4326`, `f=geojson`.

1. Run `node scripts/landing-preview/server.mjs`. It starts the existing in-memory
   auth fixture on 3101 and the capture API on 3103. These ports must be free.
2. Start a separate local Next preview on 3102 with these process environment overrides:
   `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:3103`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY=e2e-publishable-key`,
   `SUPABASE_SERVICE_ROLE_KEY=e2e-local-service-role`, `NEXT_PUBLIC_HCI_TELEMETRY=false`.
   Stop other Next development processes using this checkout first.
   For clean captures, build with these same overrides using `npm run build`, then
   run `node node_modules/next/dist/bin/next start --port 3102 --hostname 127.0.0.1`
   with the overrides still set. This removes development overlays without changing UI.
3. Sign in through the normal local login form as `map-user@example.test`, password
   `map-test-password`. Open `/map?onboarding=demo` and skip onboarding.
4. Select Setiabudi or Tebet through the real interface and choose the Hunian lens. Capture the actual map,
   controls, detail panel, attribution, and sample labels. Keep source disclosures
   closed; do not replace screenshot text or fabricate controls.
5. Save original JPEG captures under `public/landing/`. The wide workspace uses
   1600 by 900 pixels, the mobile view 480 by 800. The 400 by 330 detail crops
   show the actual sidebar without any map pixels. Clear viewport overrides
   and restore the ordinary development environment after capture.

This fixture is not imported by application code and does not change production
authentication, API handlers, or persisted data. It does not run the test suite.
