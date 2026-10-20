-- =============================================================================
-- FORWARD MIGRATION ONLY — production-safe schema + RPC (no data mutation)
-- File: Rental Management/supabase_bond_retain_atomic.sql
-- =============================================================================
-- PURPOSE
--   Atomic Retain Bond: update bonds ledger + insert bond_refund_events in ONE
--   Postgres transaction, with a durable idempotency key on the history row.
--
-- DEPLOYMENT PREREQUISITE (required before Retain Bond works in production)
--   1) Owner reviews this file + VERIFY + ROLLBACK siblings.
--   2) Owner applies THIS file manually in the Supabase SQL Editor (or approved
--      migration pipeline). Do NOT auto-run from Cursor / CI / agents.
--   3) Run supabase_bond_retain_atomic_VERIFY.sql and confirm the function exists.
--   4) Only then merge/deploy the app build that calls rpc/retain_bond_atomic.
--   Until step 2–3 succeed, the app will refuse Retain Bond with a clear error
--   and will not fall back to multi-request (non-atomic) writes.
--
-- Guarantees:
--   * CREATE OR REPLACE function / CREATE UNIQUE INDEX IF NOT EXISTS only
--   * Does NOT UPDATE or DELETE existing bond or history rows on apply
--   * Does NOT transfer money or touch rent_payments
--
-- Rollback: supabase_bond_retain_atomic_ROLLBACK.sql
-- Verify:   supabase_bond_retain_atomic_VERIFY.sql
-- =============================================================================

-- Durable idempotency: retain keys are stored in bond_refund_events.reference
-- with prefix retain: — partial unique index so other reference uses stay free.
create unique index if not exists bond_refund_events_retain_idempotency_uidx
  on public.bond_refund_events (reference)
  where reference is not null and reference like 'retain:%';

