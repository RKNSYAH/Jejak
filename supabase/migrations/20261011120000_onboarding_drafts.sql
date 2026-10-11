begin;

set local search_path = public, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

create table public.onboarding_drafts (
    user_id uuid not null references auth.users(id) on delete cascade,
    kind text not null check (kind in ('form', 'story')),
    draft jsonb not null check (pg_catalog.octet_length(draft::text) <= 60000),
    updated_at timestamptz not null default pg_catalog.now(),
    primary key (user_id, kind)
);

alter table public.onboarding_drafts enable row level security;
revoke all on table public.onboarding_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.onboarding_drafts to service_role;

commit;
