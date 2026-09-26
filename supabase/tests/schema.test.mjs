import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { postgis } from '@electric-sql/pglite-postgis';

// Real PostgreSQL + PostGIS in memory; no remote database or credentials.
// Bootstrap only the Supabase roles and auth objects used by the migrations.
test('migration chain and database contracts', async (t) => {
  const db = new PGlite({ extensions: { pgcrypto, postgis } });
  t.after(() => db.close());
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;
  const one = async (sql, params = []) => (await rows(sql, params))[0];
  const userA = '00000000-0000-4000-8000-000000000001';
  const userB = '00000000-0000-4000-8000-000000000002';
  const hash = 'a'.repeat(64);

  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role jejak_readonly;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated, service_role;
    grant execute on function auth.uid() to authenticated, service_role;
  `);

  let migrated = false;
  await t.test('all migrations apply without rewriting SQL', async () => {
    const folder = new URL('../migrations/', import.meta.url);
    for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
      try {
        await db.exec(await readFile(new URL(file, folder), 'utf8'));
      } catch (error) {
        throw new Error(`${file}: ${error.message}`, { cause: error });
      }
    }
    migrated = true;
  });
  if (!migrated) return;

  await db.query('insert into auth.users values ($1), ($2)', [userA, userB]);
  const region = await one(`insert into public.regions (code, name, region_type)
    values ('pancoran', 'Pancoran', 'district') returning id`);

  await t.test('backend RPCs deny browser execution even with legacy default grants', async () => {
    const exposed = await rows(`select p.proname from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in (
        'check_and_claim_zone_enrichment', 'get_zone_evidence', 'upsert_zone_evidence',
        'complete_enrichment_run', 'zone_evidence_gc', 'publish_region_snapshot',
        'calculate_relocation_fit', 'get_zone_data')
      and (has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('authenticated', p.oid, 'execute'))`);
    assert.deepEqual(exposed, []);
    await db.exec('set role anon');
    try {
      await assert.rejects(db.query('select public.zone_evidence_gc()'), /permission denied/);
      await assert.rejects(db.query('select * from public.zone_evidence_cache'), /permission denied/);
      assert.deepEqual(await rows('select * from public.get_region_data($1)', [region.id]), []);
    } finally {
      await db.exec('reset role');
    }
  });

  let profile;
  let recommendation;
  await t.test('recommendations require an owned, immutable confirmed revision', async () => {
    profile = await one(`insert into public.relocation_profiles
      (user_id, profile_name, revision, profile) values ($1, 'Move', 1, '{}') returning id`, [userA]);
    const insertRun = (user) => one(`insert into public.recommendation_runs
      (user_id, profile_id, scoring_version) values ($1, $2, 'v1') returning id`, [user, profile.id]);
    await assert.rejects(insertRun(userA), /confirmed profile/);
    await db.query(`update public.relocation_profiles set confirmed = true, confirmed_at = now()
      where id = $1`, [profile.id]);
    await assert.rejects(insertRun(userB), /confirmed profile/);
    recommendation = await insertRun(userA);
    await assert.rejects(db.query(`update public.relocation_profiles set profile = '{"budget":1}'
      where id = $1`, [profile.id]), /immutable/);
  });

  await t.test('shortlist default ID, ownership, updates, and deletion work as authenticated', async () => {
    await db.exec('set role authenticated');
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userA]);
      const saved = await one(`insert into public.shortlist_items (user_id, region_id, recommendation_run_id)
        values ($1, $2, $3) returning id`, [userA, region.id, recommendation.id]);
      assert.ok(Number.isSafeInteger(Number(saved.id)));
      await db.query(`update public.shortlist_items set note = 'commute' where id = $1`, [saved.id]);
      await assert.rejects(db.query(`update public.shortlist_items set user_id = $1 where id = $2`,
        [userB, saved.id]), /row-level security/);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userB]);
      assert.deepEqual(await rows('select * from public.shortlist_items'), []);
      await assert.rejects(db.query(`insert into public.shortlist_items (user_id, region_id, recommendation_run_id)
        values ($1, $2, $3)`, [userB, region.id, recommendation.id]), /foreign key/);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userA]);
      await db.query('delete from public.shortlist_items where id = $1', [saved.id]);
    } finally {
      await db.exec('reset role');
    }
  });

  const claim = () => one(`select * from public.check_and_claim_zone_enrichment($1,
    'active_opening', 'pancoran|active_opening', $2)`, [region.id, hash]);
  const upsert = (run, candidates) => db.query('select public.upsert_zone_evidence($1, $2)',
    [run, JSON.stringify(candidates)]);
  const candidate = (index, extra = {}) => ({
    dedup_hash: index.toString(16).padStart(64, '0'),
    canonical_url: `https://example.test/jobs/${index}`,
    value: { title: 'Engineer' },
    latitude: -6.245, longitude: 106.845,
    geographic_precision: 'district', locality_tier: 'zone',
    validation_status: 'accepted', confidence: 0.8,
    ...extra,
  });

  await t.test('claim, deduplication, sample exclusion, locality ranking, and cache hit', async () => {
    await db.exec('set role service_role');
    try {
      const run = await claim();
      assert.equal(run.call_lf01, true);
      const duplicate = await claim();
      assert.equal(duplicate.call_lf01, false);
      assert.equal(duplicate.run_id, run.run_id);
      await upsert(run.run_id, [candidate(99, { is_sample: true }), candidate(98, {
        geographic_precision: 'building', locality_tier: 'national', confidence: 1,
      })]);
      await upsert(run.run_id, Array.from({ length: 25 }, (_, i) => candidate(i + 1)));
      const evidence = await rows(`select * from public.get_zone_evidence($1, 'active_opening', $2, 100)`,
        [region.id, hash]);
      assert.equal(evidence.length, 25);
      assert.ok(evidence.every((row) => row.locality_tier === 'zone' && !row.is_sample));
      await db.query(`select public.complete_enrichment_run($1, 'completed')`, [run.run_id]);
      await db.query(`select public.complete_enrichment_run($1, 'completed')`, [run.run_id]);
      await assert.rejects(upsert(run.run_id, [candidate(1)]), /terminal/);
      await assert.rejects(db.query(`select public.complete_enrichment_run($1, 'failed')`, [run.run_id]), /terminal/);
      assert.equal((await claim()).status, 'cache_hit');
    } finally {
      await db.exec('reset role');
    }
  });

  await t.test('full stale cache requests real refresh work; expired workers enter cooldown', async () => {
    await db.query(`update public.zone_evidence_cache set refresh_after = now() - interval '1 hour'
      where region_id = $1`, [region.id]);
    const run = await claim();
    assert.equal(run.needed_count, 25);
    assert.equal(run.source_budget, 3);
    const { input } = await one('select input from public.enrichment_runs where id = $1', [run.run_id]);
    assert.equal(input.missing_count, 0);
    assert.equal(input.refresh_count, 25);
    await db.query(`update public.enrichment_runs set lease_expires_at = now() - interval '1 second'
      where id = $1`, [run.run_id]);
    await assert.rejects(upsert(run.run_id, [candidate(1)]), /lease has expired/);
    await assert.rejects(db.query(`select public.complete_enrichment_run($1, 'completed')`, [run.run_id]), /lease has expired/);
    const retry = await claim();
    assert.equal(retry.status, 'retry_cooldown');
    assert.equal(retry.call_lf01, false);
    assert.equal((await claim()).run_id, retry.run_id);
    // Recover after cooldown, then fail again: a new run must not bypass cooldown.
    await db.query(`update public.enrichment_runs set next_retry_at = now() - interval '1 second'
      where id = $1`, [run.run_id]);
    const replacement = await claim();
    assert.equal(replacement.call_lf01, true);
    assert.notEqual(replacement.run_id, run.run_id);
    await db.query(`update public.enrichment_runs set lease_expires_at = null where id = $1`, [replacement.run_id]);
    assert.equal((await claim()).status, 'retry_cooldown');
  });

  await t.test('acceptance is explicit and requires a complete classified location', async () => {
    const otherHash = 'b'.repeat(64);
    const run = await one(`select * from public.check_and_claim_zone_enrichment($1,
      'office_presence', 'pancoran|office_presence', $2)`, [region.id, otherHash]);
    await assert.rejects(upsert(run.run_id, [candidate(1, { locality_tier: null })]), /accepted_location_ck/);
    await assert.rejects(upsert(run.run_id, [candidate(2, { longitude: null })]), /check constraint/);
    await upsert(run.run_id, [candidate(3, { validation_status: undefined, latitude: null,
      longitude: null, locality_tier: null, geographic_precision: null })]);
    assert.deepEqual(await rows(`select * from public.get_zone_evidence($1, 'office_presence', $2)`,
      [region.id, otherHash]), []);
  });

  await t.test('campus facts cannot attach to another institution or a non-campus place', async () => {
    const institution = await one(`insert into public.institutions (code, name, institution_type)
      values ('example', 'Example University', 'university') returning id`);
    const other = await one(`insert into public.institutions (code, name, institution_type)
      values ('other', 'Other University', 'university') returning id`);
    const campus = await one(`insert into public.places
      (region_id, institution_id, name, category, latitude, longitude, source)
      values ($1, $2, 'Campus', 'campus', -6.2, 106.8, 'official') returning id`, [region.id, institution.id]);
    const addFact = (institutionId, campusId) => db.query(`insert into public.institution_data
      (institution_id, campus_place_id, metric, numeric_value, data_scope, source, evidence_type)
      values ($1, $2, 'enrolled_students', 500, 'campus', 'official', 'observed')`, [institutionId, campusId]);
    await addFact(institution.id, campus.id);
    await assert.rejects(addFact(other.id, campus.id), /foreign key/);
    await assert.rejects(addFact(institution.id, null), /scope_ck/);
    await assert.rejects(db.query(`update public.places set category = 'hospital' where id = $1`, [campus.id]), /category_ck/);
    await assert.rejects(db.query('delete from public.places where id = $1', [campus.id]), /foreign key/);
  });

  await t.test('public snapshots enforce aggregate-only JSON and retain explicit stale fallbacks', async () => {
    const addSnapshot = (payload, contributors = 3, daysOld = 0) => one(`insert into public.region_snapshots
      (region_id, snapshot_type, scope_key, scope_hash, snapshot, contributor_count,
       generated_at, refresh_after, expires_at)
      values ($1, 'employment_summary', 'pancoran|local_employment', $2, $3, $4,
        now() - make_interval(days => $5), now() - make_interval(days => $5) + interval '1 day',
        now() - make_interval(days => $5) + interval '2 days') returning id`,
    [region.id, hash, JSON.stringify(payload), contributors, daysOld]);
    await assert.rejects(addSnapshot({ companies: [{ name: 'Private company' }] }), /json_ck/);
    await assert.rejects(addSnapshot({ estimated_employment: { minimum: 5, maximum: 10,
      status: 'estimated', company: 'Private company' } }), /json_ck/);
    const payload = { estimated_employment: { minimum: 40, maximum: 80, status: 'estimated' },
      limitations: ['Partial office coverage.'] };
    await assert.rejects(addSnapshot(payload, 2), /privacy_ck/);
    const older = await addSnapshot(payload, 3, 5);
    const current = await addSnapshot(payload, 3, 3);
    await db.query('select public.publish_region_snapshot($1)', [current.id]);
    await assert.rejects(db.query('select public.publish_region_snapshot($1)', [older.id]), /older/);
    await db.exec('set role anon');
    try {
      const snapshot = await one('select * from public.get_region_snapshot($1)', [region.id]);
      assert.deepEqual(snapshot.snapshot, payload);
      assert.equal(snapshot.is_stale, true);
      assert.equal(snapshot.is_expired, true);
    } finally {
      await db.exec('reset role');
    }
  });

  await t.test('one layer call returns scoped child geometry, latest non-sample facts, and safe aggregates', async () => {
    const parent = await one(`insert into public.regions (code, name, region_type, is_supported)
      values ('jakarta-selatan', 'Jakarta Selatan', 'city', true) returning id`);
    const gridA = await one(`insert into public.regions
      (parent_id, code, name, region_type, is_supported, geometry)
      values ($1, 'h3-a', 'Grid A', 'grid', true,
        extensions.ST_Multi(extensions.ST_GeomFromText(
          'POLYGON((106.8 -6.2,106.81 -6.2,106.81 -6.21,106.8 -6.2))', 4326))) returning id`,
    [parent.id]);
    const gridB = await one(`insert into public.regions
      (parent_id, code, name, region_type, is_supported)
      values ($1, 'h3-b', 'Grid B', 'grid', true) returning id`, [parent.id]);
    const metric = 'transit_access';
    const putFact = (regionId, value, periodEnd, sample = false, source = 'test-dataset') =>
      db.query(`insert into public.region_data
        (region_id, metric, numeric_value, unit, evidence_type, period_start, period_end,
         source, is_sample, limitations)
        values ($1, $2, $3, 'stops', 'estimated', null, $4, $5, $6, 'Demo only')
        on conflict (region_id, metric, period_start, period_end, source)
        do update set numeric_value = excluded.numeric_value, limitations = excluded.limitations`,
      [regionId, metric, value, periodEnd, source, sample]);
    await putFact(gridA.id, 2, '2024-12-31');
    await putFact(gridA.id, 3, '2025-12-31');
    await putFact(gridA.id, 4, '2025-12-31');
    await putFact(gridA.id, 999, '2026-12-31', true, 'sample');
    assert.equal((await one(`select count(*)::int as n from public.region_data
      where region_id = $1 and source = 'test-dataset'`, [gridA.id])).n, 2);

    const scopedHash = 'c'.repeat(64);
    const payload = {
      observed_organizations: 4, observed_office_count: 3, opening_count: 2,
      organizations_without_headcount: 1, oldest_material_evidence: '2025-01-01',
      estimated_employment: { minimum: 30, maximum: 60, status: 'estimated',
        method_version: 'local-headcount-v1' },
    };
    await assert.rejects(db.query(`insert into public.region_snapshots
      (region_id, snapshot_type, scope_key, scope_hash, snapshot, contributor_count)
      values ($1, 'employment_summary', 'grid-a|sector', $2, $3, 3)`,
    [gridA.id, scopedHash, JSON.stringify({ ...payload, indices: { sector_presence: 90 } })]), /json_ck/);
    await assert.rejects(db.query(`insert into public.region_snapshots
      (region_id, snapshot_type, scope_key, scope_hash, snapshot, contributor_count)
      values ($1, 'employment_summary', 'grid-a|sector', $2, $3, 3)`,
    [gridA.id, scopedHash, JSON.stringify({ ...payload,
      estimated_employment: { ...payload.estimated_employment, method_version: { private: 'office' } } })]), /json_ck/);
    const snapshot = await one(`insert into public.region_snapshots
      (region_id, snapshot_type, scope_key, scope_hash, snapshot, contributor_count,
       coverage, refresh_after, expires_at)
      values ($1, 'employment_summary', 'grid-a|sector', $2, $3, 3,
        'partial', now() + interval '1 day', now() + interval '2 days') returning id`,
    [gridA.id, scopedHash, JSON.stringify(payload)]);
    await db.query('select public.publish_region_snapshot($1)', [snapshot.id]);
    const getLayer = (type, scope) => rows(`select * from public.get_region_layer(
      $1, $2, $3, $4, 'grid')`, [parent.id, metric, type, scope]);

    await db.exec('set role anon');
    try {
      await assert.rejects(db.query('select * from public.region_data'), /permission denied/);
      const layer = await getLayer('employment_summary', scopedHash);
      assert.deepEqual(layer.map((cell) => cell.region_code), ['h3-a', 'h3-b']);
      assert.equal(layer[0].geometry.type, 'MultiPolygon');
      assert.equal(layer[0].metric_data.numeric_value, 4);
      assert.equal(layer[0].metric_data.period_end, '2025-12-31');
      assert.equal(layer[0].metric_data.source, 'test-dataset');
      assert.deepEqual(layer[0].snapshot, payload);
      assert.equal(layer[0].coverage, 'partial');
      assert.equal(layer[0].is_expired, false);
      assert.equal(layer[1].geometry, null);
      assert.equal(layer[1].snapshot, null);
      assert.equal(layer[1].metric_data, null);
      assert.equal((await getLayer('employment_summary', 'd'.repeat(64)))[0].snapshot, null);
      assert.equal((await getLayer(null, null))[0].snapshot, null);
      await assert.rejects(getLayer(null, scopedHash), /optional exact snapshot/);
      await assert.rejects(getLayer('employment_summary', 'bad'), /optional exact snapshot/);
    } finally {
      await db.exec('reset role');
    }

    // One RPC fetches 85 cells; missing geometry/facts remain explicitly null.
    await db.query(`insert into public.regions (parent_id, code, name, region_type, is_supported)
      select $1, 'h3-extra-' || n::text, 'Test grid ' || n::text, 'grid', true
      from generate_series(1,83) as n`, [parent.id]);
    assert.equal((await getLayer(null, null)).length, 85);
  });

  await t.test('subscriptions are backend-written, owner-read, and one current per user', async () => {
    await db.exec('set role service_role');
    try {
      const plan = await one(`insert into public.subscription_plans (code, name, billing_interval, price_amount, features)
        values ('pro_monthly', 'Pro', 'month', 49000, '{"max_profiles": 5}') returning id`);
      await db.query(`insert into public.subscriptions (user_id, plan_id, status, current_period_start, current_period_end)
        values ($1, $2, 'expired', now() - interval '2 months', now() - interval '1 month'),
               ($1, $2, 'active', now(), now() + interval '1 month')`, [userA, plan.id]);
      await assert.rejects(db.query(`insert into public.subscriptions (user_id, plan_id, status)
        values ($1, $2, 'trialing')`, [userA, plan.id]), /subscriptions_one_current_uq/);
      // A missed renewal webhook leaves userB "active" after the period lapsed.
      const lapsed = `insert into public.subscriptions (user_id, plan_id, status, current_period_start,
        current_period_end, provider, provider_subscription_id)
        values ($1, $2, $3, now() - interval '2 months', now() - interval '1 month', 'provider_x', 'sub_1')`;
      await db.query(lapsed, [userB, plan.id, 'active']);
      await assert.rejects(db.query(lapsed, [userB, plan.id, 'expired']), /subscriptions_provider_uq/);
    } finally {
      await db.exec('reset role');
    }

    await db.exec('set role anon');
    try {
      assert.deepEqual(await rows('select code from public.subscription_plans'), [{ code: 'pro_monthly' }]);
      await assert.rejects(rows('select * from public.subscriptions'), /permission denied/);
      await assert.rejects(rows('select * from public.get_my_subscription()'), /permission denied/);
    } finally {
      await db.exec('reset role');
    }

    await db.exec('set role authenticated');
    try {
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userA]);
      assert.equal((await rows('select * from public.subscriptions')).length, 2);
      assert.deepEqual(await rows('select plan_code, status, features from public.get_my_subscription()'),
        [{ plan_code: 'pro_monthly', status: 'active', features: { max_profiles: 5 } }]);
      await assert.rejects(db.query(`update public.subscriptions set status = 'canceled'`), /permission denied/);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userB]);
      assert.deepEqual(await rows('select provider_subscription_id from public.subscriptions'),
        [{ provider_subscription_id: 'sub_1' }]);
      assert.deepEqual(await rows('select * from public.get_my_subscription()'), []);
    } finally {
      await db.exec('reset role');
    }
  });

  await t.test('account deletion cascades through confirmed profiles and recommendations', async () => {
    await db.query('delete from auth.users where id = $1', [userA]);
    assert.deepEqual(await rows('select * from public.relocation_profiles where user_id = $1', [userA]), []);
    assert.deepEqual(await rows('select * from public.recommendation_runs where user_id = $1', [userA]), []);
    assert.deepEqual(await rows('select * from public.subscriptions where user_id = $1', [userA]), []);
  });

  await t.test('click telemetry is insert-only for browsers and constrained like the API', async () => {
    const insert = (region, x) => db.query(`insert into public.hci_click_events
      (session_id, elapsed_ms, region, target, x, y, viewport_width, viewport_height, paint_ms, response_ms)
      values ('6f1c2d3e-4b5a-4c6d-8e7f-001122334455', 1000, $1, 'Pekerjaan', $2, $2, 1280, 720, 16, null)`, [region, x]);
    await db.exec('set role anon');
    try {
      await insert('categories', 0.5);
      await assert.rejects(insert('Bad Region', 0.5), /check constraint/);
      await assert.rejects(insert('map', 2), /check constraint/);
      await assert.rejects(rows('select * from public.hci_click_events'), /permission denied/);
      await assert.rejects(rows('select * from public.hci_region_summary'), /permission denied/);
    } finally {
      await db.exec('reset role');
    }
    assert.deepEqual(await rows('select region, clicks, response_timeouts from public.hci_region_summary'),
      [{ region: 'categories', clicks: 1, response_timeouts: 1 }]);
  });
});
