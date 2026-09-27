-- =============================================================================
-- Rental PM — authorised account holders get full app write access (parity with Owner)
-- Manual apply in Supabase SQL Editor. Do NOT auto-run. Do NOT run from CI.
-- Does NOT disable RLS. Does NOT allow anonymous access. Does NOT change rental rows.
-- =============================================================================
-- Desired rule:
--   authenticated + profiles.id = auth.uid()  → full Rental PM access
--   anonymous / no profiles row              → no private access
-- Role labels (owner/manager/viewer) remain on profiles for history/display only.
--
-- BEFORE applying: run supabase_authorised_full_access_VERIFY.sql section A
-- and save the inventory output (needed for safe rollback review).
-- AFTER applying: run supabase_authorised_full_access_VERIFY.sql in full.
-- ROLLBACK: supabase_authorised_full_access_ROLLBACK.sql (restores known payment_*
-- policies to role-gated form; dynamically rewritten policies need manual review).
-- =============================================================================

-- Helper predicate used by policies (inline exists subquery — no SECURITY DEFINER).

-- ---------------------------------------------------------------------------
-- 0) Snapshot notice — save VERIFY inventory before continuing
-- ---------------------------------------------------------------------------
do $$
begin
  raise notice 'PREREQ: save pg_policies inventory (VERIFY section A) before apply.';
end $$;

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
  if to_regclass('public.payment_actions') is not null then
    create policy payment_actions_write_staff on public.payment_actions
      for all to authenticated
      using (
        exists (select 1 from public.profiles p where p.id = auth.uid())
      )
      with check (
        exists (select 1 from public.profiles p where p.id = auth.uid())
      );
  end if;
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
  if to_regclass('public.payment_action_history') is not null then
    create policy payment_action_history_insert_staff on public.payment_action_history
      for insert to authenticated
      with check (
        exists (select 1 from public.profiles p where p.id = auth.uid())
      );
  end if;
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
  if to_regclass('public.booking_financial_events') is not null then
    create policy booking_financial_events_insert_staff on public.booking_financial_events
      for insert to authenticated
      with check (
        exists (select 1 from public.profiles p where p.id = auth.uid())
      );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Rewrite OTHER public write policies that still gate on role in ('owner','manager')
--    SELECT-only policies are left alone. Known payment_* policies handled above.
--    Recreates each matching write policy as profile-membership (same cmd / roles).
-- ---------------------------------------------------------------------------
do $rewrite$
declare
  rec record;
  cmd_sql text;
  roles_sql text;
  using_sql text := 'exists (select 1 from public.profiles p where p.id = auth.uid())';
  check_sql text := 'exists (select 1 from public.profiles p where p.id = auth.uid())';
  drop_sql text;
  create_sql text;
  using_expr text;
  check_expr text;
begin
  for rec in
    select
      c.relname as tbl,
      p.polname as policy,
      p.polcmd as polcmd,
      coalesce(
        (select string_agg(quote_ident(r.rolname), ', ' order by r.rolname)
         from pg_roles r
         where r.oid = any (p.polroles)),
        'authenticated'
      ) as roles_list,
      pg_get_expr(p.polqual, p.polrelid) as using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polcmd <> 'r'  -- skip SELECT-only
      and c.relname not in ('payment_actions','payment_action_history','booking_financial_events')
  loop
    using_expr := coalesce(rec.using_expr, '');
    check_expr := coalesce(rec.check_expr, '');
    -- Match role-gated staff writes: role in ('owner','manager') or role = 'owner'
    if not (
      (using_expr ilike '%p.role%' or using_expr ilike '%profiles%role%' or using_expr ilike '%.role %' or using_expr ilike '%.role=%' or using_expr ilike '%.rolein%')
      or (check_expr ilike '%p.role%' or check_expr ilike '%profiles%role%' or check_expr ilike '%.role %' or check_expr ilike '%.role=%' or check_expr ilike '%.rolein%')
    ) then
      continue;
    end if;
    if not (
      using_expr ilike '%owner%' or check_expr ilike '%owner%'
      or using_expr ilike '%manager%' or check_expr ilike '%manager%'
    ) then
      continue;
    end if;

    cmd_sql := case rec.polcmd
      when 'a' then 'for insert'
      when 'w' then 'for update'
      when 'd' then 'for delete'
      when '*' then 'for all'
      else null
    end;
    if cmd_sql is null then
      raise notice 'SKIP %.% — unsupported polcmd %', rec.tbl, rec.policy, rec.polcmd;
      continue;
    end if;

    roles_sql := coalesce(nullif(trim(rec.roles_list), ''), 'authenticated');
    drop_sql := format('drop policy if exists %I on public.%I', rec.policy, rec.tbl);

    if rec.polcmd = 'a' then
      create_sql := format(
        'create policy %I on public.%I %s to %s with check (%s)',
        rec.policy, rec.tbl, cmd_sql, roles_sql, check_sql
      );
    elsif rec.polcmd = 'd' then
      create_sql := format(
        'create policy %I on public.%I %s to %s using (%s)',
        rec.policy, rec.tbl, cmd_sql, roles_sql, using_sql
      );
    else
      create_sql := format(
        'create policy %I on public.%I %s to %s using (%s) with check (%s)',
        rec.policy, rec.tbl, cmd_sql, roles_sql, using_sql, check_sql
      );
    end if;

    execute drop_sql;
    execute create_sql;
    raise notice 'REWROTE %.% → profile-membership (%s)', rec.tbl, rec.policy, cmd_sql;
  end loop;
end $rewrite$;

-- ---------------------------------------------------------------------------
-- 5) Ensure anon cannot write the payment_* tables (defense in depth)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.payment_actions') is not null then
    revoke all on public.payment_actions from anon;
  end if;
  if to_regclass('public.payment_action_history') is not null then
    revoke all on public.payment_action_history from anon;
  end if;
  if to_regclass('public.booking_financial_events') is not null then
    revoke all on public.booking_financial_events from anon;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Done. Run VERIFY next. Edge Functions must still be updated separately.
-- =============================================================================
