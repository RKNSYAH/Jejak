-- Jejak shared dynamic evidence cache and LF-01 run coordination.
--
-- The API decides whether LF-01 is needed by calling
-- check_and_claim_zone_enrichment(). LF-01 only discovers and extracts
-- candidates; it never writes this database directly.

begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

create table if not exists public.evidence_cache_policies (
    evidence_type           varchar(40) primary key,
    minimum_required_count  smallint not null,
    target_count             smallint not null,
    refresh_after_hours      integer not null,
    expire_after_hours       integer not null,
    max_sources_per_run      smallint not null,
    retry_after_minutes      integer not null,
    updated_at               timestamptz not null default pg_catalog.now(),
    constraint evidence_cache_policies_counts_ck
        check (minimum_required_count between 1 and 10000
            and target_count between minimum_required_count and 10000),
    constraint evidence_cache_policies_ttl_ck
        check (refresh_after_hours > 0 and expire_after_hours >= refresh_after_hours),
    constraint evidence_cache_policies_budget_ck
        check (max_sources_per_run between 1 and 100
            and retry_after_minutes > 0)
);

insert into public.evidence_cache_policies (
    evidence_type,
    minimum_required_count,
    target_count,
    refresh_after_hours,
    expire_after_hours,
    max_sources_per_run,
    retry_after_minutes
) values
    ('active_opening',   25, 25,  24,  72, 3,   120),
    ('kos_listing',      15, 25, 120, 168, 3,   720),
    ('apartment_listing', 15, 25, 120, 168, 3,   720),
    ('house_listing',    15, 25, 120, 168, 3,   720),
    ('office_presence',  15, 25, 504, 720, 3, 1440),
    ('local_employment', 25, 25, 504, 720, 3, 1440)
on conflict (evidence_type) do nothing;

create table if not exists public.enrichment_runs (
    id                  bigint generated always as identity (maxvalue 9007199254740991) primary key,
    external_run_id     uuid not null default gen_random_uuid() unique,
    region_id           integer not null references public.regions(id) on delete restrict,
    evidence_type       varchar(40) not null references public.evidence_cache_policies(evidence_type) on delete restrict,
    scope_key           varchar(200) not null,
    scope_hash          char(64) not null,
    live_count_before   smallint not null,
    target_count        smallint not null,
    source_budget       smallint not null,
    status              varchar(20) not null default 'queued',
    stage               varchar(50),
    input               jsonb not null default '{}'::jsonb,
    output              jsonb,
    error               text,
    requested_at        timestamptz not null default pg_catalog.now(),
    started_at          timestamptz,
    completed_at        timestamptz,
    lease_expires_at    timestamptz,
    next_retry_at       timestamptz,
    created_at          timestamptz not null default pg_catalog.now(),
    updated_at          timestamptz not null default pg_catalog.now(),
    constraint enrichment_runs_scope_key_ck
        check (scope_key = pg_catalog.lower(scope_key)
            and pg_catalog.length(scope_key) between 1 and 200),
    constraint enrichment_runs_scope_hash_ck
        check (scope_hash = pg_catalog.lower(scope_hash)
            and scope_hash ~ '^[0-9a-f]{64}$'),
    constraint enrichment_runs_counts_ck
        check (live_count_before >= 0 and target_count >= 0
            and source_budget >= 0),
    constraint enrichment_runs_status_ck
        check (status in ('queued', 'running', 'partial', 'completed', 'failed', 'cancelled')),
    constraint enrichment_runs_input_ck
        check (pg_catalog.jsonb_typeof(input) = 'object'),
    constraint enrichment_runs_output_ck
        check (output is null or pg_catalog.jsonb_typeof(output) = 'object')
);

create unique index if not exists enrichment_runs_one_active_scope
    on public.enrichment_runs (region_id, evidence_type, scope_hash)
    where status in ('queued', 'running');

create index if not exists enrichment_runs_status_requested_idx
    on public.enrichment_runs (status, requested_at);
create index if not exists enrichment_runs_scope_requested_idx
    on public.enrichment_runs (region_id, evidence_type, requested_at desc);

