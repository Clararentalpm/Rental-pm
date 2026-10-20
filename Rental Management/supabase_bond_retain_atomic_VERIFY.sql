-- =============================================================================
-- VERIFY — supabase_bond_retain_atomic.sql
-- Run in Supabase SQL Editor AFTER and AFTER applying the forward migration.
-- Does not mutate business data.
-- =============================================================================

-- 1) Function present + SECURITY INVOKER (not DEFINER)
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as args,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END as security,
  CASE WHEN p.prosecdef THEN 'FAIL' ELSE 'PASS' END as security_check
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'retain_bond_atomic';

-- 2) Unique idempotency index present
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname = 'bond_refund_events_retain_idempotency_uidx';

-- 3) EXECUTE grants — expect authenticated YES; PUBLIC/anon must be absent
select grantee, privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name = 'retain_bond_atomic'
order by grantee, privilege_type;

-- 4) Hard fail if PUBLIC or anon still has EXECUTE
select
  case
    when exists (
      select 1
      from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'retain_bond_atomic'
        and privilege_type = 'EXECUTE'
        and grantee in ('PUBLIC', 'anon')
    ) then 'FAIL — PUBLIC or anon still has EXECUTE'
    when exists (
      select 1
      from information_schema.routine_privileges
      where routine_schema = 'public'
        and routine_name = 'retain_bond_atomic'
        and privilege_type = 'EXECUTE'
        and grantee = 'authenticated'
    ) then 'PASS — EXECUTE only for authenticated (no PUBLIC/anon)'
    else 'FAIL — authenticated missing EXECUTE'
  end as execute_acl_check;

-- 5) Smoke (read-only): expected PostgREST path
-- POST /rest/v1/rpc/retain_bond_atomic
select 'ok — review rows above; function + unique index + ACL must pass before app deploy' as note;
