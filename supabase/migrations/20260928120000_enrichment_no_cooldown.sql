-- Enrichment runs are started by user prompts, so a failed or partial run must
-- not block the next request. Retry cooldowns drop to zero (a policy may still
-- opt back in), and each run may use more sources so LF-01 can cover job boards.

begin;

set local search_path = public, extensions, pg_catalog;

select pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('jejak:schema-migrations', 0)
);

alter table public.evidence_cache_policies
    drop constraint if exists evidence_cache_policies_budget_ck;

alter table public.evidence_cache_policies
    add constraint evidence_cache_policies_budget_ck
        check (max_sources_per_run between 1 and 100
            and retry_after_minutes >= 0);

-- source_budget = min(max_sources_per_run, ceil(needed / 4)): 8 lets a full
-- 25-record refresh ask for 7 sources per evidence type.
update public.evidence_cache_policies
set retry_after_minutes = 0,
    max_sources_per_run = 8;

-- Lift cooldowns already recorded under the old policy.
update public.enrichment_runs
set next_retry_at = null
where next_retry_at > pg_catalog.now();

commit;