-- 0001 created this table as a UUID candidate cache. Add the normalized scope
-- and lifecycle fields in place so old rows remain readable but can never satisfy
-- a new scoped request until they have been explicitly revalidated.
alter table public.zone_evidence_cache
    rename column run_id to legacy_run_id;

alter table public.zone_evidence_cache
    add column if not exists region_id integer references public.regions(id) on delete restrict,
    add column if not exists evidence_type varchar(40) references public.evidence_cache_policies(evidence_type) on delete restrict,
    add column if not exists scope_key varchar(200),
    add column if not exists scope_hash char(64),
    add column if not exists dedup_hash char(64),
    add column if not exists entity_name varchar(240),
    add column if not exists value jsonb,
    add column if not exists latitude double precision,
    add column if not exists longitude double precision,
    add column if not exists geographic_precision varchar(20),
    add column if not exists locality_tier varchar(20),
    add column if not exists publisher varchar(160),
    add column if not exists content_hash char(64),
    add column if not exists confidence numeric(5,4),
    add column if not exists run_id bigint references public.enrichment_runs(id) on delete set null,
    add column if not exists first_seen_at timestamptz,
    add column if not exists last_seen_at timestamptz,
    add column if not exists refresh_after timestamptz,
    add column if not exists is_sample boolean not null default false,
    add column if not exists validation_status varchar(20) not null default 'candidate';

-- The old logical key was zone-wide. The new key is explicitly scoped; retain
-- the old generated column as compatibility metadata but remove its uniqueness.
drop index if exists public.zone_evidence_cache_dedup;

alter table public.zone_evidence_cache
    add constraint zone_evidence_cache_scope_key_ck
        check (scope_key is null or (
            scope_key = pg_catalog.lower(scope_key)
            and pg_catalog.length(scope_key) between 1 and 200
        )),
    add constraint zone_evidence_cache_scope_hash_ck
        check (scope_hash is null or (
            scope_hash = pg_catalog.lower(scope_hash)
            and scope_hash ~ '^[0-9a-f]{64}$'
        )),
    add constraint zone_evidence_cache_dedup_hash_ck
        check (dedup_hash is null or (
            dedup_hash = pg_catalog.lower(dedup_hash)
            and dedup_hash ~ '^[0-9a-f]{64}$'
        )),
    add constraint zone_evidence_cache_content_hash_ck
        check (content_hash is null or content_hash ~ '^[0-9a-fA-F]{64}$'),
    add constraint zone_evidence_cache_status_ck
        check (validation_status in ('candidate', 'accepted', 'rejected', 'expired', 'overflow')),
    add constraint zone_evidence_cache_precision_ck
        check (geographic_precision is null or geographic_precision in (
            'building', 'street', 'neighborhood', 'district', 'city', 'region', 'unknown'
        )),
    add constraint zone_evidence_cache_locality_ck
        check (locality_tier is null or locality_tier in ('zone', 'city', 'region', 'national')),
    add constraint zone_evidence_cache_coordinates_ck
        check (
            (latitude is null and longitude is null)
            or (latitude is not null and longitude is not null
                and latitude between -90 and 90 and longitude between -180 and 180)
        ),
    add constraint zone_evidence_cache_accepted_location_ck
        check (region_id is null or validation_status <> 'accepted' or (
            latitude is not null and longitude is not null
            and locality_tier is not null
            and geographic_precision is not null and geographic_precision <> 'unknown'
        )),
    add constraint zone_evidence_cache_confidence_ck
        check (confidence is null or confidence between 0 and 1),
    add constraint zone_evidence_cache_normalized_shape_ck
        check (region_id is null or (
            evidence_type is not null
            and scope_key is not null
            and scope_hash is not null
            and dedup_hash is not null
            and value is not null
        )),
    add constraint zone_evidence_cache_freshness_ck
        check (refresh_after is null or refresh_after <= expires_at),
    add constraint zone_evidence_cache_scope_dedup_uq
        unique (region_id, scope_hash, dedup_hash);

create index if not exists zone_evidence_cache_scope_live_idx
    on public.zone_evidence_cache (
        region_id, evidence_type, scope_hash, validation_status, expires_at
    );
-- 0001 already indexed expires_at for cleanup.
create index if not exists zone_evidence_cache_run_idx
    on public.zone_evidence_cache (run_id);

