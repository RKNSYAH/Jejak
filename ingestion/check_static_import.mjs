// Runs only an isolated in-memory PostgreSQL/PostGIS database. No env credentials.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyMigrations, asRole, createDatabase } from '../supabase/tests/bootstrap.mjs';

export async function checkStaticImport(folder) {
  const manifest = JSON.parse(await readFile(resolve(folder, 'manifest.json'), 'utf8'));
  const { report } = manifest;
  const sql = await readFile(resolve(folder, 'import.sql'), 'utf8');
  const source = await readFile(resolve(folder, 'source.xlsx'));
  assert.equal(createHash('sha256').update(source).digest('hex'), report.workbook_sha256, 'source copy hash');
  assert.equal(manifest.rows.length, report.input_rows, 'manifest count');
  assert.equal(report.prepared_rows + (report.baseline_rows ?? 0) + report.review_rows, report.input_rows, 'every row has a disposition');
  const contract = JSON.parse(await readFile(new URL('./static_research_contract.json', import.meta.url), 'utf8'));
  const tables = Object.keys(contract.tables);
  const db = await createDatabase();
  try {
    await applyMigrations(db);
    // A test-only polygon and IDs must survive both imports. No fabricated
    // geometry is ever put into the generated import artifact.
    await db.exec(`insert into public.regions(region_code,region_name,region_type,parent_region_code)
      values ('indonesia','Indonesia','country',null), ('dki-jakarta','DKI Jakarta','province','indonesia'),
        ('jakarta-selatan','Jakarta Selatan','city','dki-jakarta');`);
    const seeded = (await db.query(`insert into public.regions
      (region_code,region_name,region_type,parent_region_code,geometry,source_name,source_updated_at,source_url,source_urls)
      values ('jakarta-selatan-setiabudi','Setiabudi','district','jakarta-selatan',
        extensions.ST_Multi(extensions.ST_GeomFromText(
          'POLYGON((106.8 -6.2,106.81 -6.2,106.81 -6.21,106.8 -6.2))',4326)),
        'Trusted boundary dataset','2026-01-01','https://example.test/boundary','["https://example.test/boundary"]')
      returning id, extensions.ST_AsEWKT(geometry) as geometry, source_name, source_updated_at, source_url, source_urls`)).rows[0];

    await assert.rejects(db.exec(sql), /explicit workbook hash approval/);
    await db.exec('rollback');
    assert.equal((await db.query('select count(*)::int as n from private.static_import_batches')).rows[0].n, 0);
    await db.query("select set_config('jejak.static_import_approved_sha256', $1, false)", [report.workbook_sha256]);
    const counts = async () => {
      const result = {};
      for (const table of tables) {
        result[table] = (await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n;
      }
      return result;
    };
    await asRole(db, 'service_role', () => db.exec(sql));
    const firstCounts = await counts();
    const firstIds = {};
    for (const table of tables) {
      firstIds[table] = (await db.query(`select array_agg(id order by id) as ids from public.${table}`)).rows[0].ids;
      assert.equal(firstCounts[table], (report.sheets[table]?.prepared ?? 0) + (report.sheets[table]?.baseline ?? 0), `${table}: eligible rows only`);
    }
    await asRole(db, 'service_role', () => db.exec(sql));
    assert.deepEqual(await counts(), firstCounts, 'repeat import creates no additional rows');
    for (const table of tables) {
      assert.deepEqual((await db.query(`select array_agg(id order by id) as ids from public.${table}`)).rows[0].ids,
        firstIds[table], `${table}: repeat import retains IDs`);
    }
    const current = (await db.query(`select id, extensions.ST_AsEWKT(geometry) as geometry, source_name, source_updated_at, source_url, source_urls
      from public.regions where region_code='jakarta-selatan-setiabudi'`)).rows[0];
    assert.deepEqual(current, seeded, 'catalog upsert preserves stored geometry, provenance and ID');
    const staged = (await db.query(`select status,count(*)::int as n from private.static_import_rows
      group by status order by status`)).rows;
    const expectedStage = [
      { status: 'baseline', n: report.baseline_rows ?? 0 },
      { status: 'prepared', n: report.prepared_rows },
      { status: 'review', n: report.review_rows },
    ].filter((group) => group.n > 0);
    assert.deepEqual(staged, expectedStage);
    if (report.include_review_as_baseline) {
      const housing = (await db.query('select * from public.housing_statistics order by id limit 1')).rows[0];
      assert.equal(housing.evidence_type, 'derived');
      assert.equal(housing.period_start, null);
      assert.equal(housing.period_end, null);
      assert.ok(housing.limitations.includes('Static research baseline'));
      const wage = (await db.query("select * from public.wages_income where region_code='dki-jakarta'")).rows[0];
      assert.equal(wage.period_end, null, 'mixed 2025/2026 wages do not assert a shared year');
      assert.equal(wage.evidence_type, 'estimated');
      const unclassified = (await db.query("select * from public.regions where region_type='unclassified_area'")).rows[0];
      assert.equal(unclassified.is_supported, false);
      assert.equal(unclassified.geometry, null);
      assert.equal(unclassified.kemendagri_code, null);
    }

    const unnamed = (await db.query(`select p.osm_type,p.osm_id,r.id as region_id,r.parent_id as district_id,parent.region_code
      from public.public_places p join public.regions r using(region_code)
      join public.regions parent on parent.id=r.parent_id
      where r.region_type='neighborhood' and parent.region_type='district' and p.place_name is null and p.is_active
      order by p.id limit 1`)).rows[0];
    assert.ok(unnamed, 'an unnamed kelurahan feature is preserved');
    await asRole(db, 'anon', async () => {
      const places = (await db.query('select * from public.get_public_places($1)', [unnamed.district_id])).rows;
      const place = places.find((p) => p.osm_type === unnamed.osm_type && p.osm_id === unnamed.osm_id);
      assert.ok(place?.name.includes('tanpa nama'), 'presentation fallback does not invent a source name');
      assert.equal(place.region_id, unnamed.region_id, 'actual kelurahan identity is retained');
      const detail = (await db.query('select * from public.get_map_region($1,false,false)', [unnamed.region_code])).rows[0];
      assert.ok(detail.places.some((p) => p.osm_type === unnamed.osm_type && p.osm_id === unnamed.osm_id), 'district map includes child places');
      await assert.rejects(db.query('select * from public.living_cost_rates'), /permission denied/);
      await assert.rejects(db.query('select * from public.monthly_budgets'), /permission denied/);
      await assert.rejects(db.query('select * from private.static_import_rows'), /permission denied/);
    });
    // A new batch must disappear entirely on a late failure, not merely leave
    // unchanged counts after upserting the same batch again. Accept LF/CRLF.
    const stagedBefore = (await db.query('select count(*)::int as n from private.static_import_rows')).rows[0].n;
    const failureHash = 'b'.repeat(64);
    await db.query("select set_config('jejak.static_import_approved_sha256', $1, false)", [failureHash]);
    const broken = sql.replaceAll(report.workbook_sha256, failureHash)
      .replace(/commit;\s*$/i, "select 1 / 0;\ncommit;\n");
    assert.ok(broken.includes('select 1 / 0;'), 'late failure was actually injected');
    await assert.rejects(db.exec(broken), /division by zero/);
    await db.exec('rollback');
    assert.deepEqual(await counts(), firstCounts, 'late failure rolls back the entire import');
    assert.equal((await db.query('select count(*)::int as n from private.static_import_rows')).rows[0].n, stagedBefore);
    assert.equal((await db.query('select count(*)::int as n from private.static_import_batches where workbook_sha256=$1', [failureHash])).rows[0].n, 0);
    const verification = {
      passed: true, database: 'isolated in-memory PGlite/PostGIS', remote_writes: false,
      workbook_sha256: report.workbook_sha256, prepared_rows: report.prepared_rows, review_rows: report.review_rows,
      baseline_rows: report.baseline_rows ?? 0, import_rows: report.import_rows ?? report.prepared_rows,
      import_sql_sha256: createHash('sha256').update(sql).digest('hex'),
      target_counts: firstCounts, checks: ['approval guard', 'service-role import', 'row reconciliation',
        'repeat-import IDs', 'existing geometry/provenance preservation', 'unnamed child-place RPC reads',
        'browser access denied', 'late-failure rollback'],
    };
    await writeFile(resolve(folder, 'local-verification.json'), `${JSON.stringify(verification, null, 2)}\n`);
    return verification;
  } finally {
    await db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    console.log(JSON.stringify(await checkStaticImport(process.argv[2] ?? 'ingestion/data/prepared/static_research'), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
