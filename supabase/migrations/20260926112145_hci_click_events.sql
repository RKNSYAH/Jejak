-- Anonymous alpha interaction telemetry. The browser session ID is random per
-- tab and is not linked to auth.users; target labels never contain input values.
begin;

set local search_path = public, extensions, pg_catalog;
select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

create table public.hci_click_events (
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
    received_at     timestamptz not null default now(),
    check ((x is null) = (y is null))
);

comment on column public.hci_click_events.elapsed_ms is 'Milliseconds from the tab session start to the click.';
comment on column public.hci_click_events.x is 'Click position as a fraction of viewport width; null for keyboard activation.';
comment on column public.hci_click_events.paint_ms is 'Click to the next rendered frame.';
comment on column public.hci_click_events.response_ms is 'Click until no element is aria-busy; null when still busy after 30 seconds.';

create index hci_click_events_received_at_idx on public.hci_click_events (received_at);

alter table public.hci_click_events enable row level security;
revoke all on table public.hci_click_events from public, anon, authenticated;
-- Insert-only for browsers: no select, so rows cannot be read back through the Data API.
grant insert on table public.hci_click_events to anon, authenticated;
create policy hci_click_events_append on public.hci_click_events
    for insert to anon, authenticated with check (true);

-- Dashboard summary. Click rate divides clicks by summed session activity,
-- where a session's activity runs from its start to its last click.
create view public.hci_region_summary with (security_invoker = true) as
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

commit;