create trigger evidence_cache_policies_updated_at_trg
before update on public.evidence_cache_policies
for each row execute function private.touch_updated_at();

create trigger enrichment_runs_updated_at_trg
before update on public.enrichment_runs
for each row execute function private.touch_updated_at();

-- Deterministic preflight and atomic run claim. The API calls LF-01 only when
-- this function returns call_lf01=true.
create or replace function public.check_and_claim_zone_enrichment(
    p_region_id integer,
    p_evidence_type varchar,
    p_scope_key varchar,
    p_scope_hash text
)
returns table (
    status                  varchar(32),
    run_id                  bigint,
    live_count              integer,
    minimum_required_count  smallint,
    target_count            smallint,
    needed_count            integer,
    source_budget           smallint,
    call_lf01               boolean,
    retry_at                timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    policy_row       public.evidence_cache_policies%rowtype;
    current_count    integer;
    stale_count      integer;
    active_run_id    bigint;
    active_lease     timestamptz;
    cooldown_run_id  bigint;
    cooldown_at      timestamptz;
    needed            integer;
    missing_count     integer;
    budget            integer;
    new_run_id        bigint;
begin
    if p_region_id is null
       or p_evidence_type is null
       or p_scope_key is null
       or p_scope_hash is null
       or p_scope_hash <> pg_catalog.lower(p_scope_hash)
       or p_scope_hash !~ '^[0-9a-f]{64}$'
       or p_scope_key <> pg_catalog.lower(p_scope_key)
       or pg_catalog.length(p_scope_key) not between 1 and 200 then
        raise exception 'region, evidence type, normalized scope key, and SHA-256 scope hash are required';
    end if;

    select *
    into policy_row
    from public.evidence_cache_policies as p
    where p.evidence_type = p_evidence_type;

    if not found then
        raise exception 'no cache policy exists for evidence type %', p_evidence_type;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'jejak:enrichment:' || p_region_id::text || ':'
            || p_evidence_type || ':' || p_scope_hash,
            0
        )
    );

    select count(*)::integer,
           count(*) filter (where c.refresh_after is null or c.refresh_after <= pg_catalog.now())::integer
    into current_count, stale_count
    from public.zone_evidence_cache as c
    where c.region_id = p_region_id
      and c.evidence_type = p_evidence_type
      and c.scope_hash = p_scope_hash::char(64)
      and c.validation_status = 'accepted'
      and c.is_sample = false
      and c.expires_at > pg_catalog.now();

    missing_count := greatest(policy_row.target_count - current_count, 0);
    needed := least(policy_row.target_count, missing_count + stale_count);

    select r.id, r.lease_expires_at
    into active_run_id, active_lease
    from public.enrichment_runs as r
    where r.region_id = p_region_id
      and r.evidence_type = p_evidence_type
      and r.scope_hash = p_scope_hash::char(64)
      and r.status in ('queued', 'running')
    order by r.requested_at desc
    limit 1
    for update;

    if active_run_id is not null then
        if active_lease > pg_catalog.now() then
            return query
            select
                'refresh_running'::varchar(32),
                active_run_id,
                current_count,
                policy_row.minimum_required_count,
                policy_row.target_count,
                needed,
                0::smallint,
                false,
                active_lease;
            return;
        end if;

        update public.enrichment_runs as r
        set status = 'failed',
            stage = 'lease_expired',
            error = 'enrichment lease expired',
            completed_at = pg_catalog.now(),
            lease_expires_at = null,
            next_retry_at = pg_catalog.now() + pg_catalog.make_interval(
                mins => policy_row.retry_after_minutes
            )
        where r.id = active_run_id;
    end if;

    if current_count >= policy_row.minimum_required_count
       and stale_count = 0 then
        return query
        select
            'cache_hit'::varchar(32),
            null::bigint,
            current_count,
            policy_row.minimum_required_count,
            policy_row.target_count,
            0,
            0::smallint,
            false,
            null::timestamptz;
        return;
    end if;

    select r.id, r.next_retry_at
    into cooldown_run_id, cooldown_at
    from public.enrichment_runs as r
    where r.region_id = p_region_id
      and r.evidence_type = p_evidence_type
      and r.scope_hash = p_scope_hash::char(64)
      and r.status in ('partial', 'failed')
      and r.next_retry_at > pg_catalog.now()
    order by r.completed_at desc nulls last, r.requested_at desc
    limit 1;

    if cooldown_run_id is not null then
        return query
        select
            'retry_cooldown'::varchar(32),
            cooldown_run_id,
            current_count,
            policy_row.minimum_required_count,
            policy_row.target_count,
            needed,
            0::smallint,
            false,
            cooldown_at;
        return;
    end if;

    budget := least(
        policy_row.max_sources_per_run::integer,
        greatest(1, pg_catalog.ceil(needed / 4.0)::integer)
    );

    insert into public.enrichment_runs (
        region_id,
        evidence_type,
        scope_key,
        scope_hash,
        live_count_before,
        target_count,
        source_budget,
        status,
        stage,
        input,
        lease_expires_at
    ) values (
        p_region_id,
        p_evidence_type,
        p_scope_key,
        p_scope_hash::char(64),
        least(current_count, 32767)::smallint,
        policy_row.target_count,
        budget::smallint,
        'queued',
        'claimed',
        pg_catalog.jsonb_build_object(
            'region_id', p_region_id,
            'evidence_type', p_evidence_type,
            'scope_key', p_scope_key,
            'scope_hash', p_scope_hash,
            'needed_count', needed,
            'missing_count', missing_count,
            'refresh_count', stale_count,
            'maximum_sources', budget
        ),
        pg_catalog.now() + pg_catalog.make_interval(mins => 30)
    )
    returning id into new_run_id;

    return query
    select
        'refresh_required'::varchar(32),
        new_run_id,
        current_count,
        policy_row.minimum_required_count,
        policy_row.target_count,
        needed,
        budget::smallint,
        true,
        null::timestamptz;
