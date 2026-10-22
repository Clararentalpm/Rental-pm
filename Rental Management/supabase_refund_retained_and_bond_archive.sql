-- =============================================================================
-- FORWARD MIGRATION — Refund from retained bond + action CHECK fix + soft-delete archive
-- File: Rental Management/supabase_refund_retained_and_bond_archive.sql
-- =============================================================================
-- Free-plan safe: IF NOT EXISTS / DROP CONSTRAINT IF EXISTS / CREATE OR REPLACE.
-- Does NOT mutate existing bond business amounts on apply.
-- Does NOT transfer money.
--
-- Fixes PR #30 risk: expands bond_refund_events.action CHECK so retain_* and
-- refund_retained are allowed (avoids silent history insert failures).
-- =============================================================================

-- 1) Expand / replace action CHECK so retain_* and refund_retained are legal
do $$
declare
  r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'public'
      and t.relname = 'bond_refund_events'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%action%'
  loop
    execute format('alter table public.bond_refund_events drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.bond_refund_events
  drop constraint if exists bond_refund_events_action_check;

alter table public.bond_refund_events
  add constraint bond_refund_events_action_check
  check (
    action is null or action in (
      'mark_refunded','mark_not_refunded',
      'partial_refund','full_refund',
      'forfeit_full','forfeit_partial',
      'deduction','note','edit_bond',
      'retain_full','retain_partial',
      'refund_retained'
    )
  );

-- Durable idempotency for refund-from-retained keys
create unique index if not exists bond_refund_events_refund_retained_idempotency_uidx
  on public.bond_refund_events (reference)
  where reference is not null and reference like 'refund-retained:%';

-- Soft-delete archive (recoverable undo on Free plan; no external storage)
create table if not exists public.bond_deletion_archives (
  id bigserial primary key,
  original_bond_id bigint not null,
  bond_snapshot jsonb not null,
  refund_events_snapshot jsonb not null default '[]'::jsonb,
  payment_events_snapshot jsonb not null default '[]'::jsonb,
  deleted_by uuid,
  deleted_at timestamptz not null default now(),
  restore_token text not null unique,
  restored_at timestamptz,
  restored_bond_id bigint
);

create index if not exists bond_deletion_archives_deleted_at_idx
  on public.bond_deletion_archives (deleted_at desc);

alter table public.bond_deletion_archives enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='bond_deletion_archives'
      and policyname='bond_deletion_archives_authorised'
  ) then
    create policy bond_deletion_archives_authorised on public.bond_deletion_archives
      for all to authenticated
      using (exists (select 1 from public.profiles p where p.id = auth.uid()))
      with check (exists (select 1 from public.profiles p where p.id = auth.uid()));
  end if;
end $$;

grant select, insert, update on public.bond_deletion_archives to authenticated;
grant usage, select on sequence public.bond_deletion_archives_id_seq to authenticated;

