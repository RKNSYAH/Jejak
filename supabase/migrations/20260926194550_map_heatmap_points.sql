-- Point observations drive a real MapLibre heatmap. District facts remain separate.
begin;

create table public.map_heatmap_points (
    id bigint generated always as identity primary key,
    region_id integer not null references public.regions(id) on delete restrict,
    point_code text not null unique,
    category text not null check (category in ('employment', 'education', 'housing', 'mobility')),
    geometry extensions.geometry(Point, 4326) not null,
    weight smallint not null check (weight between 1 and 5),
    source text not null,
    period_end date,
    limitations text,
    is_sample boolean not null default false,
    created_at timestamptz not null default now()
);

create index map_heatmap_points_region_category_idx
    on public.map_heatmap_points (region_id, category);
create index map_heatmap_points_geometry_idx
    on public.map_heatmap_points using gist (geometry);

alter table public.map_heatmap_points enable row level security;
revoke all on table public.map_heatmap_points from public, anon, authenticated;
grant select, insert, update, delete on table public.map_heatmap_points to service_role;
grant usage, select on sequence public.map_heatmap_points_id_seq to service_role;

-- Browser roles cannot query the table directly. This narrow read exposes only
-- map-safe coordinates and provenance, with sample rows explicitly opted in.
create function public.get_map_heatmap_points(p_include_sample boolean default false)
returns table (
    point_code text,
    region_code varchar(64),
    category text,
    longitude double precision,
    latitude double precision,
    weight smallint,
    source text,
    period_end date,
    limitations text,
    is_sample boolean
)
language sql stable security definer set search_path = ''
as $function$
    select p.point_code, r.code, p.category,
           extensions.ST_X(p.geometry), extensions.ST_Y(p.geometry),
           p.weight, p.source, p.period_end, p.limitations, p.is_sample
    from public.map_heatmap_points p
    join public.regions r on r.id = p.region_id
    where (p_include_sample or (not p.is_sample and not r.is_sample))
      and (r.is_supported or (p_include_sample and r.is_sample))
    order by p.category, r.code, p.point_code;
$function$;

revoke all on function public.get_map_heatmap_points(boolean) from public, anon, authenticated;
grant execute on function public.get_map_heatmap_points(boolean) to anon, authenticated, service_role;

commit;
