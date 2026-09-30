import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { postgis } from '@electric-sql/pglite-postgis';

test('boundary persistence RPC', async (t) => {
  const db = new PGlite({ extensions: { pgcrypto, postgis } });
  t.after(() => db.close());
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
  const folder = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(folder)).filter((file) => file.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, folder), 'utf8'));
  }
  await db.exec(`
    insert into public.regions (region_code, region_name, region_type, is_supported)
    values ('boundary-city', 'Boundary City', 'city', true);
    insert into public.regions (region_code, region_name, parent_region_code, region_type, source_name, is_supported)
    values ('boundary-district', 'Boundary District', 'boundary-city', 'district', 'Catalogue source', true);
  `);
  const boundary = { type: 'MultiPolygon', coordinates: [[[[106, -6], [107, -6], [107, -5], [106, -6]]]] };
  const store = (code, geometry) => db.query(
    'select public.store_region_boundary($1, $2::jsonb)',
    [code, JSON.stringify(geometry)],
  );
  const read = async () => (await db.query(`select extensions.ST_AsGeoJSON(geometry)::jsonb as geometry,
    extensions.ST_SRID(geometry) as srid, source_name, updated_at
    from public.regions where region_code = 'boundary-district'`)).rows[0];

  await t.test('only service_role can execute; function is security invoker', async () => {
    const { rows } = await db.query(`select
      has_function_privilege('anon', 'public.store_region_boundary(text,jsonb)', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'public.store_region_boundary(text,jsonb)', 'EXECUTE') as authenticated,
      has_function_privilege('service_role', 'public.store_region_boundary(text,jsonb)', 'EXECUTE') as service,
      p.prosecdef as security_definer
      from pg_catalog.pg_proc p where p.oid = 'public.store_region_boundary(text,jsonb)'::regprocedure`);
    assert.deepEqual(rows[0], { anon: false, authenticated: false, service: true, security_definer: false });
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await assert.rejects(store('boundary-district', boundary), /permission denied/);
      } finally {
        await db.exec('reset role');
      }
    }
  });

  await db.exec('set role service_role');
  await t.test('valid geometry is stored and catalogue provenance is preserved', async () => {
    await store('boundary-district', boundary);
    const stored = await read();
    assert.deepEqual(stored.geometry, boundary);
    assert.equal(stored.srid, 4326);
    assert.equal(stored.source_name, 'Catalogue source');
  });

  await t.test('existing boundaries are never overwritten', async () => {
    const before = await read();
    await store('boundary-district', { type: 'MultiPolygon', coordinates: [[[[108, -7], [109, -7], [109, -6], [108, -7]]]] });
    assert.deepEqual(await read(), before);
  });

  await t.test('invalid types, empty, invalid topology, 3D and wrong SRID are rejected', async () => {
    const invalid = [
      null,
      { type: 'FeatureCollection', features: [] },
      { type: 'Polygon', coordinates: boundary.coordinates[0] },
      { type: 'MultiPolygon', coordinates: [] },
      { type: 'MultiPolygon', coordinates: [[[[106, -6], [107, -5], [107, -6], [106, -5], [106, -6]]]] },
      { type: 'MultiPolygon', coordinates: [[[[106, -6, 0], [107, -6, 0], [107, -5, 0], [106, -6, 0]]]] },
      { ...boundary, crs: { type: 'name', properties: { name: 'EPSG:3857' } } },
    ];
    for (const geometry of invalid) {
      await assert.rejects(store('boundary-district', geometry), /Expected MultiPolygon|Invalid boundary/);
    }
    assert.deepEqual((await read()).geometry, boundary);
  });

  await t.test('unknown districts and non-district targets are rejected without inserts', async () => {
    await assert.rejects(store('missing-district', boundary), /Unknown district/);
    await assert.rejects(store('boundary-city', boundary), /Unknown district/);
    assert.equal((await db.query('select count(*)::integer as count from public.regions')).rows[0].count, 2);
  });
  await db.exec('reset role');

  await t.test('existing map RPC reads saved geometry', async () => {
    await db.exec('set role authenticated');
    try {
      const { rows } = await db.query(`select geometry from public.get_map_region('boundary-district', false, true)`);
      assert.deepEqual(rows[0].geometry, boundary);
    } finally {
      await db.exec('reset role');
    }
  });
});
