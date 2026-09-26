-- ============================================================================
-- POST-MIGRATION VERIFICATION (also safe as PRE-inventory)
-- File: Rental Management/supabase_authorised_full_access_VERIFY.sql
-- ============================================================================
-- Read-only. Does not modify data or policies.
-- Run BEFORE apply (section A) to inventory role-gated policies.
-- Run AFTER apply (all sections) to confirm profile-membership writes.
-- ============================================================================

-- A) Full public policy inventory (SAVE THIS OUTPUT before apply / for rollback review)
select
  tablename,
  policyname,
  cmd,
  roles,
  qual as using_expr,
  with_check as with_check_expr,
  case
    when coalesce(qual,'') ~* 'role' and coalesce(qual,'') ~* 'owner|manager'
      then 'ROLE-GATED USING'
    when coalesce(with_check,'') ~* 'role' and coalesce(with_check,'') ~* 'owner|manager'
      then 'ROLE-GATED WITH CHECK'
    when coalesce(qual,'') ilike '%profiles%' and coalesce(qual,'') ilike '%auth.uid%'
      then 'PROFILE-MEMBERSHIP USING'
    when coalesce(with_check,'') ilike '%profiles%' and coalesce(with_check,'') ilike '%auth.uid%'
      then 'PROFILE-MEMBERSHIP WITH CHECK'
    when cmd = 'SELECT' then 'SELECT'
    else 'OTHER — REVIEW'
  end as access_class
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- B) Known payment_* write policies must be profile-membership after apply
select
  tablename,
  policyname,
  cmd,
  case
    when coalesce(qual,'') ilike '%profiles%' and coalesce(qual,'') ilike '%auth.uid%'
      and coalesce(qual,'') !~* 'role\s+in'
      and coalesce(with_check,'') !~* 'role\s+in'
      then 'OK profile-membership'
    when coalesce(with_check,'') ilike '%profiles%' and coalesce(with_check,'') ilike '%auth.uid%'
      and coalesce(with_check,'') !~* 'role\s+in'
      then 'OK profile-membership'
    when coalesce(qual,'') ~* 'owner|manager' or coalesce(with_check,'') ~* 'owner|manager'
      then 'FAIL still role-gated — re-apply supabase_authorised_full_access.sql'
    else 'REVIEW'
  end as status
from pg_policies
where schemaname = 'public'
  and tablename in ('payment_actions','payment_action_history','booking_financial_events')
  and policyname in (
    'payment_actions_write_staff',
    'payment_action_history_insert_staff',
    'booking_financial_events_insert_staff'
  )
order by tablename, policyname;

-- C) Remaining role-gated WRITE policies (expect 0 rows after successful apply)
select
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and cmd <> 'SELECT'
  and (
    (coalesce(qual,'') ~* 'role' and coalesce(qual,'') ~* 'owner|manager')
    or (coalesce(with_check,'') ~* 'role' and coalesce(with_check,'') ~* 'owner|manager')
  )
order by tablename, policyname;

-- D) RLS still enabled on core tables (must stay true)
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  case when c.relrowsecurity then 'OK' else 'FAIL — RLS off' end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'properties','rooms','tenants','tenancies','bonds','rent_payments','profiles',
    'room_profiles','room_price_history','activity_log','bond_payment_events',
    'bond_refund_events','room_viewings','payment_actions','payment_action_history',
    'booking_financial_events'
  )
order by 1;

-- E) Anon must not hold write grants on payment_* (defense in depth)
select
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('payment_actions','payment_action_history','booking_financial_events')
  and grantee in ('anon','public')
  and privilege_type in ('INSERT','UPDATE','DELETE')
order by table_name, privilege_type;
-- Expect 0 rows.

-- F) Business row counts unchanged by this migration (policy-only; no data mutations)
select 'tenants' as entity, count(*)::bigint as row_count from public.tenants
union all select 'tenancies', count(*) from public.tenancies
union all select 'rent_payments', count(*) from public.rent_payments
union all select 'bonds', count(*) from public.bonds
union all select 'rooms', count(*) from public.rooms
union all select 'profiles', count(*) from public.profiles
order by 1;

-- G) Live probe checklist (manual — requires signed-in JWTs; do NOT run as service role)
-- 1. Account WITH profiles row (any role label): INSERT/UPDATE on payment_actions should succeed.
-- 2. Account WITHOUT profiles row: same write must fail (42501).
-- 3. Anon key: same write must fail.
-- 4. Staff Edge Functions: invite / resend / delete succeed for non-owner profile labels
--    only AFTER edge-function deploy (see EDGE_FUNCTIONS_AUTHORISED_ACCESS.md).
-- Frontend-only tests cannot prove (1)–(4).
