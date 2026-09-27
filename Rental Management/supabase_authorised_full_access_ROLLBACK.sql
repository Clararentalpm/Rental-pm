-- ============================================================================
-- ROLLBACK ONLY — optional, manual
-- File: Rental Management/supabase_authorised_full_access_ROLLBACK.sql
-- ============================================================================
-- Restores the THREE known payment_* write policies to role-gated form
-- (profiles.role in ('owner','manager')) as created by supabase_payment_actions_cancel.sql.
--
-- Does NOT automatically restore other policies rewritten by section 4 of
-- supabase_authorised_full_access.sql. For those:
--   1. Use the pre-apply VERIFY section A inventory, OR
--   2. Re-apply from your own policy backup / Supabase dashboard history.
--
-- Does NOT delete rental rows. Does NOT disable RLS. Does NOT touch Edge Functions
-- (redeploy previous Edge Function versions separately if needed).
-- ============================================================================

-- 1) payment_actions_write_staff → owner/manager
do $$
begin
  if to_regclass('public.payment_actions') is null then
    raise notice 'payment_actions missing — skip';
    return;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payment_actions' and policyname='payment_actions_write_staff'
  ) then
    drop policy payment_actions_write_staff on public.payment_actions;
  end if;
  create policy payment_actions_write_staff on public.payment_actions
    for all to authenticated
    using (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('owner', 'manager')
      )
    )
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('owner', 'manager')
      )
    );
end $$;

-- 2) payment_action_history_insert_staff → owner/manager
do $$
begin
  if to_regclass('public.payment_action_history') is null then
    raise notice 'payment_action_history missing — skip';
    return;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payment_action_history' and policyname='payment_action_history_insert_staff'
  ) then
    drop policy payment_action_history_insert_staff on public.payment_action_history;
  end if;
  create policy payment_action_history_insert_staff on public.payment_action_history
    for insert to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('owner', 'manager')
      )
    );
end $$;

-- 3) booking_financial_events_insert_staff → owner/manager
do $$
begin
  if to_regclass('public.booking_financial_events') is null then
    raise notice 'booking_financial_events missing — skip';
    return;
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='booking_financial_events' and policyname='booking_financial_events_insert_staff'
  ) then
    drop policy booking_financial_events_insert_staff on public.booking_financial_events;
  end if;
  create policy booking_financial_events_insert_staff on public.booking_financial_events
    for insert to authenticated
    with check (
      exists (
        select 1 from public.profiles p
        where p.id = auth.uid() and p.role in ('owner', 'manager')
      )
    );
end $$;

-- 4) Reminder for dynamically rewritten policies
do $$
begin
  raise notice 'ROLLBACK of payment_* policies complete.';
  raise notice 'If section 4 rewrote other tables, restore them from pre-apply VERIFY inventory.';
  raise notice 'Redeploy previous Edge Function versions if staff invites must be owner-only again.';
end $$;
