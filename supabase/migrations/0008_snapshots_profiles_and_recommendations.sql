-- Jejak public snapshots and user decision records.
--
-- Snapshots contain already-aggregated, privacy-safe JSON. Company identities
-- and office-level employment values stay in the backend-only cache.

begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

-- The public aggregate contract is deliberately small. Only numeric summaries,
-- bounded ranges, and explanatory metadata are allowed; never arbitrary nested
-- evidence objects. The backend is still responsible for reviewing prose.
create or replace function private.is_public_snapshot(payload jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
    item record;
    range_value jsonb;
begin
    if payload is null or pg_catalog.jsonb_typeof(payload) <> 'object' then
        return false;
    end if;
    for item in select * from pg_catalog.jsonb_each(payload) loop
        if item.key in ('observed_office_count', 'offices_with_local_headcount_evidence',
                        'sources_monitored', 'opening_count', 'housing_count') then
            if pg_catalog.jsonb_typeof(item.value) <> 'number'
               or item.value::numeric < 0
               or item.value::numeric <> pg_catalog.trunc(item.value::numeric) then
                return false;
            end if;
        elsif item.key in ('estimated_employment', 'monthly_rent_idr', 'salary_idr') then
            range_value := item.value;
            if pg_catalog.jsonb_typeof(range_value) <> 'object'
               or (range_value - array['minimum', 'maximum', 'status']) <> '{}'::jsonb
               or not (range_value ? 'status')
               or range_value->>'status' not in ('observed', 'estimated', 'unavailable')
               or pg_catalog.jsonb_typeof(range_value->'status') <> 'string' then
                return false;
            end if;
            if range_value->>'status' = 'unavailable' then
                if range_value ?| array['minimum', 'maximum'] then return false; end if;
            else
                if not (range_value ?& array['minimum', 'maximum'])
                   or pg_catalog.jsonb_typeof(range_value->'minimum') <> 'number'
                   or pg_catalog.jsonb_typeof(range_value->'maximum') <> 'number' then
                    return false;
                end if;
                if (range_value->>'minimum')::numeric < 0
                   or (range_value->>'maximum')::numeric < (range_value->>'minimum')::numeric then
                    return false;
                end if;
            end if;
        elsif item.key = 'limitations' then
            if pg_catalog.jsonb_typeof(item.value) <> 'array' then return false; end if;
            if exists (select 1 from pg_catalog.jsonb_array_elements(item.value) as v(value)
                       where pg_catalog.jsonb_typeof(v.value) <> 'string') then
                return false;
            end if;
        elsif item.key = 'coverage' then
            if pg_catalog.jsonb_typeof(item.value) <> 'string'
               or item.value #>> '{}' not in ('complete', 'partial', 'unavailable') then
                return false;
            end if;
        elsif item.key = 'confidence' then
            if pg_catalog.jsonb_typeof(item.value) <> 'number'
               or item.value::numeric not between 0 and 1 then return false; end if;
        elsif item.key = 'as_of' then
            if pg_catalog.jsonb_typeof(item.value) <> 'string'
               or item.value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
        else
            return false;
        end if;
    end loop;
    return true;
end;
$$;

create table if not exists public.region_snapshots (
    id                  bigint generated always as identity (maxvalue 9007199254740991) primary key,
    region_id           integer not null references public.regions(id) on delete restrict,
    snapshot_type       varchar(40) not null,
    scope_key           varchar(200) not null,
    scope_hash          char(64) not null,
    snapshot            jsonb not null,
    evidence_count      smallint not null default 0,
    contributor_count   smallint not null default 0,
    coverage            varchar(20) not null default 'unavailable',
    confidence          numeric(5,4),
    generated_at        timestamptz not null default pg_catalog.now(),
    refresh_after       timestamptz,
    expires_at          timestamptz,
    status              varchar(20) not null default 'draft',
    is_current          boolean not null default false,
    previous_snapshot_id bigint references public.region_snapshots(id) on delete set null,
    constraint region_snapshots_scope_key_ck
        check (scope_key = pg_catalog.lower(scope_key)
            and pg_catalog.length(scope_key) between 1 and 200),
    constraint region_snapshots_scope_hash_ck
        check (scope_hash = pg_catalog.lower(scope_hash)
            and scope_hash ~ '^[0-9a-f]{64}$'),
    constraint region_snapshots_json_ck
        check (private.is_public_snapshot(snapshot)),
    constraint region_snapshots_counts_ck
        check (evidence_count >= 0 and contributor_count >= 0),
    constraint region_snapshots_coverage_ck
        check (coverage in ('complete', 'partial', 'unavailable')),
    constraint region_snapshots_confidence_ck
        check (confidence is null or confidence between 0 and 1),
    constraint region_snapshots_status_ck
        check (status in ('draft', 'accepted', 'superseded', 'failed')),
    constraint region_snapshots_employment_privacy_ck
        check (not (snapshot ? 'estimated_employment')
            or snapshot->'estimated_employment'->>'status' = 'unavailable'
            or contributor_count >= 3),
    constraint region_snapshots_freshness_ck
        check ((refresh_after is null or refresh_after >= generated_at)
            and (expires_at is null or expires_at >= generated_at)
            and (refresh_after is null or expires_at is null or refresh_after <= expires_at))
);

create unique index if not exists region_snapshots_current_uq
    on public.region_snapshots (region_id, snapshot_type, scope_hash)
    where is_current = true and status = 'accepted';

create index if not exists region_snapshots_lookup_idx
    on public.region_snapshots (region_id, snapshot_type, generated_at desc);
create index if not exists region_snapshots_expiry_idx
    on public.region_snapshots (expires_at);

create table if not exists public.relocation_profiles (
    id                  bigint generated always as identity (maxvalue 9007199254740991) primary key,
    user_id             uuid not null references auth.users(id) on delete cascade,
    profile_name        varchar(120) not null,
    revision            integer not null,
    profile             jsonb not null,
    confirmed           boolean not null default false,
    confirmed_at        timestamptz,
    created_at          timestamptz not null default pg_catalog.now(),
    updated_at          timestamptz not null default pg_catalog.now(),
    constraint relocation_profiles_revision_ck
        check (revision >= 1),
    constraint relocation_profiles_profile_ck
        check (pg_catalog.jsonb_typeof(profile) = 'object'),
    constraint relocation_profiles_confirmation_ck
        check ((confirmed = false and confirmed_at is null)
            or (confirmed = true and confirmed_at is not null)),
    constraint relocation_profiles_revision_uq
        unique (user_id, profile_name, revision),
    constraint relocation_profiles_id_user_uq unique (id, user_id)
);

create index if not exists relocation_profiles_user_idx
    on public.relocation_profiles (user_id, updated_at desc);

create table if not exists public.recommendation_runs (
    id                  bigint generated always as identity (maxvalue 9007199254740991) primary key,
    external_request_id uuid not null default gen_random_uuid() unique,
    user_id             uuid not null references auth.users(id) on delete cascade,
    profile_id          bigint not null,
    scoring_version     varchar(50) not null,
    status              varchar(20) not null default 'queued',
    results             jsonb not null default '[]'::jsonb,
    explanation         jsonb,
    created_at          timestamptz not null default pg_catalog.now(),
    completed_at        timestamptz,
    constraint recommendation_runs_status_ck
        check (status in ('queued', 'running', 'completed', 'partial', 'failed')),
    constraint recommendation_runs_explanation_ck
        check (explanation is null or pg_catalog.jsonb_typeof(explanation) = 'object'),
    constraint recommendation_runs_profile_owner_fk
        foreign key (profile_id, user_id) references public.relocation_profiles (id, user_id),
    constraint recommendation_runs_id_user_uq unique (id, user_id)
);

create index if not exists recommendation_runs_user_idx
    on public.recommendation_runs (user_id, created_at desc);
create index if not exists recommendation_runs_profile_idx
    on public.recommendation_runs (profile_id, created_at desc);

create table if not exists public.shortlist_items (
    id                  bigint generated always as identity (maxvalue 9007199254740991) primary key,
    user_id             uuid not null references auth.users(id) on delete cascade,
    region_id           integer not null references public.regions(id) on delete restrict,
    recommendation_run_id bigint,
    note                text,
    created_at          timestamptz not null default pg_catalog.now(),
    constraint shortlist_items_user_region_uq
        unique (user_id, region_id),
    constraint shortlist_items_run_owner_fk
        foreign key (recommendation_run_id, user_id)
        references public.recommendation_runs (id, user_id)
        on delete set null (recommendation_run_id)
);

create index if not exists shortlist_items_user_idx
    on public.shortlist_items (user_id, created_at desc);
create index if not exists shortlist_items_region_idx
    on public.shortlist_items (region_id);
create index if not exists shortlist_items_run_idx
    on public.shortlist_items (recommendation_run_id);

-- Confirmation freezes a revision. Refinement inserts another revision rather
-- than changing the inputs of an existing recommendation.
create or replace function private.protect_confirmed_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
    if old.confirmed and new is distinct from old then
        raise exception 'confirmed profiles are immutable; insert a new revision';
    end if;
    return new;
end;
$$;

create trigger relocation_profiles_immutable_trg
before update on public.relocation_profiles
for each row execute function private.protect_confirmed_profile();

create or replace function private.require_confirmed_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
    perform 1 from public.relocation_profiles as p
    where p.id = new.profile_id and p.user_id = new.user_id and p.confirmed
    for share;
    if not found then raise exception 'recommendations require an owned confirmed profile'; end if;
    return new;
end;
$$;

create trigger recommendation_runs_confirmed_profile_trg
before insert or update of profile_id, user_id on public.recommendation_runs
for each row execute function private.require_confirmed_profile();

create trigger relocation_profiles_updated_at_trg
before update on public.relocation_profiles
for each row execute function private.touch_updated_at();

-- Publish a validated aggregate without deleting the previous accepted snapshot.
-- The table's allowlisted JSON contract also protects direct backend inserts.
create or replace function public.publish_region_snapshot(p_snapshot_id bigint)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    target_region_id integer;
    target_type      varchar(40);
    target_scope     char(64);
    previous_id      bigint;
    target_generated_at timestamptz;
    target_status varchar(20);
begin
    select s.region_id, s.snapshot_type, s.scope_hash
    into target_region_id, target_type, target_scope
    from public.region_snapshots as s
    where s.id = p_snapshot_id;

    if not found then
        raise exception 'snapshot % does not exist', p_snapshot_id;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'jejak:snapshot:' || target_region_id::text || ':'
            || target_type || ':' || target_scope::text,
            0
        )
    );

    select s.region_id, s.snapshot_type, s.scope_hash, s.generated_at, s.status
    into target_region_id, target_type, target_scope, target_generated_at, target_status
    from public.region_snapshots as s
    where s.id = p_snapshot_id
    for update;

    if not found then raise exception 'snapshot % does not exist', p_snapshot_id; end if;
    if target_status = 'accepted' then return; end if;
    if target_status <> 'draft' then
        raise exception 'only draft snapshots can be published';
    end if;

    if exists (select 1 from public.region_snapshots as s
               where s.region_id = target_region_id and s.snapshot_type = target_type
                 and s.scope_hash = target_scope and s.is_current and s.status = 'accepted'
                 and s.generated_at > target_generated_at) then
        raise exception 'cannot replace a newer snapshot with an older one';
    end if;

    select s.id
    into previous_id
    from public.region_snapshots as s
    where s.region_id = target_region_id
      and s.snapshot_type = target_type
      and s.scope_hash = target_scope
      and s.is_current = true
      and s.status = 'accepted'
      and s.id <> p_snapshot_id
    order by s.generated_at desc
    limit 1
    for update;

    update public.region_snapshots as s
    set is_current = false,
        status = 'superseded'
    where s.region_id = target_region_id
      and s.snapshot_type = target_type
      and s.scope_hash = target_scope
      and s.is_current = true
      and s.id <> p_snapshot_id;

    update public.region_snapshots as s
    set previous_snapshot_id = previous_id,
        is_current = true,
        status = 'accepted'
    where s.id = p_snapshot_id;
