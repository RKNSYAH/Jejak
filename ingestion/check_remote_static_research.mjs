// Read-only hosted PostgREST smoke check; no enrichment, account creation or writes.
// Run: node --env-file=.env.local ingestion/check_remote_static_research.mjs
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const folder = resolve('ingestion/data/prepared/static_research');
const summary = JSON.parse(await readFile(resolve(folder, 'remote-verification.json'), 'utf8'));
const { data } = JSON.parse(await readFile(resolve(folder, 'remote-backup/post-import.json'), 'utf8')).rows[0];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.equal(url, `https://${summary.project_ref}.supabase.co`);
assert.ok(key, 'Publishable/anon key required');
const headers = { apikey: key, 'Content-Type': 'application/json',
  ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
async function rpc(name, body) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `${name}: expected public read success`);
  return response.json();
}

const cities = data.regions.filter((r) => ['city', 'regency'].includes(r.region_type) &&
  data.regions.some((d) => d.parent_region_code === r.region_code && d.region_type === 'district' && d.is_supported));
const cityChecks = await Promise.all(cities.map(async (city) => {
  const regions = await rpc('get_map_regions', { p_parent_code: city.region_code, p_include_sample: false });
  const expected = data.regions.filter((r) => r.parent_region_code === city.region_code &&
    r.region_type === 'district' && r.is_supported && !r.is_sample);
  assert.equal(regions.length, expected.length, `${city.region_code}: district list`);
  return { city: city.region_code, districts: regions.length };
}));

const details = await Promise.all(['jakarta-selatan-setiabudi', 'bandung-coblong'].map(async (code) => {
  const [row] = await rpc('get_map_region', { p_region_code: code, p_include_sample: false, p_include_geometry: false });
  assert.ok(row && row.facts.length > 0 && row.places.length > 0, `${code}: imported facts and places`);
  assert.equal(row.geometry, null);
  const rent = row.facts.find((f) => f.metric === 'median_monthly_rent_idr');
  assert.ok(rent, `${code}: housing baseline is available`);
  assert.equal(rent.evidence_type, 'derived');
  assert.equal(rent.period_end, null);
  assert.ok(rent.limitations.includes('Static research baseline'));
  const places = await rpc('get_public_places', { p_region_id: row.region_id });
  assert.ok(places.length > 0);
  const childPlaces = places.some((p) => p.region_id !== row.region_id);
  if (code === 'jakarta-selatan-setiabudi') assert.ok(childPlaces, `${code}: descendant places stay in their own region`);
  return { district: code, facts: row.facts.length, places: row.places.length, child_places: childPlaces };
}));

const [unclassified] = data.regions.filter((r) => r.region_type === 'unclassified_area');
assert.deepEqual(await rpc('get_map_region', { p_region_code: unclassified.region_code, p_include_sample: false,
  p_include_geometry: false }), []);
const scenarios = await fetch(`${url}/rest/v1/monthly_budgets?select=id&limit=1`, { headers });
assert.ok([401, 403, 404].includes(scenarios.status), 'Browser must not read scenarios directly');
const audit = await fetch(`${url}/rest/v1/static_import_rows?select=row_number&limit=1`, {
  headers: { ...headers, 'Accept-Profile': 'private' },
});
assert.ok([401, 403, 404, 406].includes(audit.status), 'Private audit is not a browser Data API');

const result = { passed: true, remote_writes: false, project_ref: summary.project_ref,
  cities: cityChecks, details, unclassified_excluded: true,
  scenario_browser_status: scenarios.status, private_audit_status: audit.status,
  app_ui_tested: false, enrichment_triggered: false };
await writeFile(resolve(folder, 'hosted-api-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