-- 2) Atomic refund from retained balance
create or replace function public.refund_retained_bond_atomic(
  p_bond_id bigint,
  p_amount numeric,
  p_reason text,
  p_method text,
  p_reference text,
  p_idempotency_key text,
  p_refunded_at date default current_date
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bond public.bonds%rowtype;
  v_event public.bond_refund_events%rowtype;
  v_amt numeric;
  v_retained numeric;
  v_refunded numeric;
  v_deducted numeric;
  v_original numeric;
  v_new_retained numeric;
  v_new_refunded numeric;
  v_remaining numeric;
  v_status text;
  v_currency text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Not authorised';
  end if;
  if p_idempotency_key is null
     or length(trim(p_idempotency_key)) < 8
     or trim(p_idempotency_key) not like 'refund-retained:%' then
    raise exception 'idempotency_key required (refund-retained:...)';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  select * into v_bond from public.bonds where id = p_bond_id for update;
  if not found then raise exception 'Bond not found'; end if;

  select * into v_event
  from public.bond_refund_events
  where reference = trim(p_idempotency_key)
  limit 1;
  if found then
    select * into v_bond from public.bonds where id = v_event.bond_id;
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bond_id', v_event.bond_id, 'event_id', v_event.id,
      'bond', to_jsonb(v_bond), 'event', to_jsonb(v_event),
      'reference', trim(p_idempotency_key),
      'refunding_now', v_event.amount,
      'retained_after', coalesce(v_bond.forfeited_amount, 0),
      'refunded_after', coalesce(v_bond.refund_amount, 0),
      'remaining_after', greatest(
        0,
        coalesce(v_bond.amount,0) - coalesce(v_bond.refund_amount,0)
          - coalesce(v_bond.forfeited_amount,0) - coalesce(v_bond.deduction_amount,0)
      )
    );
  end if;

  v_original := coalesce(v_bond.amount, 0);
  v_retained := coalesce(v_bond.forfeited_amount, 0);
  v_refunded := coalesce(v_bond.refund_amount, 0);
  v_deducted := coalesce(v_bond.deduction_amount, 0);
  v_amt := coalesce(p_amount, 0);
  v_currency := coalesce(v_bond.original_currency, v_bond.currency, 'AUD');

  if v_amt is null or v_amt <= 0 then
    raise exception 'Enter a positive amount to refund from retained bond';
  end if;
  if v_retained <= 0 then
    raise exception 'Nothing retained to refund on this bond';
  end if;
  if v_amt > v_retained + 0.009 then
    raise exception 'Refund exceeds currently retained balance';
  end if;

  v_new_retained := v_retained - v_amt;
  v_new_refunded := v_refunded + v_amt;
  if v_new_refunded + v_new_retained + v_deducted > v_original + 0.009 then
    raise exception 'Refunded + retained cannot exceed the original bond';
  end if;
  -- Post-retention refund keeps remaining at 0 (closed bond)
  v_remaining := greatest(0, v_original - v_new_refunded - v_new_retained - v_deducted);

  if v_new_retained > 0 and v_new_refunded > 0 then
    v_status := 'Partial forfeit / partial refund';
  elsif v_new_retained > 0 then
    v_status := 'Forfeited / Retained';
  elsif v_new_refunded + 0.009 >= v_original then
    v_status := 'Refunded';
  else
    v_status := 'Partial forfeit / partial refund';
  end if;

  begin
    insert into public.bond_refund_events (
      bond_id, action, amount, currency, method, reference, notes, created_by
    ) values (
      p_bond_id,
      'refund_retained',
      v_amt,
      v_currency,
      nullif(trim(coalesce(p_method,'')), ''),
      trim(p_idempotency_key),
      trim(p_reason) || case
        when nullif(trim(coalesce(p_reference,'')), '') is null then ''
        else E'\nREFUND_REFERENCE:' || trim(p_reference)
      end,
      v_uid
    ) returning * into v_event;
  exception when unique_violation then
    select * into v_event from public.bond_refund_events
      where reference = trim(p_idempotency_key) limit 1;
    if v_event.bond_id is distinct from p_bond_id then
      raise exception 'idempotency_key already used on another bond';
    end if;
    select * into v_bond from public.bonds where id = v_event.bond_id;
    return jsonb_build_object(
      'ok', true, 'replayed', true,
      'bond_id', v_event.bond_id, 'event_id', v_event.id,
      'bond', to_jsonb(v_bond), 'event', to_jsonb(v_event),
      'reference', trim(p_idempotency_key),
      'refunding_now', v_event.amount,
      'retained_after', coalesce(v_bond.forfeited_amount, 0),
      'refunded_after', coalesce(v_bond.refund_amount, 0),
      'remaining_after', greatest(
        0,
        coalesce(v_bond.amount,0) - coalesce(v_bond.refund_amount,0)
          - coalesce(v_bond.forfeited_amount,0) - coalesce(v_bond.deduction_amount,0)
      )
    );
  end;

  update public.bonds set
    forfeited_amount = v_new_retained,
    refund_amount = v_new_refunded,
    refunded = (v_remaining <= 0 and v_new_refunded > 0),
    refunded_date = case when v_remaining <= 0 and v_new_refunded > 0
      then coalesce(p_refunded_at, current_date) else refunded_date end,
    deposit_status = v_status,
    remaining_amount = v_remaining,
    remaining_description = format(
      'Refund from retained %s; net retained %s; refunded total %s; remaining %s',
      v_amt, v_new_retained, v_new_refunded, v_remaining
    )
  where id = p_bond_id;

  select * into v_bond from public.bonds where id = p_bond_id;

  return jsonb_build_object(
    'ok', true, 'replayed', false,
    'bond_id', p_bond_id, 'event_id', v_event.id,
    'bond', to_jsonb(v_bond), 'event', to_jsonb(v_event),
    'reference', trim(p_idempotency_key),
    'refunding_now', v_amt,
    'retained_after', v_new_retained,
    'refunded_after', v_new_refunded,
    'remaining_after', v_remaining
  );
