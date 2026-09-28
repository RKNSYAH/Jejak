-- Restore database objects from migrations already present in history but
-- missing from the live schema. This is forward-only; no migration history is
-- rewritten and existing user or telemetry data is not modified.
begin;

set local search_path = public, extensions, pg_catalog;
select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

create table if not exists public.hci_click_events (
    id              bigint generated always as identity (maxvalue 9007199254740991) primary key,
    session_id      uuid not null,
    participant     text check (participant ~ '^[A-Za-z0-9_-]{1,32}$'),
    elapsed_ms      integer not null check (elapsed_ms >= 0),
    region          text not null check (region ~ '^[a-z0-9-]{1,32}$'),
    target          text not null check (char_length(target) between 1 and 80),
    x               real check (x between 0 and 1),
    y               real check (y between 0 and 1),
    viewport_width  smallint not null check (viewport_width between 1 and 10000),
    viewport_height smallint not null check (viewport_height between 1 and 10000),
    paint_ms        real not null check (paint_ms between 0 and 60000),
    response_ms     real check (response_ms between 0 and 60000),
    received_at     timestamptz not null default pg_catalog.now(),
    check ((x is null) = (y is null))
);

comment on column public.hci_click_events.elapsed_ms is 'Milliseconds from the tab session start to the click.';
comment on column public.hci_click_events.x is 'Click position as a fraction of viewport width; null for keyboard activation.';
comment on column public.hci_click_events.paint_ms is 'Click to the next rendered frame.';
comment on column public.hci_click_events.response_ms is 'Click until no element is aria-busy; null when still busy after 30 seconds.';

create index if not exists hci_click_events_received_at_idx
    on public.hci_click_events (received_at);

alter table public.hci_click_events enable row level security;
revoke all on table public.hci_click_events from public, anon, authenticated;
grant insert on table public.hci_click_events to anon, authenticated;

do $$
begin
    if not exists (
        select 1 from pg_catalog.pg_policies
        where schemaname = 'public' and tablename = 'hci_click_events'
          and policyname = 'hci_click_events_append'
    ) then
        create policy hci_click_events_append on public.hci_click_events
            for insert to anon, authenticated with check (true);
    end if;
end;
$$;

create or replace view public.hci_region_summary with (security_invoker = true) as
with activity as (
    select pg_catalog.sum(active_ms) as total_ms
    from (select pg_catalog.max(elapsed_ms) as active_ms
          from public.hci_click_events group by session_id) as sessions
)
select e.region,
       pg_catalog.count(*) as clicks,
       pg_catalog.count(distinct e.session_id) as sessions,
       pg_catalog.round(100.0 * pg_catalog.count(*) / pg_catalog.sum(pg_catalog.count(*)) over (), 1) as click_share_pct,
       pg_catalog.round(pg_catalog.count(*) * 60000.0 / nullif(activity.total_ms, 0), 2) as clicks_per_active_minute,
       pg_catalog.percentile_cont(0.5) within group (order by e.paint_ms) as paint_ms_p50,
       pg_catalog.percentile_cont(0.9) within group (order by e.paint_ms) as paint_ms_p90,
       pg_catalog.percentile_cont(0.5) within group (order by e.response_ms) as response_ms_p50,
       pg_catalog.percentile_cont(0.9) within group (order by e.response_ms) as response_ms_p90,
       pg_catalog.count(*) filter (where e.response_ms is null) as response_timeouts
from public.hci_click_events e
cross join activity
group by e.region, activity.total_ms;

revoke all on table public.hci_region_summary from public, anon, authenticated;

create table if not exists public.subscription_plans (
    id                  integer generated always as identity primary key,
    code                varchar(40) not null unique check (code ~ '^[a-z0-9_]+$'),
    name                varchar(80) not null,
    billing_interval    varchar(10) not null check (billing_interval in ('month', 'year')),
    price_amount        numeric(14, 2) not null check (price_amount >= 0),
    currency            char(3) not null default 'IDR' check (currency ~ '^[A-Z]{3}$'),
    features            jsonb not null default '{}'::jsonb
        check (pg_catalog.jsonb_typeof(features) = 'object'),
    is_active           boolean not null default true,
    created_at          timestamptz not null default pg_catalog.now(),
    updated_at          timestamptz not null default pg_catalog.now()
);