create or replace function public.retain_bond_atomic(
  p_bond_id bigint,
  p_mode text,
  p_amount numeric,
  p_reason text,
  p_idempotency_key text,
  p_retained_at date default current_date
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_bond public.bonds%rowtype;
  v_event public.bond_refund_events%rowtype;
  v_retain numeric;
  v_remaining numeric;
  v_new_forfeit numeric;
  v_refunded numeric;
  v_deducted numeric;
  v_original numeric;
  v_action text;
  v_status text;
  v_currency text;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'Not authorised';
  end if;
  if p_idempotency_key is null
     or length(trim(p_idempotency_key)) < 8
     or trim(p_idempotency_key) not like 'retain:%' then
    raise exception 'idempotency_key required (retain:...)';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  select * into v_bond
  from public.bonds
  where id = p_bond_id
  for update;
  if not found then
    raise exception 'Bond not found';
  end if;

  -- Idempotent replay AFTER row lock so concurrent same-key retries cannot double-apply.
  select * into v_event
  from public.bond_refund_events
  where reference = trim(p_idempotency_key)
  limit 1;
  if found then
    select * into v_bond from public.bonds where id = v_event.bond_id;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'bond_id', v_event.bond_id,
      'event_id', v_event.id,
      'bond', to_jsonb(v_bond),
      'event', to_jsonb(v_event),
      'reference', trim(p_idempotency_key),
      'retaining_now', v_event.amount,
      'remaining_after', greatest(
        0,
        coalesce(v_bond.amount, 0)
          - coalesce(v_bond.refund_amount, 0)
          - coalesce(v_bond.forfeited_amount, 0)
          - coalesce(v_bond.deduction_amount, 0)
      )
    );
  end if;

  v_original := coalesce(v_bond.amount, 0);
  v_refunded := coalesce(v_bond.refund_amount, 0);
  v_deducted := coalesce(v_bond.deduction_amount, 0);
  v_remaining := greatest(
    0,
    v_original - v_refunded - coalesce(v_bond.forfeited_amount, 0) - v_deducted
  );
  v_currency := coalesce(v_bond.original_currency, v_bond.currency, 'AUD');

  if lower(coalesce(p_mode, 'partial')) = 'full' then
    v_retain := v_remaining;
    v_action := 'retain_full';
  else
    v_retain := coalesce(p_amount, 0);
    v_action := 'retain_partial';
  end if;

  if v_retain is null or v_retain <= 0 then
    raise exception 'Nothing left to retain on this bond';
  end if;
  if v_retain > v_remaining + 0.009 then
    raise exception 'Retention exceeds remaining refundable balance';
  end if;
  if v_refunded + coalesce(v_bond.forfeited_amount, 0) + v_retain > v_original + 0.009 then
    raise exception 'Refunded + retained cannot exceed the original bond';
  end if;

  v_new_forfeit := coalesce(v_bond.forfeited_amount, 0) + v_retain;
  v_remaining := greatest(0, v_original - v_refunded - v_new_forfeit - v_deducted);

  if v_remaining <= 0 and v_refunded <= 0 then
    v_status := 'Forfeited / Retained';
  elsif v_refunded > 0 then
    v_status := 'Partial forfeit / partial refund';
  else
    v_status := 'Partially retained';
  end if;

  -- Insert history BEFORE bond update (same transaction). unique_violation ⇒ no balance change.
  begin
    insert into public.bond_refund_events (
      bond_id, action, amount, currency, method, reference, notes, created_by
    ) values (
      p_bond_id,
      v_action,
      v_retain,
      v_currency,
      null,
      trim(p_idempotency_key),
      trim(p_reason),
      v_uid
    ) returning * into v_event;
  exception when unique_violation then
    select * into v_event
    from public.bond_refund_events
    where reference = trim(p_idempotency_key)
    limit 1;
    if v_event.bond_id is distinct from p_bond_id then
      raise exception 'idempotency_key already used on another bond';
    end if;
    select * into v_bond from public.bonds where id = v_event.bond_id;
    return jsonb_build_object(
      'ok', true,
      'replayed', true,
      'bond_id', v_event.bond_id,
      'event_id', v_event.id,
      'bond', to_jsonb(v_bond),
      'event', to_jsonb(v_event),
      'reference', trim(p_idempotency_key),
      'retaining_now', v_event.amount,
      'remaining_after', greatest(
        0,
        coalesce(v_bond.amount, 0)
          - coalesce(v_bond.refund_amount, 0)
          - coalesce(v_bond.forfeited_amount, 0)
          - coalesce(v_bond.deduction_amount, 0)
      )
    );
  end;

  update public.bonds set
    forfeited_amount = v_new_forfeit,
    forfeited_at = coalesce(p_retained_at, current_date),
    forfeited_by = v_uid,
    forfeiture_reason = trim(p_reason),
    deposit_status = v_status,
    remaining_amount = v_remaining,
    remaining_description = case
      when v_remaining <= 0 then format('Retained %s. Refund due $0.', v_retain)
      else format('Retained %s; remaining refundable %s', v_retain, v_remaining)
    end
  where id = p_bond_id;

  -- Optional secondary log. Subtransaction: failure must NOT undo bond + history.
  begin
    if to_regclass('public.booking_financial_events') is not null then
      insert into public.booking_financial_events (
        tenancy_id, bond_id, event_type, amount, currency, classification, notes, created_by
      ) values (
        v_bond.tenancy_id,
        p_bond_id,
        case when v_action = 'retain_full' then 'deposit_retained' else 'deposit_partial_retain' end,
        v_retain,
        v_currency,
        'Forfeited Deposit Income',
        trim(p_reason),
        v_uid
      );
    end if;
  exception when others then
    null;
  end;

  select * into v_bond from public.bonds where id = p_bond_id;

  return jsonb_build_object(
    'ok', true,
    'replayed', false,
    'bond_id', p_bond_id,
    'event_id', v_event.id,
    'bond', to_jsonb(v_bond),
    'event', to_jsonb(v_event),
    'reference', trim(p_idempotency_key),
    'retaining_now', v_retain,
    'remaining_after', v_remaining
  );
end;
$$;

grant execute on function public.retain_bond_atomic(bigint, text, numeric, text, text, date)
  to authenticated;

comment on function public.retain_bond_atomic(bigint, text, numeric, text, text, date) is
  'Atomic Retain Bond: updates bonds + inserts bond_refund_events in one transaction; idempotent via retain:* reference.';
