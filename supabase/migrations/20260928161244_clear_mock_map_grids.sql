-- Remove synthetic housing/employment data while preserving map read contracts.
-- Preserve administrative boundaries and separately collected enrichment evidence.
begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

-- Refuse to silently discard any future non-sample grid observations.
do $$
begin
    if exists (select 1 from public.regions where region_type = 'grid' and not is_sample)
       or exists (select 1 from public.region_data d
                  join public.regions r on r.id = d.region_id
                  where r.region_type = 'grid' and not d.is_sample) then
        raise exception 'non-sample grid data exists; review before removal';
    end if;
end;
$$;

delete from public.region_data d
using public.regions r
where d.region_id = r.id and r.region_type = 'grid' and r.is_sample;

delete from public.regions where region_type = 'grid' and is_sample;

-- These are fictional district metrics, not the district boundaries themselves.
delete from public.region_data d
using public.regions r
where d.region_id = r.id and r.region_type = 'district' and d.is_sample;

delete from public.housing_observations where is_sample;
delete from public.zone_stats where source = 'SAMPLE';

commit;
