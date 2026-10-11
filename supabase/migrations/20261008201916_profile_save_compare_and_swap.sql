begin;

set local search_path = public, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

drop function public.save_confirmed_relocation_profile(uuid, varchar, jsonb);

create function public.save_confirmed_relocation_profile(
    p_user_id uuid,
    p_profile_name varchar,
    p_profile jsonb,
    p_expected_revision integer
)
returns table (
    id bigint,
    revision integer,
    confirmed_at timestamptz,
    updated_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
    current_profile public.relocation_profiles%rowtype;
    has_current boolean;
    next_revision integer;
begin
    if p_user_id is null
       or p_profile_name is null
       or p_profile_name <> pg_catalog.btrim(p_profile_name)
       or pg_catalog.length(p_profile_name) not between 1 and 120 then
        raise exception 'a user id and valid profile name are required';
    end if;

    if p_profile is null
       or pg_catalog.jsonb_typeof(p_profile) <> 'object'
       or pg_catalog.octet_length(p_profile::text) > 60000
       or (p_profile - array[
            'schema_version', 'hard_constraints', 'soft_preferences', 'priority_weights',
            'taxonomy_version', 'contract_version'
       ]::text[]) <> '{}'::jsonb
       or not (p_profile ?& array[
            'schema_version', 'hard_constraints', 'soft_preferences', 'priority_weights',
            'taxonomy_version', 'contract_version'
       ]::text[])
       or pg_catalog.jsonb_typeof(p_profile->'hard_constraints') <> 'object'
       or pg_catalog.jsonb_typeof(p_profile->'soft_preferences') <> 'object'
       or pg_catalog.jsonb_typeof(p_profile->'priority_weights') <> 'object'
       or p_profile->>'schema_version' <> 'relocation-profile-v1'
       or p_profile->>'contract_version' <> 'lf05-v2'
       or pg_catalog.jsonb_typeof(p_profile->'taxonomy_version') <> 'string' then
        raise exception 'invalid confirmed relocation profile';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
            'jejak:relocation-profile:' || p_user_id::text || ':' || p_profile_name,
            0
        )
    );

    select p.*
    into current_profile
    from public.relocation_profiles as p
    where p.user_id = p_user_id
      and p.profile_name = p_profile_name
      and p.confirmed
    order by p.revision desc
    limit 1
    for update;
    has_current := found;

    if has_current and current_profile.profile = p_profile then
        return query select current_profile.id, current_profile.revision,
            current_profile.confirmed_at, current_profile.updated_at;
        return;
    end if;

    if (has_current and p_expected_revision is distinct from current_profile.revision)
       or (not has_current and p_expected_revision is not null) then
        raise exception using errcode = '40001', message = 'PROFILE_REVISION_CONFLICT';
    end if;

    select coalesce(pg_catalog.max(p.revision), 0) + 1
    into next_revision
    from public.relocation_profiles as p
    where p.user_id = p_user_id
      and p.profile_name = p_profile_name;

    return query
    insert into public.relocation_profiles as saved (
        user_id, profile_name, revision, profile, confirmed, confirmed_at
    ) values (
        p_user_id, p_profile_name, next_revision, p_profile, true, pg_catalog.now()
    )
    returning saved.id, saved.revision, saved.confirmed_at, saved.updated_at;
end;
$$;

revoke all on function public.save_confirmed_relocation_profile(uuid, varchar, jsonb, integer)
    from public, anon, authenticated;
grant execute on function public.save_confirmed_relocation_profile(uuid, varchar, jsonb, integer)
    to service_role;

commit;
