import { readdir, readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { postgis } from '@electric-sql/pglite-postgis';

// Real PostgreSQL + PostGIS in memory; no remote database or credentials.
// Bootstrap only the Supabase roles and auth objects used by the migrations.
export async function createDatabase() {
  const db = new PGlite({ extensions: { pgcrypto, postgis } });
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
  return db;
}

export async function applyMigrations(db) {
  const folder = new URL('../migrations/', import.meta.url);
  for (const file of (await readdir(folder)).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(await readFile(new URL(file, folder), 'utf8'));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`, { cause: error });
    }
  }
}

// Runs fn as a database role, always restoring the superuser afterwards.
export async function asRole(db, role, fn) {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
