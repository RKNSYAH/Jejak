-- Correct the date regex as applied in the preceding remote migration.
-- Remote migration version: 20260925194645.
-- Use [0-9] so this expression is independent of string-escape handling.
begin;

set local search_path = public, extensions, pg_catalog;
select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

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
        if item.key in (
            'observed_office_count', 'observed_organizations',
            'offices_with_local_headcount_evidence', 'organizations_without_headcount',
            'sources_monitored', 'opening_count', 'housing_count'
        ) then
            if pg_catalog.jsonb_typeof(item.value) <> 'number'
               or item.value::numeric < 0
               or item.value::numeric <> pg_catalog.trunc(item.value::numeric) then
                return false;
            end if;
        elsif item.key in ('estimated_employment', 'monthly_rent_idr', 'salary_idr') then
            range_value := item.value;
            if pg_catalog.jsonb_typeof(range_value) <> 'object'
               or (range_value - array['minimum', 'maximum', 'status', 'method_version']) <> '{}'::jsonb
               or not (range_value ? 'status')
               or range_value->>'status' not in ('observed', 'estimated', 'unavailable')
               or pg_catalog.jsonb_typeof(range_value->'status') <> 'string' then
                return false;
            end if;
            if range_value ? 'method_version' then
                if item.key <> 'estimated_employment'
                   or pg_catalog.jsonb_typeof(range_value->'method_version') <> 'string'
                   or range_value->>'method_version' !~ '^[a-z0-9][a-z0-9_-]{0,49}$' then
                    return false;
                end if;
            end if;
            if range_value->>'status' = 'unavailable' then
                if range_value ?| array['minimum', 'maximum', 'method_version'] then
                    return false;
                end if;
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
        elsif item.key in ('as_of', 'oldest_material_evidence') then
            if pg_catalog.jsonb_typeof(item.value) <> 'string'
               or item.value #>> '{}' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
                return false;
            end if;
        else
            return false;
        end if;
    end loop;
    return true;
end;
$$;

commit;
