-- Jejak simplified schema foundation.
--
-- 0001-0004 are intentionally left unchanged. This migration only installs
-- shared helpers, PostGIS, and the transaction lock used by later migrations.
-- The old prototype tables remain available until their replacements are
-- populated and the legacy RPC is retired in 0009.

begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

create schema if not exists extensions;
create schema if not exists private;
revoke all on schema private from public;
create extension if not exists pgcrypto;
create extension if not exists postgis with schema extensions;

-- New numeric IDs use identity sequences capped at 2^53 - 1. They are exact in
-- browser JSON, need no custom generator, and do not collide on concurrent inserts.
-- Functions are private by default, including on projects with Supabase's older
-- direct default grants to browser roles. 0009 grants the intended RPCs explicitly.
-- Global PUBLIC defaults cannot be undone by a schema-specific revoke.
alter default privileges revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
begin
    new.updated_at := pg_catalog.now();
    return new;
end;
$$;

-- The first four migrations created prototype/staging tables. Keep them, but
-- make them backend-only and preserve their sample markers for later filters.
do $$
declare
    table_name text;
    role_name text;
begin
    foreach table_name in array array[
        'zone_evidence_cache', 'housing_observations', 'zone_stats'
    ] loop
        if pg_catalog.to_regclass('public.' || table_name) is null then
            continue;
        end if;

        execute pg_catalog.format(
            'alter table public.%I enable row level security', table_name
        );
        execute pg_catalog.format(
            'revoke all on table public.%I from public', table_name
        );

        foreach role_name in array array['anon', 'authenticated'] loop
            if exists (
                select 1 from pg_catalog.pg_roles where rolname = role_name
            ) then
                execute pg_catalog.format(
                    'revoke all on table public.%I from %I',
                    table_name,
                    role_name
                );
            end if;
        end loop;
    end loop;
end;
$$;

-- Harden the old LF-01 compatibility function before the new read RPCs are
-- installed.  0009 removes its browser-facing grant permanently.
create or replace function public.get_zone_data(p_zone_id text)
returns setof public.zone_stats
language sql
stable
security definer
set search_path = ''
as $$
    select z.*
    from public.zone_stats as z
    where z.zone_id = p_zone_id::varchar(64)
      and z.is_sample = false;
$$;

revoke all on function public.get_zone_data(text) from public;

do $$
declare
    role_name text;
begin
    foreach role_name in array array['anon', 'authenticated'] loop
        if exists (
            select 1 from pg_catalog.pg_roles where rolname = role_name
        ) then
            execute pg_catalog.format(
                'revoke all on function public.get_zone_data(text) from %I',
                role_name
            );
        end if;
    end loop;
end;
$$;

comment on schema private is
    'Jejak backend helpers; not exposed through the public API.';

commit;
