-- VERIFY — after supabase_refund_retained_and_bond_archive.sql
-- Expect OK on every row. Do not apply from agents; owner runs manually.

select 'action_check_received' as check_name,
  case
    when exists (
      select 1 from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      join pg_namespace n on t.relnamespace = n.oid
      where n.nspname='public' and t.relname='bond_refund_events'
        and c.conname='bond_refund_events_action_check'
        and pg_get_constraintdef(c.oid) ilike '%received%'
        and pg_get_constraintdef(c.oid) ilike '%refund_retained%'
        and pg_get_constraintdef(c.oid) ilike '%retain_full%'
        and pg_get_constraintdef(c.oid) ilike '%partial_refund%'
    ) then 'OK'
    else 'FAIL — action_check must keep received and add refund_retained'
  end as result;

select 'action_check_no_extra_drops' as check_name,
  case
    when (
      select count(*) from pg_constraint c
      join pg_class t on c.conrelid = t.oid
      join pg_namespace n on t.relnamespace = n.oid
      where n.nspname='public' and t.relname='bond_refund_events' and c.contype='c'
    ) >= 1
    then 'OK'
    else 'FAIL — expected at least action_check constraint present'
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

select 'rpc_acl_editors' as check_name,
  case
    when has_function_privilege('authenticated', 'public.refund_retained_bond_atomic(bigint,numeric,text,text,text,text,date)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.archive_and_delete_bond(bigint,text)', 'EXECUTE')
     and has_function_privilege('authenticated', 'public.restore_archived_bond(text)', 'EXECUTE')
     and not has_function_privilege('anon', 'public.refund_retained_bond_atomic(bigint,numeric,text,text,text,text,date)', 'EXECUTE')
     and to_regprocedure('public.can_edit_rental()') is not null
     and to_regprocedure('public.is_rental_staff()') is not null
    then 'OK'
    else 'FAIL — EXECUTE grants or staff helpers missing'
  end as result;

select 'archive_rls_staff' as check_name,
  case
    when exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='bond_deletion_archives'
        and policyname='bond_deletion_archives_select_staff'
        and coalesce(qual,'') ilike '%is_rental_staff%'
    ) and exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='bond_deletion_archives'
        and policyname='bond_deletion_archives_write_editors'
        and (coalesce(qual,'') ilike '%can_edit_rental%' or coalesce(with_check,'') ilike '%can_edit_rental%')
    )
    and not exists (
      select 1 from pg_policies
      where schemaname='public' and tablename='bond_deletion_archives'
        and (coalesce(qual,'') ilike '%profiles p where p.id = auth.uid()%'
          or coalesce(with_check,'') ilike '%profiles p where p.id = auth.uid()%')
        and coalesce(qual,'') not ilike '%is_rental_staff%'
        and coalesce(qual,'') not ilike '%can_edit_rental%'
    )
    then 'OK'
    else 'FAIL — archive RLS must use is_rental_staff/can_edit_rental'
  end as result;

select 'archive_table' as check_name,
  case when to_regclass('public.bond_deletion_archives') is not null then 'OK'
       else 'FAIL — bond_deletion_archives missing' end as result;

select 'idempotency_index' as check_name,
  case
    when exists (
      select 1 from pg_indexes
      where schemaname='public'
        and indexname='bond_refund_events_refund_retained_idempotency_uidx'
    ) then 'OK'
    else 'FAIL — refund-retained idempotency index missing'
  end as result;
