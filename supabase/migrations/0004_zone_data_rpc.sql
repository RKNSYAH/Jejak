-- Expose get_zone_data() read-only over Supabase PostgREST for LF-01's DB-first read.
-- Langflow Desktop calls POST /rest/v1/rpc/get_zone_data with the anon key.
--
-- SECURITY DEFINER lets the one RPC read zone_stats while the table itself stays
-- RLS-locked with no policies, so the anon key can reach ONLY this accessor and
-- nothing else in the schema. `set search_path` hardens the definer function.

alter table public.zone_stats enable row level security;  -- no policies: no direct table access

alter function public.get_zone_data(text) security definer;
alter function public.get_zone_data(text) set search_path = public;
revoke all on function public.get_zone_data(text) from public;
grant execute on function public.get_zone_data(text) to anon;

-- Verify from a shell (should return the Setiabudi row):
--   curl -s "$SUPABASE_URL/rest/v1/rpc/get_zone_data" \
--     -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H "Content-Type: application/json" \
--     -d '{"p_zone_id":"setiabudi"}'