end;
$$;

-- The scoring formula is deliberately deterministic. An AI explanation can
-- describe the result but cannot change the arithmetic.
create or replace function public.calculate_relocation_fit(
    p_career_fit numeric,
    p_education_fit numeric,
    p_affordability_fit numeric,
    p_mobility_fit numeric,
    p_lifestyle_fit numeric default 0,
    p_career_weight numeric default 0.35,
    p_education_weight numeric default 0.25,
    p_affordability_weight numeric default 0.25,
    p_mobility_weight numeric default 0.15,
    p_lifestyle_weight numeric default 0
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
    weight_sum numeric;
begin
    if p_career_fit is null
       or p_education_fit is null
       or p_affordability_fit is null
       or p_mobility_fit is null
       or p_lifestyle_fit is null
       or p_career_fit not between 0 and 100
       or p_education_fit not between 0 and 100
       or p_affordability_fit not between 0 and 100
       or p_mobility_fit not between 0 and 100
       or p_lifestyle_fit not between 0 and 100 then
        raise exception 'fit components must be between 0 and 100';
    end if;

    if p_career_weight is null
       or p_education_weight is null
       or p_affordability_weight is null
       or p_mobility_weight is null
       or p_lifestyle_weight is null
       or p_career_weight not between 0 and 1
       or p_education_weight not between 0 and 1
       or p_affordability_weight not between 0 and 1
       or p_mobility_weight not between 0 and 1
       or p_lifestyle_weight not between 0 and 1 then
        raise exception 'fit weights must be between 0 and 1';
    end if;

    weight_sum := p_career_weight + p_education_weight
        + p_affordability_weight + p_mobility_weight + p_lifestyle_weight;
    if pg_catalog.abs(weight_sum - 1) > 0.0001 then
        raise exception 'fit weights must sum to 1';
    end if;

    return pg_catalog.round((
        p_career_fit * p_career_weight
        + p_education_fit * p_education_weight
        + p_affordability_fit * p_affordability_weight
        + p_mobility_fit * p_mobility_weight
        + p_lifestyle_fit * p_lifestyle_weight
    )::numeric, 2);
end;
$$;

commit;