end;
$$;

revoke all on function public.refund_retained_bond_atomic(bigint, numeric, text, text, text, text, date) from public;
revoke all on function public.refund_retained_bond_atomic(bigint, numeric, text, text, text, text, date) from anon;
grant execute on function public.refund_retained_bond_atomic(bigint, numeric, text, text, text, text, date) to authenticated;

-- 3) Archive bond before hard delete (called from app; single transaction)
create or replace function public.archive_and_delete_bond(
  p_bond_id bigint,
  p_confirm_phrase text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bond public.bonds%rowtype;
  v_events jsonb;
  v_pay_events jsonb;
  v_token text;
  v_arch_id bigint;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Not authorised';
  end if;
  if trim(coalesce(p_confirm_phrase,'')) <> 'DELETE BOND' then
    raise exception 'Confirmation phrase required: DELETE BOND';
  end if;

  select * into v_bond from public.bonds where id = p_bond_id for update;
  if not found then raise exception 'Bond not found'; end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb) into v_events
  from public.bond_refund_events e where e.bond_id = p_bond_id;

  v_pay_events := '[]'::jsonb;
  begin
    if to_regclass('public.bond_payment_events') is not null then
      execute $q$
        select coalesce(jsonb_agg(to_jsonb(e) order by e.id), '[]'::jsonb)
        from public.bond_payment_events e where e.bond_id = $1
      $q$ into v_pay_events using p_bond_id;
    end if;
  exception when others then
    v_pay_events := '[]'::jsonb;
  end;

  v_token := 'bond-archive:' || p_bond_id::text || ':' || extract(epoch from clock_timestamp())::bigint::text
    || ':' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);

  insert into public.bond_deletion_archives (
    original_bond_id, bond_snapshot, refund_events_snapshot, payment_events_snapshot,
    deleted_by, restore_token
  ) values (
    p_bond_id, to_jsonb(v_bond), v_events, v_pay_events, v_uid, v_token
  ) returning id into v_arch_id;

  delete from public.bond_refund_events where bond_id = p_bond_id;
  begin
    if to_regclass('public.bond_payment_events') is not null then
      execute 'delete from public.bond_payment_events where bond_id = $1' using p_bond_id;
    end if;
  exception when others then null;
  end;
  delete from public.bonds where id = p_bond_id;

  return jsonb_build_object(
    'ok', true,
    'archive_id', v_arch_id,
    'restore_token', v_token,
    'original_bond_id', p_bond_id,
    'events_archived', jsonb_array_length(v_events)
  );
end;
$$;

revoke all on function public.archive_and_delete_bond(bigint, text) from public;
revoke all on function public.archive_and_delete_bond(bigint, text) from anon;
grant execute on function public.archive_and_delete_bond(bigint, text) to authenticated;