end;
$$;

-- Backend-only read of accepted, current evidence for one exact scope.
create or replace function public.get_zone_evidence(
    p_region_id integer,
    p_evidence_type varchar,
    p_scope_hash text,
    p_limit integer default 25
)
returns setof public.zone_evidence_cache
language sql
stable
security definer
set search_path = ''
as $$
    select c.*
    from public.zone_evidence_cache as c
    where c.region_id = p_region_id
      and c.evidence_type = p_evidence_type
      and c.scope_hash = p_scope_hash::char(64)
      and c.validation_status = 'accepted'
      and c.is_sample = false
      and c.expires_at > pg_catalog.now()
    order by
        case c.locality_tier
            when 'zone' then 1 when 'city' then 2 when 'region' then 3 else 4
        end,
        case c.geographic_precision
            when 'building' then 1
            when 'street' then 2
            when 'neighborhood' then 3
            when 'district' then 4
            when 'city' then 5
            else 6
        end,
        c.confidence desc nulls last,
        c.last_seen_at desc nulls last
    limit least(greatest(coalesce(p_limit, 25), 1), 25);
$$;

-- Accept validated LF-01 candidates, refresh their evidence-specific TTL, and
-- mark rows beyond the target as overflow. The caller owns the surrounding
-- transaction; this function takes the same scope mutex as the preflight.
create or replace function public.upsert_zone_evidence(
    p_run_id bigint,
    p_candidates jsonb
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    run_region_id       integer;
    run_evidence_type   varchar(40);
    run_scope_key       varchar(200);
    run_scope_hash      char(64);
    run_target_count    smallint;
    run_external_id     uuid;
    run_status          varchar(20);
    run_lease           timestamptz;
    region_code         varchar(64);
    expiry_hours        integer;
    refresh_hours       integer;
    now_at              timestamptz := pg_catalog.now();
    affected_rows       integer;
begin
    if p_run_id is null
       or p_candidates is null
       or pg_catalog.jsonb_typeof(p_candidates) <> 'array' then
        raise exception 'run id and a JSON candidate array are required';
    end if;

    select
        r.region_id,
        r.evidence_type,
        r.scope_key,
        r.scope_hash,
        r.target_count,
        r.external_run_id,
        p.refresh_after_hours,
        p.expire_after_hours,
        g.code
    into
        run_region_id,
        run_evidence_type,
        run_scope_key,
        run_scope_hash,
        run_target_count,
        run_external_id,
        refresh_hours,
        expiry_hours,
        region_code
    from public.enrichment_runs as r
    join public.evidence_cache_policies as p
      on p.evidence_type = r.evidence_type
    join public.regions as g
      on g.id = r.region_id
    where r.id = p_run_id;

    if not found then
        raise exception 'enrichment run % does not exist', p_run_id;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'jejak:enrichment:' || run_region_id::text || ':'
            || run_evidence_type || ':' || run_scope_hash::text,
            0
        )
    );

    -- Read state again under the scope lock: a completing/recovering worker may
    -- have changed it while this worker was waiting.
    select r.status, r.lease_expires_at into run_status, run_lease
    from public.enrichment_runs as r
    where r.id = p_run_id
    for update;

    if not found or run_status not in ('queued', 'running')
       or run_lease is null or run_lease <= pg_catalog.now() then
        raise exception 'enrichment run % is terminal or its lease has expired', p_run_id;
    end if;

    with incoming as (
        select x.*, pg_catalog.row_number() over (
            partition by x.dedup_hash
            order by x.retrieved_at desc nulls last, x.confidence desc nulls last
        ) as duplicate_rank
        from pg_catalog.jsonb_to_recordset(p_candidates) as x(
            dedup_hash              char(64),
            entity_name             varchar(240),
            canonical_url           varchar(2048),
            value                   jsonb,
            latitude                double precision,
            longitude               double precision,
            geographic_precision    varchar(20),
            locality_tier           varchar(20),
            source                  jsonb,
            publisher               varchar(160),
            content_hash            char(64),
            confidence              numeric(5,4),
            retrieved_at            timestamptz,
            validation_status       varchar(20),
            is_sample               boolean
        )
    )
    insert into public.zone_evidence_cache as c (
        zone_id,
        claim_type,
        canonical_url,
        normalized_value,
        raw_name,
        precision,
        scope,
        source,
        legacy_run_id,
        retrieved_at,
        expires_at,
        region_id,
        evidence_type,
        scope_key,
        scope_hash,
        dedup_hash,
        entity_name,
        value,
        latitude,
        longitude,
        geographic_precision,
        locality_tier,
        publisher,
        content_hash,
        confidence,
        extractor_confidence,
        run_id,
        first_seen_at,
        last_seen_at,
        refresh_after,
        is_sample,
        validation_status
    )
    select
        region_code,
        run_evidence_type,
        i.canonical_url,
        i.value,
        coalesce(i.entity_name, run_evidence_type),
        coalesce(i.geographic_precision, 'unknown'),
        i.locality_tier,
        i.source,
        run_external_id::text,
        coalesce(i.retrieved_at, now_at),
        case
            when coalesce(i.validation_status, 'accepted') = 'expired'
                then now_at
            else now_at + pg_catalog.make_interval(hours => expiry_hours)
        end,
        run_region_id,
        run_evidence_type,
        run_scope_key,
        run_scope_hash,
        i.dedup_hash,
        i.entity_name,
        i.value,
        i.latitude,
        i.longitude,
        coalesce(i.geographic_precision, 'unknown'),
        i.locality_tier,
        i.publisher,
        i.content_hash,
        i.confidence,
        i.confidence::double precision,
        p_run_id,
        now_at,
        now_at,
        case
            when coalesce(i.validation_status, 'accepted') = 'expired'
                then now_at
            else now_at + pg_catalog.make_interval(hours => refresh_hours)
        end,
        coalesce(i.is_sample, false),
        coalesce(i.validation_status, 'candidate')
    from incoming as i
    where i.duplicate_rank = 1
    on conflict (region_id, scope_hash, dedup_hash) do update set
        canonical_url          = excluded.canonical_url,
        normalized_value       = excluded.normalized_value,
        raw_name               = excluded.raw_name,
        precision              = excluded.precision,
        scope                  = excluded.scope,
        source                 = excluded.source,
        legacy_run_id          = excluded.legacy_run_id,
        retrieved_at           = excluded.retrieved_at,
        expires_at             = excluded.expires_at,
        region_id              = excluded.region_id,
        evidence_type          = excluded.evidence_type,
        scope_key              = excluded.scope_key,
        entity_name            = excluded.entity_name,
        value                  = excluded.value,
        latitude               = excluded.latitude,
        longitude              = excluded.longitude,
        geographic_precision   = excluded.geographic_precision,
        locality_tier          = excluded.locality_tier,
        publisher              = excluded.publisher,
        content_hash           = excluded.content_hash,
        confidence             = excluded.confidence,
        extractor_confidence   = excluded.extractor_confidence,
        run_id                 = excluded.run_id,
        first_seen_at          = coalesce(c.first_seen_at, excluded.first_seen_at),
        last_seen_at           = excluded.last_seen_at,
        refresh_after          = excluded.refresh_after,
        is_sample              = c.is_sample or excluded.is_sample,
        validation_status      = excluded.validation_status;

    get diagnostics affected_rows = row_count;

    with ranked as (
        select
            c.id,
            pg_catalog.row_number() over (
                order by
                    case c.locality_tier
                        when 'zone' then 1 when 'city' then 2 when 'region' then 3 else 4
                    end,
                    case c.geographic_precision
                        when 'building' then 1
                        when 'street' then 2
                        when 'neighborhood' then 3
                        when 'district' then 4
                        when 'city' then 5
                        else 6
                    end,
                    c.confidence desc nulls last,
                    c.last_seen_at desc nulls last,
                    c.id
            ) as row_number
        from public.zone_evidence_cache as c
        where c.region_id = run_region_id
          and c.evidence_type = run_evidence_type
          and c.scope_hash = run_scope_hash
          and c.validation_status = 'accepted'
          and c.is_sample = false
          and c.expires_at > now_at
    )
    update public.zone_evidence_cache as c
    set validation_status = 'overflow'
    from ranked as r
    where c.id = r.id
      and r.row_number > run_target_count;

    return affected_rows;
