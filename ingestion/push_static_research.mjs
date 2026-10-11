// Operator workflow for this reviewed workbook. Backup/verify are read-only remotely.
// Promotion requires explicit target and workbook hash, and a tested scoped backup.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { createDatabase } from '../supabase/tests/bootstrap.mjs';

const run = promisify(execFile);
const bun = process.env.BUN_EXECUTABLE ?? (process.versions.bun ? process.execPath :
  process.platform === 'win32' ? resolve(process.env.APPDATA, 'npm/node_modules/bun/bin/bun.exe') : 'bun');
const folder = resolve('ingestion/data/prepared/static_research');
const backupFolder = resolve(folder, 'remote-backup');
const contract = JSON.parse(await readFile('ingestion/static_research_contract.json', 'utf8'));
const migrationFile = '20261001100106_prepare_static_research_import.sql';
const version = migrationFile.split('_')[0];
const name = 'prepare_static_research_import';
const tables = [...Object.keys(contract.tables), 'sector_mapping'];
const oldTables = tables.filter((t) => !['living_cost_rates', 'monthly_budgets'].includes(t));
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => quote(JSON.stringify(value)) + '::jsonb';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const snapshotExpr = (names) => `jsonb_build_object(${names.map((t) => `${quote(t)},(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.${t} r)`).join(',')})`;
const fingerprintExpr = (names) => `md5((${snapshotExpr(names)})::text)`;

async function query(project, sql, label) {
  const file = resolve(backupFolder, `${label}.sql`);
  await writeFile(file, "set time zone 'UTC';\n" + sql, 'utf8');
  // Use the CLI's existing authentication; never print or read its access token.
  const result = await run(bun, ['x', 'supabase', 'db', 'query', '--linked', '--project-ref', project,
    '-o', 'json', '--file', file], { maxBuffer: 128 * 1024 * 1024, timeout: 180000 });
  const parsed = JSON.parse(result.stdout);
  await writeFile(resolve(backupFolder, `${label}.json`), JSON.stringify(parsed, null, 2) + '\n');
  assert.ok(Array.isArray(parsed.rows), `${label}: expected a row result`);
  return parsed.rows;
}

function restoreDataSql(backup, expectedFingerprint) {
  const rows = backup.data.regions.map((r) => ({ ...r, source_urls: [], source_url: null,
    code_source_name: null, code_source_url: null }));
  const columns = Object.keys(rows[0]);
  const deletes = tables.filter((t) => t !== 'regions').reverse().map((t) => `delete from public.${t};`);
  return `-- SCOPED DATA RESTORE, NOT A FULL PROJECT RESTORE. Manual approval required.
-- Leaves additive schema, import audit and migration history intact. No auth/user data touched.
begin;
set local search_path = pg_catalog;
set local time zone 'UTC';
set local lock_timeout = '10s';
set local statement_timeout = '120s';
select pg_advisory_xact_lock(hashtextextended('jejak:static-import',0));
lock table ${tables.map((t) => `public.${t}`).join(',')} in share row exclusive mode;
do $$ begin
  if current_setting('jejak.static_restore_approved_sha256',true) is distinct from ${quote(backup.workbook_sha256)} then
    raise exception 'Restore requires explicit hash approval';
  end if;
  if ${fingerprintExpr(tables)} <> ${quote(expectedFingerprint)} then
    raise exception 'Affected data changed after import; reconcile changes before restore';
  end if;
end $$;
${deletes.join('\n')}
alter table public.regions disable trigger regions_updated_at_trg;
insert into public.regions (${columns.join(',')})
select ${columns.join(',')} from jsonb_populate_recordset(null::public.regions,${json(rows)})
on conflict (id) do update set ${columns.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',')};
alter table public.regions enable trigger regions_updated_at_trg;
do $$ declare affected integer; begin loop
  delete from public.regions r where r.id not in (${rows.map((r) => r.id).join(',')})
    and not exists (select 1 from public.regions child where child.parent_id=r.id or child.parent_region_code=r.region_code);
  get diagnostics affected = row_count;
  exit when affected=0;
end loop; end $$;
do $$ begin
  if (select count(*) from public.regions) <> ${rows.length} then raise exception 'Region restore incomplete'; end if;
end $$;
commit;
`;
}

