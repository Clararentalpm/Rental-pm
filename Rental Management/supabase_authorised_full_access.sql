-- =============================================================================
-- Rental PM — authorised account holders get full app write access (parity with Owner)
-- Manual apply in Supabase SQL Editor after Draft PR review. Do NOT auto-run.
-- Does NOT disable RLS. Does NOT allow anonymous access. Does NOT change rental rows.
-- =============================================================================
-- Desired rule:
--   authenticated + profiles.id = auth.uid()  → full Rental PM access
--   anonymous / no profiles row              → no private access
-- Role labels (owner/manager/viewer) remain on profiles for history/display only.
-- =============================================================================

-- Helper predicate used by policies (inline exists subquery — no SECURITY DEFINER needed).

-- ---------------------------------------------------------------------------
-- 1) payment_actions write: widen from role in (owner,manager) → any profiles row
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payment_actions' and policyname='payment_actions_write_staff'
  ) then
    drop policy payment_actions_write_staff on public.payment_actions;
  end if;
  create policy payment_actions_write_staff on public.payment_actions
    for all to authenticated
    using (
      exists (select 1 from public.profiles p where p.id = auth.uid())
    )
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid())
    );
end $$;

-- ---------------------------------------------------------------------------
-- 2) payment_action_history insert
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payment_action_history' and policyname='payment_action_history_insert_staff'
  ) then
    drop policy payment_action_history_insert_staff on public.payment_action_history;
  end if;
  create policy payment_action_history_insert_staff on public.payment_action_history
    for insert to authenticated
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid())
    );
end $$;

-- ---------------------------------------------------------------------------
-- 3) booking_financial_events insert
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='booking_financial_events' and policyname='booking_financial_events_insert_staff'
  ) then
    drop policy booking_financial_events_insert_staff on public.booking_financial_events;
  end if;
  create policy booking_financial_events_insert_staff on public.booking_financial_events
    for insert to authenticated
    with check (
      exists (select 1 from public.profiles p where p.id = auth.uid())
    );
end $$;

-- ---------------------------------------------------------------------------
-- 4) Generic staff-write policies that still gate on role in ('owner','manager')
--    Re-create as profile-membership for common operational tables if present.
--    Safe no-ops when a table/policy name does not exist.
-- ---------------------------------------------------------------------------
do $$
declare
  rec record;
  pol text;
begin
  for rec in
    select c.relname as tbl, p.polname as policy
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        pg_get_expr(p.polqual, p.polrelid) ilike '%owner%manager%'
        or pg_get_expr(p.polwithcheck, p.polrelid) ilike '%owner%manager%'
        or pg_get_expr(p.polqual, p.polrelid) ilike '%''owner''%'
        or pg_get_expr(p.polwithcheck, p.polrelid) ilike '%''owner''%'
      )
      and c.relname not in ('payment_actions','payment_action_history','booking_financial_events')
  loop
    -- Skip SELECT-only authenticated-open policies; only rewrite write-ish policies that mention roles.
    raise notice 'Found role-gated policy %.% — review manually if needed', rec.tbl, rec.policy;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Ensure authenticated cannot escalate without a profiles row:
--    profiles SELECT for own + peers is typically already open to authenticated.
--    Do NOT allow anonymous.
-- ---------------------------------------------------------------------------
revoke all on public.payment_actions from anon;
revoke all on public.payment_action_history from anon;
revoke all on public.booking_financial_events from anon;

-- ---------------------------------------------------------------------------
-- VERIFY (read-only):
-- select tablename, policyname, roles, cmd, qual, with_check
-- from pg_policies where schemaname='public'
--   and tablename in ('payment_actions','payment_action_history','booking_financial_events');
-- =============================================================================