end;
$$;

create or replace function public.complete_enrichment_run(
    p_run_id bigint,
    p_status varchar,
    p_output jsonb default null,
    p_error text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    run_region_id     integer;
    run_evidence_type varchar(40);
    run_scope_hash    char(64);
    retry_minutes     integer;
    run_status        varchar(20);
    run_lease         timestamptz;
begin
    if p_status is null or p_status not in ('partial', 'completed', 'failed', 'cancelled') then
        raise exception 'invalid terminal enrichment status %', p_status;
    end if;

    select r.region_id, r.evidence_type, r.scope_hash, p.retry_after_minutes
    into run_region_id, run_evidence_type, run_scope_hash, retry_minutes
    from public.enrichment_runs as r
    join public.evidence_cache_policies as p
      on p.evidence_type = r.evidence_type
    where r.id = p_run_id;

    if not found then
        raise exception 'enrichment run % does not exist', p_run_id;
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'jejak:enrichment:' || run_region_id::text || ':'
            || run_evidence_type || ':' || run_scope_hash::text,
            0
        )
    );

    select r.status, r.lease_expires_at into run_status, run_lease
    from public.enrichment_runs as r where r.id = p_run_id for update;

    -- Duplicate completion is harmless; changing an already terminal result is not.
    if run_status = p_status then
        return;
    end if;
    if not found or run_status not in ('queued', 'running')
       or run_lease is null or run_lease <= pg_catalog.now() then
        raise exception 'enrichment run % is terminal or its lease has expired', p_run_id;
    end if;

    if p_output is not null
       and pg_catalog.jsonb_typeof(p_output) <> 'object' then
        raise exception 'enrichment output must be a JSON object';
    end if;

    update public.enrichment_runs as r
    set status = p_status,
        stage = p_status,
        output = coalesce(p_output, r.output),
        error = p_error,
        completed_at = pg_catalog.now(),
        lease_expires_at = null,
        next_retry_at = case
            when p_status in ('partial', 'failed')
                then pg_catalog.now() + pg_catalog.make_interval(mins => retry_minutes)
            else null
        end
    where r.id = p_run_id;
end;
$$;

create or replace function public.zone_evidence_gc()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    removed_rows integer;
begin
    delete from public.zone_evidence_cache
    where expires_at <= pg_catalog.now();
    get diagnostics removed_rows = row_count;
    return removed_rows;
end;
$$;

commit;
