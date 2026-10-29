-- VERIFY after supabase_payment_actions_repair.sql (read-only)

select 'tables' as check_name,
  case when to_regclass('public.payment_actions') is not null
        and to_regclass('public.payment_action_history') is not null
        and to_regclass('public.booking_financial_events') is not null
    then 'OK' else 'FAIL — missing table' end as result;

select 'write_policy_profile' as check_name,
  case
    when exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='payment_actions'
        and policyname='payment_actions_write_staff'
        and coalesce(qual,'') ilike '%profiles%'
        and coalesce(qual,'') ilike '%auth.uid%'
        and coalesce(qual,'') not ilike '%owner%manager%'
        and coalesce(with_check,'') not ilike '%role in%'
    ) then 'OK'
    else 'FAIL — payment_actions_write_staff still role-gated or missing'
  end as result;

select 'select_policy' as check_name,
  case when exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payment_actions'
      and policyname='payment_actions_select_authenticated'
  ) then 'OK' else 'FAIL' end as result;

select 'no_anon_write' as check_name,
  case when not exists (
    select 1 from information_schema.role_table_grants
    where table_schema='public' and table_name='payment_actions'
      and grantee in ('anon','public')
      and privilege_type in ('INSERT','UPDATE','DELETE')
  ) then 'OK' else 'FAIL — anon still has write grants' end as result;

-- Row counts (must not drop after repair)
select 'rent_payments' as entity, count(*)::bigint as row_count from public.rent_payments
union all select 'payment_actions', count(*) from public.payment_actions
union all select 'bonds', count(*) from public.bonds
union all select 'tenancies', count(*) from public.tenancies
order by 1;
