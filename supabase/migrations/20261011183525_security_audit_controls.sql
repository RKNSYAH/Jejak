begin;

set local search_path = public, extensions, pg_catalog;
select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

revoke insert on table public.hci_click_events from public, anon, authenticated;
grant insert on table public.hci_click_events to service_role;
drop policy if exists hci_click_events_append on public.hci_click_events;

create table private.hci_click_budget (
    client_key text not null check (client_key = 'gc' or client_key ~ '^[a-f0-9]{64}$'),
    window_start timestamptz not null,
    click_count integer not null check (click_count between 0 and 500),
    primary key (client_key, window_start)
);
create index hci_click_budget_expiry_idx on private.hci_click_budget (window_start);

alter table private.hci_click_budget enable row level security;
revoke all on table private.hci_click_budget from public, anon, authenticated, service_role;

create function public.consume_hci_click_budget(p_client_hash text, p_click_count integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_window_start timestamptz;
    accepted_count integer;
begin
    if p_client_hash is null or p_client_hash !~ '^[a-f0-9]{64}$' or p_click_count is null or p_click_count not between 1 and 50 then
        raise exception 'invalid click budget request';
    end if;

    v_window_start := pg_catalog.to_timestamp(
        pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()) / 3600) * 3600
    );

    insert into private.hci_click_budget (client_key, window_start, click_count)
    values ('gc', v_window_start, 0)
    on conflict do nothing;
    if found then
        delete from private.hci_click_budget
        where window_start < v_window_start - interval '24 hours';
    end if;

    insert into private.hci_click_budget as budget (client_key, window_start, click_count)
    values (p_client_hash, v_window_start, p_click_count)
    on conflict (client_key, window_start) do update
    set click_count = budget.click_count + excluded.click_count
    where budget.click_count + excluded.click_count <= 500
    returning click_count into accepted_count;

    if found then
        return 0;
    end if;
    return greatest(1, ceil(extract(epoch from (v_window_start + interval '1 hour' - pg_catalog.clock_timestamp())))::integer);
end;
$$;

revoke all on function public.consume_hci_click_budget(text, integer) from public, anon, authenticated;
grant execute on function public.consume_hci_click_budget(text, integer) to service_role;

commit;
