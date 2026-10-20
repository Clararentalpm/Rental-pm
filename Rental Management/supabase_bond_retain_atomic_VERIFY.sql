-- =============================================================================
-- VERIFY — supabase_bond_retain_atomic.sql
-- Run in Supabase SQL Editor AFTER and AFTER applying the forward migration.
-- Does not mutate business data.
-- =============================================================================

-- 1) Function present
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'retain_bond_atomic';

-- 2) Unique idempotency index present
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'bond_refund_events_retain_idempotency_uidx';

-- 3) Execute grant for authenticated
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'retain_bond_atomic'
  and grantee in ('authenticated', 'PUBLIC', 'anon');

-- 4) Smoke (read-only): describe expected PostgREST path
-- POST /rest/v1/rpc/retain_bond_atomic
-- Body: {
--   "p_bond_id": <id>,
--   "p_mode": "partial"|"full",
--   "p_amount": <number>,
--   "p_reason": "<text>",
--   "p_idempotency_key": "retain:<bondId>:...",
--   "p_retained_at": "YYYY-MM-DD"
-- }
select 'ok — review rows above; function + unique index must exist before app deploy' as note;
