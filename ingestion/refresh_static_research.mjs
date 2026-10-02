// Scoped refresh of the approved education/housing workbook. No schema changes.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { applyMigrations, createDatabase } from '../supabase/tests/bootstrap.mjs';

try {
const run = promisify(execFile);
const [action, project, approval, inputFolder] = process.argv.slice(2);
assert.ok(['backup', 'verify', 'promote', 'reconcile'].includes(action));
assert.match(project ?? '', /^[a-z]{20}$/);
const folder = resolve(inputFolder);
assert.ok(folder.startsWith(resolve('ingestion/data/prepared') + '\\') ||
  folder.startsWith(resolve('ingestion/data/prepared') + '/'), 'Private artifact folder required');
const remote = resolve(folder, 'refresh-backup');
await mkdir(remote, { recursive: true });
const hash = (value) => createHash('sha256').update(value).digest('hex');
const quote = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => quote(JSON.stringify(value)) + '::jsonb';
const contract = JSON.parse(await readFile('ingestion/static_research_contract.json', 'utf8'));
const targets = ['education_facilities', 'housing_statistics'];
const all = [...Object.keys(contract.tables), 'sector_mapping'];
const untouched = all.filter((t) => !targets.includes(t));
const manifest = JSON.parse(await readFile(resolve(folder, 'manifest.json'), 'utf8'));
const prior = JSON.parse(await readFile('ingestion/data/prepared/static_research/manifest.json', 'utf8'));
assert.equal(manifest.report.workbook_sha256, approval);
assert.equal(hash(await readFile('public/Jejak_Static_Data_Research_Completed.xlsx')), approval);
assert.equal((await readFile('supabase/.temp/project-ref', 'utf8')).trim(), project);
assert.equal(manifest.report.review_rows, 0);
assert.ok(manifest.rows.every((r) => targets.includes(r.target_table)));
assert.equal(manifest.report.input_rows, manifest.rows.length);
const identity = (t, row) => JSON.stringify(contract.tables[t].key.split(' ').map((k) => row[k] ?? null));
const snapshot = (t) => `(select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]'::jsonb) from public.${t} r)`;
const fingerprints = (names) => `jsonb_build_object(${names.map((t) => `${quote(t)},md5(${snapshot(t)}::text)`).join(',')})`;
const stateSql = `select jsonb_build_object(${['regions', ...targets].map((t) => `${quote(t)},${snapshot(t)}`).join(',')}) as data,
  ${fingerprints(all)} as fingerprints;`;
const bun = process.env.BUN_EXECUTABLE ?? resolve(process.env.APPDATA, 'npm/node_modules/bun/bin/bun.exe');
async function query(sql, label) {
  const file = resolve(remote, `${label}.sql`);
  await writeFile(file, "set time zone 'UTC';\n" + sql);
  const result = await run(bun, ['x', 'supabase', 'db', 'query', '--linked', '--project-ref', project,
    '-o', 'json', '--file', file], { maxBuffer: 128 * 1024 * 1024, timeout: 180000 });
  const parsed = JSON.parse(result.stdout);
  await writeFile(resolve(remote, `${label}.json`), JSON.stringify(parsed, null, 2) + '\n');
  assert.ok(Array.isArray(parsed.rows), 'Expected query rows');
  return parsed.rows;
}

function checkRows(data) {
  for (const t of targets) {
    const entries = manifest.rows.filter((r) => r.target_table === t);
    assert.equal(data[t].length, entries.length, `${t}: no superseded duplicates`);
    const index = new Map(data[t].map((r) => [identity(t, r), r]));
    for (const entry of entries) {
      const actual = index.get(identity(t, entry.payload));
      assert.ok(actual, `${t}:${entry.row_number}: identity`);
      for (const [k, v] of Object.entries(entry.payload)) assert.deepEqual(actual[k], v, `${t}:${entry.row_number}:${k}`);
    }
  }
}

async function loadRows(db, data) {
  for (const t of ['regions', ...targets]) {
    const columns = Object.keys(data[t][0]);
    await db.exec(`insert into public.${t} (${columns.join(',')}) overriding system value select ${columns.join(',')}
      from jsonb_populate_recordset(null::public.${t},${json(data[t])});
      select setval('public.${t}_id_seq',(select max(id) from public.${t}));`);
  }
}

function restoreSql(backup, after) {
  return `-- Manual approval only. Restores scoped data, retaining import audit/history.
    begin; set local time zone 'UTC'; set local lock_timeout='10s'; set local statement_timeout='120s';
    select pg_advisory_xact_lock(hashtextextended('jejak:static-import',0));
    lock table ${targets.map((t) => `public.${t}`).join(',')} in share row exclusive mode;
    do $$ begin if current_setting('jejak.static_restore_approved_sha256',true) is distinct from ${quote(approval)} then
      raise exception 'Restore requires explicit approval'; end if;
      if ${fingerprints(targets)} <> ${json(Object.fromEntries(targets.map((t) => [t, after.fingerprints[t]])))} then
        raise exception 'Scoped rows changed after refresh'; end if; end $$;
    ${targets.map((t) => `delete from public.${t}; insert into public.${t} overriding system value select * from jsonb_populate_recordset(null::public.${t},${json(backup.data[t])});`).join('\n')}
    commit;`;
}

if (action === 'backup') {
  // Never replace a recovery snapshot, including after successful promotion.
  await assert.rejects(readFile(resolve(remote, 'backup.json')), { code: 'ENOENT' });
  const [state] = await query(stateSql, 'pre-refresh');
  const mappings = [];
  const drift = [];
  for (const t of targets) {
    const before = prior.rows.filter((r) => r.target_table === t);
    assert.equal(state.data[t].length, before.length, `${t}: unexpected live rows`);
    const index = new Map(state.data[t].map((r) => [identity(t, r), r]));
    for (const old of before) {
      const live = index.get(identity(t, old.payload));
      assert.ok(live, `${t}:${old.row_number}: original identity missing`);
      const changes = Object.fromEntries(Object.entries(old.payload).filter(([k, v]) =>
        JSON.stringify(live[k]) !== JSON.stringify(v)).map(([k, v]) => [k, { prior: v, live: live[k] }]));
      if (Object.keys(changes).length) drift.push({ table: t, row_number: old.row_number, changes });
      const next = manifest.rows.find((r) => r.target_table === t && r.row_number === old.row_number);
      assert.ok(next, 'Refresh does not delete existing rows');
      assert.equal(next.payload.region_code, old.payload.region_code, 'Row reordering requires explicit remapping');
      if (t === 'housing_statistics') assert.equal(next.payload.housing_type, old.payload.housing_type);
      mappings.push({ table: t, id: live.id, payload: next.payload });
    }
  }
  if (drift.length) {
    const reviewed = JSON.parse(await readFile(resolve(remote, 'reviewed-live-drift.json'), 'utf8'));
    assert.deepEqual(drift, reviewed, 'Unexpected live edits require review before replacing them');
  }
  const backup = { project, approval, captured_at: new Date().toISOString(), ...state, mappings,
    reviewed_live_drift: drift, import_hash: hash(await readFile(resolve(folder, 'import.sql'))), manifest_hash: hash(await readFile(resolve(folder, 'manifest.json'))) };
  await writeFile(resolve(remote, 'backup.json'), JSON.stringify(backup, null, 2) + '\n');
  console.log(JSON.stringify({ backed_up: targets, mapped_existing_ids: mappings.length, remote_writes: false }));
} else {
  const bytes = await readFile(resolve(remote, 'backup.json'));
  const backup = JSON.parse(bytes);
  assert.equal(backup.project, project);
  assert.equal(backup.approval, approval);
  assert.equal(backup.manifest_hash, hash(await readFile(resolve(folder, 'manifest.json'))));
  const importSql = await readFile(resolve(folder, 'import.sql'), 'utf8');
  assert.equal(backup.import_hash, hash(importSql));
  // Source labels are part of SQL uniqueness. Update the exact prior IDs first;
  // ordinary upsert alone would leave stale rows when a label changes.
  const updates = targets.map((t) => {
    const columns = Object.keys(backup.mappings.find((m) => m.table === t).payload);
    return `update public.${t} d set ${columns.map((c) => `${c}=p.${c}`).join(',')}
      from jsonb_to_recordset(${json(backup.mappings.filter((m) => m.table === t))}) m(id bigint,payload jsonb)
      cross join lateral jsonb_populate_record(null::public.${t},m.payload) p where d.id=m.id;`;
  }).join('\n');
  const guard = `lock table ${all.map((t) => `public.${t}`).join(',')} in share row exclusive mode;
    do $$ begin if ${fingerprints(all)} <> ${json(backup.fingerprints)} then
      raise exception 'Data changed after backup'; end if; end $$;`;
  const promotion = importSql.replace(/^begin;$/m, () => `begin; set local time zone 'UTC';
    set local lock_timeout='10s'; set local statement_timeout='120s';
    select pg_advisory_xact_lock(hashtextextended('jejak:static-import',0));
    ${guard}
    set local jejak.static_import_approved_sha256=${quote(approval)};
    set local role service_role;
    ${updates}`).replace(/^commit;$/m, `reset role; commit;\nselect true as committed;`);
  await writeFile(resolve(remote, 'promotion.sql'), promotion);

  if (action === 'verify') {
    const db = await createDatabase();
    try {
      await applyMigrations(db);
      await db.exec("set time zone 'UTC'");
      // Restore only the scoped destinations and their actual region catalog.
      await loadRows(db, backup.data);
      const local = (await db.query(stateSql)).rows[0];
      assert.deepEqual(local.data, backup.data, 'Live scoped backup restores exactly');
      const localSql = promotion.replace(json(backup.fingerprints), () => json(local.fingerprints));
      await assert.rejects(db.exec(promotion.replace(json(backup.fingerprints), () => json({}))), /Data changed after backup/);
      await db.exec('rollback');
      await assert.rejects(db.exec(localSql.replace('reset role; commit;', 'select 1/0; reset role; commit;')), /division by zero/);
      await db.exec('rollback; reset role;');
      assert.deepEqual((await db.query(stateSql)).rows[0], local, 'Late failure rolls back all scoped updates');
      assert.equal((await db.query('select count(*)::int as n from private.static_import_batches')).rows[0].n, 0);
      await db.exec(localSql);
      const after = (await db.query(stateSql)).rows[0];
      checkRows(after.data);
      assert.deepEqual(after.data.regions, backup.data.regions);
      for (const mapping of backup.mappings) {
        assert.ok(after.data[mapping.table].some((r) => r.id === mapping.id && identity(mapping.table, r) === identity(mapping.table, mapping.payload)), 'Existing ID retained');
      }
      await db.exec(`set jejak.static_import_approved_sha256=${quote(approval)};` + importSql);
      assert.deepEqual((await db.query(stateSql)).rows[0], after, 'Repeat import preserves IDs and full rows');
      // Manual scoped recovery preserves exact rows/IDs; audit is retained.
      const restore = restoreSql(backup, after);
      await assert.rejects(db.exec(restore), /explicit approval/);
      await db.exec('rollback');
      await db.exec(`set jejak.static_restore_approved_sha256=${quote(approval)};` + restore);
      assert.deepEqual((await db.query(stateSql)).rows[0].data, backup.data, 'Scoped recovery tested');
      await writeFile(resolve(remote, 'local-restore-data.sql'), restore);
      const receipt = { passed: true, backup_hash: hash(bytes), promotion_hash: hash(promotion),
        checks: ['exact live backup restore', 'changed-data guard', 'late-failure rollback', 'payload reconciliation',
          'existing IDs retained', 'repeat import', 'restore approval', 'scoped recovery'] };
      await writeFile(resolve(remote, 'verification.json'), JSON.stringify(receipt, null, 2));
      console.log(JSON.stringify(receipt, null, 2));
    } finally { await db.close(); }
  } else if (action === 'promote') {
    const receipt = JSON.parse(await readFile(resolve(remote, 'verification.json'), 'utf8'));
    assert.equal(receipt.passed, true);
    assert.equal(receipt.backup_hash, hash(bytes));
    assert.equal(receipt.promotion_hash, hash(promotion));
    console.log(JSON.stringify(await query(promotion, 'promotion-result')));
  } else {
    const [after] = await query(stateSql, 'post-refresh');
    checkRows(after.data);
    for (const t of untouched) assert.equal(after.fingerprints[t], backup.fingerprints[t], `${t}: unrelated rows unchanged`);
    for (const mapping of backup.mappings) assert.ok(after.data[mapping.table].some((r) =>
      r.id === mapping.id && identity(mapping.table, r) === identity(mapping.table, mapping.payload)), 'Prior IDs retained');
    const [audit] = await query(`select count(*)::int as rows from private.static_import_rows
      where workbook_sha256=${quote(approval)} and method_version=${quote(manifest.report.method_version)};`, 'audit');
    assert.equal(audit.rows, manifest.rows.length);
    // Serial IDs may differ from the failure-injected local verification.
    // Bind recovery to the actual remote state and test that exact artifact.
    const restore = restoreSql(backup, after);
    const db = await createDatabase();
    try {
      await applyMigrations(db);
      await db.exec("set time zone 'UTC'");
      await loadRows(db, after.data);
      await assert.rejects(db.exec(restore), /explicit approval/);
      await db.exec('rollback');
      await db.exec(`set jejak.static_restore_approved_sha256=${quote(approval)};` + restore);
      assert.deepEqual((await db.query(stateSql)).rows[0].data, backup.data, 'Actual hosted recovery artifact tested locally');
      await writeFile(resolve(remote, 'restore-data.sql'), restore);
    } finally { await db.close(); }
    const result = { passed: true, project, approval, scoped_rows: audit.rows,
      counts: Object.fromEntries(targets.map((t) => [t, after.data[t].length])),
      preserved_existing_ids: backup.mappings.length, unchanged_tables: untouched };
    await writeFile(resolve(remote, 'remote-verification.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  }
}
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
