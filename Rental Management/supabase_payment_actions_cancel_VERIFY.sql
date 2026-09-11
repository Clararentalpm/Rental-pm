-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- File: Rental Management/supabase_payment_actions_cancel_VERIFY.sql
-- ============================================================================
-- Run IMMEDIATELY AFTER supabase_payment_actions_cancel.sql
-- Read-only checks (SELECT only). Does not modify data.
--
-- Optional: before migration, note these counts for comparison:
--   select 'tenants' as entity, count(*) from public.tenants
--   union all select 'tenancies', count(*) from public.tenancies
--   union all select 'rent_payments', count(*) from public.rent_payments
--   union all select 'bonds', count(*) from public.bonds;
-- ============================================================================

-- A) Expected tables exist
select
  c.relname as table_name,
  case when c.relname is not null then 'OK' else 'MISSING' end as status
from (values
  ('payment_actions'),
  ('payment_action_history'),
  ('booking_financial_events')
) as expected(table_name)
left join pg_class c
  on c.relname = expected.table_name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind = 'r'
order by expected.table_name;

-- B) Expected new columns exist on tenancies / bonds
select
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'tenancies' and column_name in (
      'cancelled_at','cancelled_by','cancellation_reason','cancellation_notes',
      'deposit_treatment','rent_treatment'
    ))
    or
    (table_name = 'bonds' and column_name in (
      'forfeited_amount','forfeited_at','forfeited_by','forfeiture_reason','deposit_status'
    ))
  )
order by table_name, column_name;

-- C) Business row counts (should match pre-migration counts; must not be reduced by migration)
select 'tenants' as entity, count(*)::bigint as row_count from public.tenants
union all select 'tenancies', count(*) from public.tenancies
union all select 'rent_payments', count(*) from public.rent_payments
union all select 'bonds', count(*) from public.bonds
union all select 'rooms', count(*) from public.rooms
union all select 'payment_actions (expect 0 right after migrate)', count(*) from public.payment_actions
union all select 'payment_action_history (expect 0)', count(*) from public.payment_action_history
union all select 'booking_financial_events (expect 0)', count(*) from public.booking_financial_events
order by 1;

-- D) No automatic forfeiture / cancel classification from migration alone
select
  count(*) filter (where deposit_status is not null) as bonds_with_deposit_status,
  count(*) filter (where coalesce(forfeited_amount, 0) > 0) as bonds_with_forfeit_gt_zero,
  count(*) filter (where forfeited_at is not null) as bonds_with_forfeited_at
from public.bonds;
-- Expect all zeros immediately after migration (unless you already used forfeit in the app earlier).

select
  count(*) filter (where cancelled_at is not null) as tenancies_with_cancelled_at,
  count(*) filter (where cancellation_reason is not null) as tenancies_with_cancel_reason
from public.tenancies;
-- Expect zeros immediately after migration (unless cancels were already recorded via notes/status before).

-- E) RLS enabled on new tables
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  case when c.relrowsecurity then 'OK' else 'FAIL' end as status
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('payment_actions','payment_action_history','booking_financial_events')
order by 1;

-- F) Owner/Manager write policies + authenticated select policies exist
select
  tablename,
  policyname,
  cmd,
  roles
from pg_policies
where schemaname = 'public'
  and tablename in ('payment_actions','payment_action_history','booking_financial_events')
order by tablename, policyname;

-- Expected policy names:
--   payment_actions_select_authenticated (SELECT)
--   payment_actions_write_staff (ALL, owner/manager check)
--   payment_action_history_select_authenticated (SELECT)
--   payment_action_history_insert_staff (INSERT, owner/manager check)
--   booking_financial_events_select_authenticated (SELECT)
--   booking_financial_events_insert_staff (INSERT, owner/manager check)

-- G) Viewer cannot write (policy definition check)
-- Write policies must reference profiles.role in ('owner','manager').
select
  tablename,
  policyname,
  cmd,
  case
    when qual ilike '%owner%' and qual ilike '%manager%' then 'OK staff-only USING'
    when with_check ilike '%owner%' and with_check ilike '%manager%' then 'OK staff-only WITH CHECK'
    when cmd = 'SELECT' then 'OK select-all'
    else 'REVIEW'
  end as viewer_write_guard
from pg_policies
where schemaname = 'public'
  and tablename in ('payment_actions','payment_action_history','booking_financial_events')
order by tablename, policyname;

-- H) Optional live probe (run while signed in as Viewer in SQL editor if desired):
-- insert into public.payment_actions (notes) values ('viewer probe');
-- Expect: fail / policy violation for Viewer.
-- delete from public.payment_actions where notes = 'viewer probe'; -- only if insert somehow succeeded