comment on column public.subscription_plans.features is 'Entitlements checked by the app, e.g. {"max_profiles": 5}.';
comment on column public.subscription_plans.is_active is 'Offered to new subscribers; retired plans stay readable for existing ones.';

create table if not exists public.subscriptions (
    id                       bigint generated always as identity (maxvalue 9007199254740991) primary key,
    user_id                  uuid not null references auth.users(id) on delete cascade,
    plan_id                  integer not null references public.subscription_plans(id) on delete restrict,
    status                   varchar(20) not null,
    current_period_start     timestamptz not null default pg_catalog.now(),
    current_period_end       timestamptz,
    cancel_at_period_end     boolean not null default false,
    canceled_at              timestamptz,
    provider                 varchar(30),
    provider_customer_id     text,
    provider_subscription_id text,
    created_at               timestamptz not null default pg_catalog.now(),
    updated_at               timestamptz not null default pg_catalog.now(),
    constraint subscriptions_status_ck
        check (status in ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'expired')),
    constraint subscriptions_period_ck
        check (current_period_end is null or current_period_end > current_period_start),
    constraint subscriptions_canceled_ck
        check (status <> 'canceled' or canceled_at is not null),
    constraint subscriptions_provider_ck
        check ((provider is null) = (provider_subscription_id is null)),
    constraint subscriptions_provider_uq unique (provider, provider_subscription_id)
);

comment on column public.subscriptions.current_period_end is 'Access ends here unless renewed; null means no end (manual grant).';

create unique index if not exists subscriptions_one_current_uq
    on public.subscriptions (user_id) where status in ('trialing', 'active', 'past_due');
create index if not exists subscriptions_user_idx
    on public.subscriptions (user_id, created_at desc);
create index if not exists subscriptions_plan_idx
    on public.subscriptions (plan_id);

drop trigger if exists subscription_plans_updated_at_trg on public.subscription_plans;
create trigger subscription_plans_updated_at_trg
before update on public.subscription_plans
for each row execute function private.touch_updated_at();

drop trigger if exists subscriptions_updated_at_trg on public.subscriptions;
create trigger subscriptions_updated_at_trg
before update on public.subscriptions
for each row execute function private.touch_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
revoke all on table public.subscription_plans, public.subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.subscription_plans, public.subscriptions to service_role;

grant select on table public.subscription_plans to anon, authenticated;
grant select on table public.subscriptions to authenticated;

do $$
begin
    if not exists (
        select 1 from pg_catalog.pg_policies
        where schemaname = 'public' and tablename = 'subscription_plans'
          and policyname = 'subscription_plans_read'
    ) then
        create policy subscription_plans_read on public.subscription_plans
            for select to anon, authenticated using (true);
    end if;

    if not exists (
        select 1 from pg_catalog.pg_policies
        where schemaname = 'public' and tablename = 'subscriptions'
          and policyname = 'subscriptions_owner_read'
    ) then
        create policy subscriptions_owner_read on public.subscriptions
            for select to authenticated using ((select auth.uid()) = user_id);
    end if;
end;
$$;

create or replace function public.get_my_subscription()
returns table (subscription_id bigint, plan_code varchar, plan_name varchar,
               features jsonb, status varchar, current_period_end timestamptz,
               cancel_at_period_end boolean)
language sql stable security invoker set search_path = ''
as $$
    select s.id, p.code, p.name, p.features, s.status,
           s.current_period_end, s.cancel_at_period_end
    from public.subscriptions s
    join public.subscription_plans p on p.id = s.plan_id
    where s.user_id = (select auth.uid())
      and s.status in ('trialing', 'active', 'past_due')
      and (s.current_period_end is null or s.current_period_end > pg_catalog.now());
$$;

revoke all on function public.get_my_subscription() from public, anon, authenticated;
grant execute on function public.get_my_subscription() to authenticated, service_role;

commit;