-- 4) Restore from archive (creates a NEW bond row; does not claim silent undelete)
create or replace function public.restore_archived_bond(
  p_restore_token text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_arch public.bond_deletion_archives%rowtype;
  v_snap jsonb;
  v_new_id bigint;
  v_ev jsonb;
  v_item jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Not authorised';
  end if;

  select * into v_arch from public.bond_deletion_archives
    where restore_token = trim(p_restore_token) for update;
  if not found then raise exception 'Archive not found'; end if;
  if v_arch.restored_at is not null then
    raise exception 'Archive already restored';
  end if;

  v_snap := v_arch.bond_snapshot;
  insert into public.bonds (
    tenancy_id, amount, currency, original_currency, received_date, bond_type,
    received_via, notes, received, refunded, refund_amount, forfeited_amount,
    deduction_amount, remaining_amount, remaining_description, deposit_status,
    forfeited_at, forfeited_by, forfeiture_reason, refunded_date
  ) values (
    (v_snap->>'tenancy_id')::bigint,
    coalesce((v_snap->>'amount')::numeric, 0),
    coalesce(v_snap->>'currency', 'AUD'),
    coalesce(v_snap->>'original_currency', v_snap->>'currency', 'AUD'),
    nullif(v_snap->>'received_date','')::date,
    coalesce(v_snap->>'bond_type', 'bond'),
    v_snap->>'received_via',
    coalesce(v_snap->>'notes','') || E'\nRESTORED_FROM_ARCHIVE:' || v_arch.restore_token,
    coalesce((v_snap->>'received')::boolean, true),
    coalesce((v_snap->>'refunded')::boolean, false),
    coalesce((v_snap->>'refund_amount')::numeric, 0),
    coalesce((v_snap->>'forfeited_amount')::numeric, 0),
    coalesce((v_snap->>'deduction_amount')::numeric, 0),
    coalesce((v_snap->>'remaining_amount')::numeric, 0),
    coalesce(v_snap->>'remaining_description', 'Restored from archive'),
    v_snap->>'deposit_status',
    nullif(v_snap->>'forfeited_at','')::date,
    nullif(v_snap->>'forfeited_by','')::uuid,
    v_snap->>'forfeiture_reason',
    nullif(v_snap->>'refunded_date','')::date
  ) returning id into v_new_id;

  for v_item in select * from jsonb_array_elements(coalesce(v_arch.refund_events_snapshot, '[]'::jsonb))
  loop
    insert into public.bond_refund_events (
      bond_id, action, amount, currency, method, reference, notes, created_by, created_at
    ) values (
      v_new_id,
      v_item->>'action',
      nullif(v_item->>'amount','')::numeric,
      v_item->>'currency',
      v_item->>'method',
      -- avoid unique retain:/refund-retained: collisions on restore
      case
        when (v_item->>'reference') like 'retain:%' or (v_item->>'reference') like 'refund-retained:%'
          then (v_item->>'reference') || ':restored:' || v_new_id::text
        else v_item->>'reference'
      end,
      coalesce(v_item->>'notes','') || E'\nRESTORED_EVENT',
      nullif(v_item->>'created_by','')::uuid,
      coalesce(nullif(v_item->>'created_at','')::timestamptz, now())
    );
  end loop;

  update public.bond_deletion_archives
    set restored_at = now(), restored_bond_id = v_new_id
  where id = v_arch.id;

  return jsonb_build_object(
    'ok', true,
    'restored_bond_id', v_new_id,
    'original_bond_id', v_arch.original_bond_id,
    'archive_id', v_arch.id
  );
end;
$$;

revoke all on function public.restore_archived_bond(text) from public;
revoke all on function public.restore_archived_bond(text) from anon;
grant execute on function public.restore_archived_bond(text) to authenticated;

comment on function public.refund_retained_bond_atomic(bigint, numeric, text, text, text, text, date) is
  'Atomic refund from retained (forfeited) balance: decreases forfeited_amount, increases refund_amount; remaining stays 0 when closed.';