function promotionSql(backup, migration, importSql, project, approvalHash) {
  const guard = `lock table ${oldTables.map((t) => `public.${t}`).join(',')} in share row exclusive mode;
    do $$ begin if ${fingerprintExpr(oldTables)} <> ${quote(backup.fingerprint)} then
      raise exception 'Affected data changed after backup; stop promotion'; end if; end $$;`;
  // Explicit transaction: schema, approval latch and import. The direct CLI
  // records migration history after COMMIT, then reconciliation verifies it.
  return migration.replace('begin;', () => `begin; set local time zone 'UTC'; set local lock_timeout='10s'; set local statement_timeout='120s'; ${guard}`)
    .replace(/commit;\s*$/, '') +
    `
     set local jejak.static_import_approved_sha256=${quote(approvalHash)};
     set local role service_role;\n` +
    importSql.replace(/^begin;$/m, '').replace(/^commit;$/m, 'reset role;\ncommit;') +
    `select ${quote(project)} as project_ref, ${quote(approvalHash)} as workbook_sha256, true as committed;`;
}

const [action, project, approvalHash] = process.argv.slice(2);
assert.ok(['backup', 'verify', 'promote', 'reconcile'].includes(action), 'Use backup|verify|promote|reconcile PROJECT_REF WORKBOOK_SHA256');
assert.match(project ?? '', /^[a-z]{20}$/, 'Explicit project ref required');
const manifest = JSON.parse(await readFile(resolve(folder, 'manifest.json'), 'utf8'));
const verification = JSON.parse(await readFile(resolve(folder, 'local-verification.json'), 'utf8'));
const report = manifest.report;
assert.equal(approvalHash, report.workbook_sha256, 'Explicit workbook hash required');
assert.equal(hash(await readFile('public/Jejak_Static_Data_Research_Completed.xlsx')), approvalHash);
assert.equal(verification.passed, true);
assert.equal(verification.import_sql_sha256, hash(await readFile(resolve(folder, 'import.sql'))));
assert.equal(report.review_rows, 0, 'No structurally invalid rows may be promoted');
assert.equal(report.import_rows, report.input_rows);
assert.equal((await readFile('supabase/.temp/project-ref', 'utf8')).trim(), project, 'Linked project mismatch');
await mkdir(backupFolder, { recursive: true });

