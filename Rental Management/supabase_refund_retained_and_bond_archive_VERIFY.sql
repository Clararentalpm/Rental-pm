-- VERIFY — run after supabase_refund_retained_and_bond_archive.sql
-- Expect three OK rows (and optional archive table OK).

select 'action_check' as check_name,
  case
    when exists (
      select 1 from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      join pg_namespace n on t.relnamespace = n.oid
      where n.nspname='public' and t.relname='bond_refund_events'
        and c.conname='bond_refund_events_action_check'
        and pg_get_constraintdef(c.oid) ilike '%refund_retained%'
        and pg_get_constraintdef(c.oid) ilike '%retain_full%'
    ) then 'OK'
    else 'FAIL — bond_refund_events_action_check missing refund_retained/retain_full'
  end as result;

select 'rpc_refund_retained' as check_name,
  case
    when exists (
      select 1 from pg_proc p
      join pg_namespace n on p.pronamespace = n.oid
      where n.nspname='public' and p.proname='refund_retained_bond_atomic'
        and p.prosecdef = false
    ) then 'OK'
    else 'FAIL — refund_retained_bond_atomic missing or SECURITY DEFINER'
  end as result;

select 'rpc_acl' as check_name,
  case
    when has_function_privilege('authenticated', 'public.refund_retained_bond_atomic(bigint,numeric,text,text,text,text,date)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.refund_retained_bond_atomic(bigint,numeric,text,text,text,text,date)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.archive_and_delete_bond(bigint,text)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.restore_archived_bond(text)', 'EXECUTE')
    then 'OK'
    else 'FAIL — EXECUTE grants incorrect'
  end as result;

select 'archive_table' as check_name,
  case
    when to_regclass('public.bond_deletion_archives') is not null then 'OK'
    else 'FAIL — bond_deletion_archives missing'
  end as result;

select 'idempotency_index' as check_name,
  case
    when exists (
      select 1 from pg_indexes
      where schemaname='public'
        and indexname='bond_refund_events_refund_retained_idempotency_uidx'
    ) then 'OK'
    else 'FAIL — refund-retained idempotency index missing'
  end as result;
