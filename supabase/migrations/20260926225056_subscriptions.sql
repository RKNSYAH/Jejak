-- Subscription plans and per-user subscriptions, independent of any payment
-- provider. The backend (service role) writes subscriptions from provider
-- webhooks or manual grants; browsers can only read the catalog and their own rows.
begin;

set local search_path = public, extensions, pg_catalog;
select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

create table public.subscription_plans (
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

-- A user with no current subscription is on the free tier.
create table public.subscriptions (
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
    -- Webhooks upsert on this key; manual grants have no provider and never collide.
    constraint subscriptions_provider_uq unique (provider, provider_subscription_id)
);

comment on column public.subscriptions.current_period_end is 'Access ends here unless renewed; null means no end (manual grant).';

-- At most one ongoing subscription per user; history rows are unrestricted.
create unique index subscriptions_one_current_uq
    on public.subscriptions (user_id) where status in ('trialing', 'active', 'past_due');
create index subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create index subscriptions_plan_idx on public.subscriptions (plan_id);

create trigger subscription_plans_updated_at_trg
before update on public.subscription_plans
for each row execute function private.touch_updated_at();

create trigger subscriptions_updated_at_trg
before update on public.subscriptions
for each row execute function private.touch_updated_at();

alter table public.subscription_plans enable row level security;
alter table public.subscriptions enable row level security;
revoke all on table public.subscription_plans, public.subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.subscription_plans, public.subscriptions to service_role;

-- The catalog is public so a pricing page can read it; filter on is_active there.
grant select on table public.subscription_plans to anon, authenticated;
create policy subscription_plans_read on public.subscription_plans
    for select to anon, authenticated using (true);

grant select on table public.subscriptions to authenticated;
create policy subscriptions_owner_read on public.subscriptions
    for select to authenticated using ((select auth.uid()) = user_id);

-- The caller's current subscription: zero rows means free tier. Past-due keeps
-- access while the provider retries; a lapsed period ends access even if a
-- webhook was missed. Invoker rights, so RLS limits it to the caller's rows.
create function public.get_my_subscription()
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