if (action === 'backup') {
  const [backup] = await query(project, `select now() as captured_at, current_database() as database,
    pg_database_size(current_database()) as database_bytes,
    ${snapshotExpr(oldTables)} as data, ${fingerprintExpr(oldTables)} as fingerprint,
    (select jsonb_agg(to_jsonb(m) order by version) from supabase_migrations.schema_migrations m) as migrations,
    pg_get_viewdef('private.static_region_facts'::regclass,true) as static_view,
    (select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'sql',pg_get_functiondef(p.oid),'acl',p.proacl::text))
      from pg_proc p where p.oid in ('public.get_map_region(text,boolean,boolean)'::regprocedure,
        'public.get_public_places(integer,character varying)'::regprocedure)) as rpc_definitions,
    (select jsonb_agg(to_jsonb(c)) from information_schema.columns c
      where c.table_schema='public' and c.table_name in (${oldTables.map(quote).join(',')})) as columns;`, 'pre-import');
  assert.ok(backup.data.regions.length > 0);
  for (const t of oldTables.filter((t) => t !== 'regions')) assert.equal(backup.data[t].length, 0,
    `${t}: this initial-load restore workflow requires empty destinations`);
  assert.ok(!backup.migrations.some((m) => m.version === version), 'Migration already applied; do not overwrite pre-import backup');
  backup.project_ref = project;
  backup.workbook_sha256 = approvalHash;
  backup.migration_sha256 = hash(await readFile(resolve('supabase/migrations', migrationFile)));
  await writeFile(resolve(backupFolder, 'backup.json'), JSON.stringify(backup, null, 2) + '\n');
  await mkdir(resolve(backupFolder, 'migrations'), { recursive: true });
  for (const file of (await readdir('supabase/migrations')).filter((f) => f.endsWith('.sql') && f !== migrationFile)) {
    assert.ok(backup.migrations.some((m) => m.version === file.split('_')[0]), `${file}: not applied remotely`);
    await writeFile(resolve(backupFolder, 'migrations', file), await readFile(resolve('supabase/migrations', file)));
  }
  console.log(JSON.stringify({ backup: backupFolder, regions: backup.data.regions.length,
    boundaries: backup.data.regions.filter((r) => r.geometry !== null).length, remote_writes: false }, null, 2));
} else {
  const backup = JSON.parse(await readFile(resolve(backupFolder, 'backup.json'), 'utf8'));
  assert.equal(backup.project_ref, project);
  assert.equal(backup.workbook_sha256, approvalHash);
  const migration = await readFile(resolve('supabase/migrations', migrationFile), 'utf8');
  assert.equal(backup.migration_sha256, hash(migration));
  if (action === 'verify') {
    const db = await createDatabase();
    try {
      for (const file of (await readdir(resolve(backupFolder, 'migrations'))).sort()) {
        await db.exec(await readFile(resolve(backupFolder, 'migrations', file), 'utf8'));
      }
      await db.exec("set time zone 'UTC'");
      // Fresh fixtures do not contain live region IDs. Restore the entire catalog.
      await db.exec('delete from public.regions');
      const columns = Object.keys(backup.data.regions[0]);
      await db.exec(`insert into public.regions (${columns.join(',')}) select ${columns.join(',')}
        from jsonb_populate_recordset(null::public.regions,${json(backup.data.regions)});
        select setval('public.regions_id_seq',(select max(id) from public.regions));`);
      const local = (await db.query(`select ${snapshotExpr(oldTables)} as data, ${fingerprintExpr(oldTables)} as fingerprint`)).rows[0];
      await writeFile(resolve(backupFolder, 'local-pre-import.json'), JSON.stringify(local, null, 2) + '\n');
      assert.deepEqual(local.data, backup.data, 'Live pre-import rows must restore unchanged locally');
      await db.exec(`create schema supabase_migrations; create table supabase_migrations.schema_migrations
        (version text primary key, name text, statements text[]);`);
      const combined = promotionSql(backup, migration, await readFile(resolve(folder, 'import.sql'), 'utf8'), project, approvalHash);
      // The exact remote envelope must work locally, not just its separate parts.
      await assert.rejects(db.exec(combined.replace(/^commit;$/m, 'select 1/0;\ncommit;')), /division by zero/);
      await db.exec('rollback');
      assert.equal((await db.query("select to_regclass('private.static_import_batches') as table_name")).rows[0].table_name, null,
        'A late failure rolls back schema as well as imported data');
      await db.exec(combined);
      // With explicit transaction control the CLI records the version only after
      // COMMIT. Reconcile that history independently after the direct push.
      await db.exec(`insert into supabase_migrations.schema_migrations(version,name,statements) values
        (${quote(version)},${quote(name)},array[${quote(migration)}]);`);
      assert.equal((await db.query('select version from supabase_migrations.schema_migrations')).rows[0].version, version);
      const fingerprint = (await db.query(`select ${fingerprintExpr(tables)} as fingerprint`)).rows[0].fingerprint;
      const restore = restoreDataSql(backup, fingerprint);
      await assert.rejects(db.exec(restore), /explicit hash approval/);
      await db.exec('rollback');
      await db.exec(`set jejak.static_restore_approved_sha256=${quote(approvalHash)};`);
      await db.exec(restore);
      const restored = (await db.query(`select ${snapshotExpr(oldTables)} as data`)).rows[0].data;
      for (const row of restored.regions) {
        for (const key of ['source_urls', 'source_url', 'code_source_name', 'code_source_url']) delete row[key];
      }
      assert.deepEqual(restored, backup.data, 'Scoped restore returns every original row/ID/boundary/provenance');
      const result = { passed: true, remote_writes: false, backup_sha256: hash(await readFile(resolve(backupFolder, 'backup.json'))),
        import_sql_sha256: verification.import_sql_sha256, migration_sha256: backup.migration_sha256,
        checks: ['live catalog restore', 'schema plus data late-failure rollback', 'baseline import on live IDs',
          'restore approval guard', 'complete scoped data rollback'] };
      await writeFile(resolve(backupFolder, 'restore-verification.json'), JSON.stringify(result, null, 2) + '\n');
      console.log(JSON.stringify(result, null, 2));
    } finally { await db.close(); }
  } else if (action === 'promote') {
    const restored = JSON.parse(await readFile(resolve(backupFolder, 'restore-verification.json'), 'utf8'));
    assert.equal(restored.passed, true);
    assert.equal(restored.backup_sha256, hash(await readFile(resolve(backupFolder, 'backup.json'))));
    assert.equal(restored.import_sql_sha256, verification.import_sql_sha256);
    const importSql = await readFile(resolve(folder, 'import.sql'), 'utf8');
    // The Management API rejects this 24 MB artifact. Use the authenticated CLI's
    // direct connection and explicit transaction instead. The CLI writes history
    // after COMMIT; reconcile both. The disposable folder has no other changes.
    const deployment = resolve(backupFolder, 'deployment');
    await mkdir(resolve(deployment, 'supabase/migrations'), { recursive: true });
    await mkdir(resolve(deployment, 'supabase/.temp'), { recursive: true });
    await writeFile(resolve(deployment, 'supabase/config.toml'), await readFile('supabase/config.toml'));
    for (const file of ['project-ref', 'pooler-url']) {
      await writeFile(resolve(deployment, 'supabase/.temp', file), await readFile(resolve('supabase/.temp', file)));
    }
    for (const file of (await readdir(resolve(backupFolder, 'migrations'))).sort()) {
      await writeFile(resolve(deployment, 'supabase/migrations', file), await readFile(resolve(backupFolder, 'migrations', file)));
    }
    const combined = promotionSql(backup, migration, importSql, project, approvalHash);
    await writeFile(resolve(deployment, 'supabase/migrations', migrationFile), combined);
    const args = ['x', 'supabase', 'db', 'push', '--linked', '--project-ref', project,
      '--skip-vault', '--workdir', deployment, '--yes'];
    const preview = await run(bun, [...args, '--dry-run'], { maxBuffer: 4 * 1024 * 1024, timeout: 120000 });
    assert.ok(preview.stdout.includes(migrationFile), 'Approved migration must be the pending change');
    // The deployed artifact is generated privately, never written into the repo's
    // historical schema-only migration or used to push unrelated working changes.
    await writeFile(resolve(backupFolder, 'direct-dry-run.txt'), preview.stdout + preview.stderr);
    const pushed = await run(bun, args, { maxBuffer: 4 * 1024 * 1024, timeout: 180000 });
    await writeFile(resolve(backupFolder, 'direct-promotion.txt'), pushed.stdout + pushed.stderr);
    console.log(pushed.stdout);
  } else {
    const [result] = await query(project, `select ${snapshotExpr(tables)} as data,
      ${fingerprintExpr(tables)} as fingerprint,
      (select count(*)::int from private.static_import_rows where workbook_sha256=${quote(approvalHash)}
        and method_version=${quote(report.method_version)}) as staged_rows,
      (select jsonb_object_agg(status,n) from (select status,count(*)::int as n from private.static_import_rows
        where workbook_sha256=${quote(approvalHash)} and method_version=${quote(report.method_version)} group by status) s) as stage_status;`, 'post-import');
    assert.equal(result.staged_rows, report.input_rows);
    assert.deepEqual(result.stage_status, { prepared: report.prepared_rows, baseline: report.baseline_rows });
    for (const t of Object.keys(contract.tables).filter((t) => t !== 'regions')) {
      assert.equal(result.data[t].length, (report.sheets[t]?.prepared ?? 0) + (report.sheets[t]?.baseline ?? 0), `${t}: row reconciliation`);
    }
    const identity = (t, row) => {
      if (t === 'campuses' && row.osm_id === null) return JSON.stringify(['non_osm', row.institution_code, row.campus_name]);
      const values = { ...row, program_identity: row.program_code ? `code:${row.program_code}` :
        row.program_name ? `name:${row.program_name}` : null };
      return JSON.stringify(contract.tables[t].key.split(' ').map((key) => values[key] ?? null));
    };
    const catalogs = Object.fromEntries(Object.keys(contract.tables).map((t) => [t,
      new Map(result.data[t].map((row) => [identity(t, row), row]))]));
    for (const entry of manifest.rows) {
      const t = entry.target_table;
      const actual = catalogs[t].get(identity(t, entry.payload));
      assert.ok(actual, `${entry.sheet}:${entry.row_number}: destination identity`);
      for (const [field, value] of Object.entries(entry.payload)) {
        if (t === 'regions' && actual.geometry !== null &&
            ['source_name', 'source_updated_at', 'source_url', 'source_urls'].includes(field)) continue;
        if (['latitude', 'longitude'].includes(field) && typeof value === 'number') {
          assert.ok(Math.abs(actual[field] - value) <= 1e-10, `${entry.sheet}:${entry.row_number}:${field}: float representation`);
        } else {
          assert.deepEqual(actual[field], value, `${entry.sheet}:${entry.row_number}:${field}: payload reconciles`);
        }
      }
    }
    for (const before of backup.data.regions) {
      const after = result.data.regions.find((r) => r.id === before.id);
      assert.ok(after, `${before.region_code}: ID preserved`);
      assert.equal(after.region_code, before.region_code);
      assert.deepEqual(after.geometry, before.geometry);
      assert.equal(after.is_sample, before.is_sample);
      if (before.geometry !== null) {
        assert.equal(after.source_name, before.source_name);
        assert.equal(after.source_updated_at, before.source_updated_at);
      }
    }
    const [safety] = await query(project, `select
      (select bool_and(extensions.ST_AsEWKB(r.geometry)=extensions.ST_AsEWKB(b.geometry))
        from public.regions r join jsonb_populate_recordset(null::public.regions,
          ${json(backup.data.regions.filter((r) => r.geometry !== null))}) b using(id)) as exact_boundary_bytes,
      not has_table_privilege('anon','private.static_import_rows','select') as audit_anon_denied,
      not has_table_privilege('authenticated','private.static_import_rows','select') as audit_authenticated_denied,
      not has_table_privilege('anon','public.monthly_budgets','select') as scenario_anon_denied,
      not has_table_privilege('authenticated','public.monthly_budgets','insert') as scenario_browser_write_denied,
      (select bool_and(relrowsecurity) from pg_class where oid in (
        'public.living_cost_rates'::regclass,'public.monthly_budgets'::regclass,
        'private.static_import_rows'::regclass,'private.static_import_batches'::regclass)) as new_tables_rls,
      (select count(*)::int from public.housing_statistics where period_end is null and evidence_type='derived') as undated_derived_housing,
      (select count(*)::int from public.institutions where is_active is null) as unknown_institution_activity,
      (select count(*)::int from supabase_migrations.schema_migrations where version=${quote(version)}) as migration_recorded;`, 'safety');
    for (const field of ['exact_boundary_bytes', 'audit_anon_denied', 'audit_authenticated_denied',
      'scenario_anon_denied', 'scenario_browser_write_denied', 'new_tables_rls']) assert.equal(safety[field], true, field);
    assert.equal(safety.undated_derived_housing, 77);
    assert.equal(safety.unknown_institution_activity, 114);
    assert.equal(safety.migration_recorded, 1);
    await writeFile(resolve(backupFolder, 'restore-data.sql'), restoreDataSql(backup, result.fingerprint));
    const summary = { passed: true, project_ref: project, staged_rows: result.staged_rows, stage_status: result.stage_status,
      destination_counts: Object.fromEntries(Object.entries(result.data).map(([t, rows]) => [t, rows.length])),
      preserved_region_ids: backup.data.regions.length,
      preserved_boundaries: backup.data.regions.filter((r) => r.geometry !== null).length,
      safety,
      restore_file: resolve(backupFolder, 'restore-data.sql') };
    await writeFile(resolve(folder, 'remote-verification.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary, null, 2));
  }
}
