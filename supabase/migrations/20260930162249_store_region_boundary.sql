-- Persist validated BIG boundaries through a backend-only, update-only RPC.
-- Existing geometry and the region's other source metadata remain unchanged.
begin;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

create function public.store_region_boundary(
    p_region_code text,
    p_geometry jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '5s'
set lock_timeout = '2s'
as $$
declare
    boundary extensions.geometry;
begin
    if p_geometry is null
       or p_geometry->>'type' is distinct from 'MultiPolygon' then
        raise exception 'Expected MultiPolygon geometry';
    end if;

    boundary := extensions.ST_GeomFromGeoJSON(p_geometry::text);

    if extensions.ST_SRID(boundary) <> 4326
       or extensions.ST_NDims(boundary) <> 2
       or extensions.ST_IsEmpty(boundary)
       or not extensions.ST_IsValid(boundary) then
        raise exception 'Invalid boundary geometry';
    end if;

    update public.regions
    set geometry = boundary,
        updated_at = pg_catalog.now()
    where region_code = p_region_code
      and region_type = 'district'
      and geometry is null;

    -- Another request may already have stored a boundary for this district.
    if not found and not exists (
        select 1
        from public.regions
        where region_code = p_region_code
          and region_type = 'district'
          and geometry is not null
    ) then
        raise exception 'Unknown district: %', p_region_code;
    end if;
end;
$$;

revoke execute on function public.store_region_boundary(text, jsonb)
    from public, anon, authenticated;
grant execute on function public.store_region_boundary(text, jsonb)
    to service_role;
-- SECURITY INVOKER also needs access to the PostGIS schema in local fixtures.
grant usage on schema extensions to service_role;

notify pgrst, 'reload schema';

commit;
