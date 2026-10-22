-- Isolated scenarios after migration. Fictional data only.
begin;
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', true);

do $$
declare
  r jsonb;
  b public.bonds%rowtype;
  evt_count int;
  arch jsonb;
  token text;
  restored_id bigint;
  pay_count int;
  ref_count int;
  pay_amt numeric;
  ref_amt numeric;
begin
  -- 0) Existing received row still valid; new received insert allowed
  select count(*) into evt_count from public.bond_refund_events where bond_id=101 and action='received';
  if evt_count < 1 then raise exception 'pre-existing received row missing'; end if;
  insert into public.bond_refund_events(bond_id, action, amount, currency, notes, created_by)
  values (101, 'received', 0, 'AUD', 'post-migration received write', '11111111-1111-1111-1111-111111111111');

  -- 1) Partial refund from retained: 100 → refund 30
  r := public.refund_retained_bond_atomic(
    101, 30, 'Partial admin refund', 'EFT', 'RR-30',
    'refund-retained:101:partial-1', current_date
  );
  if (r->>'ok')::boolean is not true then raise exception 'partial failed: %', r; end if;
  select * into b from public.bonds where id = 101;
  if coalesce(b.forfeited_amount,0) <> 70 or coalesce(b.refund_amount,0) <> 30 or coalesce(b.remaining_amount,0) <> 0 then
    raise exception 'ledger after partial retained=% refunded=% remaining=%',
      b.forfeited_amount, b.refund_amount, b.remaining_amount;
  end if;
  if b.deposit_status is distinct from 'Partial forfeit / partial refund' then
    raise exception 'unexpected status %', b.deposit_status;
  end if;

  -- 2) Idempotent replay
  r := public.refund_retained_bond_atomic(
    101, 30, 'Partial admin refund', 'EFT', 'RR-30',
    'refund-retained:101:partial-1', current_date
  );
  if (r->>'replayed')::boolean is not true then raise exception 'expected replay'; end if;
  select * into b from public.bonds where id = 101;
  if coalesce(b.forfeited_amount,0) <> 70 or coalesce(b.refund_amount,0) <> 30 then
    raise exception 'replay mutated ledger';
  end if;

  -- 3) Over-refund blocked
  begin
    perform public.refund_retained_bond_atomic(
      101, 80, 'too much', null, null, 'refund-retained:101:over', current_date
    );
    raise exception 'over-refund should have failed';
  exception when others then
    if sqlerrm ilike '%over-refund should%' then raise; end if;
  end;

  -- 4) Archive + delete with payment + refund events, then restore both
  insert into public.bonds(id, tenancy_id, amount, forfeited_amount, refund_amount, remaining_amount, deposit_status)
  values (202, 9002, 50, 50, 0, 0, 'Forfeited / Retained');
  insert into public.bond_refund_events(bond_id, action, amount, currency, reference, notes, created_by)
  values
    (202, 'received', 50, 'AUD', null, 'paid', '11111111-1111-1111-1111-111111111111'),
    (202, 'retain_full', 50, 'AUD', 'retain:202:iso', 'kept', '11111111-1111-1111-1111-111111111111');
  insert into public.bond_payment_events(bond_id, amount, currency, method, reference, notes, created_by)
  values (202, 50, 'AUD', 'Cash', 'PAY-202', 'bond paid', '11111111-1111-1111-1111-111111111111');

  arch := public.archive_and_delete_bond(202, 'DELETE BOND');
  if (arch->>'ok')::boolean is not true then raise exception 'archive failed %', arch; end if;
  if (arch->>'payment_events_archived')::int <> 1 then raise exception 'payment archive count'; end if;
  if (arch->>'refund_events_archived')::int <> 2 then raise exception 'refund archive count'; end if;
  token := arch->>'restore_token';
  if exists(select 1 from public.bonds where id=202) then raise exception 'bond still live'; end if;
  if exists(select 1 from public.bond_refund_events where bond_id=202) then raise exception 'refund events still live'; end if;
  if exists(select 1 from public.bond_payment_events where bond_id=202) then raise exception 'payment events still live'; end if;

  r := public.restore_archived_bond(token);
  if (r->>'ok')::boolean is not true then raise exception 'restore failed %', r; end if;
  restored_id := (r->>'restored_bond_id')::bigint;
  select count(*), coalesce(sum(amount),0) into ref_count, ref_amt
    from public.bond_refund_events where bond_id = restored_id;
  select count(*), coalesce(sum(amount),0) into pay_count, pay_amt
    from public.bond_payment_events where bond_id = restored_id;
  if ref_count <> 2 or abs(ref_amt - 100) > 0.009 then
    raise exception 'restored refund events mismatch count=% amt=%', ref_count, ref_amt;
  end if;
  if pay_count <> 1 or abs(pay_amt - 50) > 0.009 then
    raise exception 'restored payment events mismatch count=% amt=%', pay_count, pay_amt;
  end if;

  -- 5) Duplicate restore blocked when stay already has bond (restored row occupies tenancy 9002)
  begin
    -- re-open archive row for second attempt is not possible (restored_at set).
    -- Simulate: new archive for tenancy that already has a bond (101 on 9001).
    insert into public.bond_deletion_archives(
      original_bond_id, bond_snapshot, refund_events_snapshot, payment_events_snapshot,
      deleted_by, restore_token
    ) values (
      999,
      jsonb_build_object('tenancy_id', 9001, 'amount', 10, 'currency', 'AUD', 'original_currency', 'AUD',
        'bond_type', 'bond', 'received', true, 'refunded', false,
        'refund_amount', 0, 'forfeited_amount', 0, 'deduction_amount', 0, 'remaining_amount', 10),
      '[]'::jsonb, '[]'::jsonb,
      '11111111-1111-1111-1111-111111111111',
      'bond-archive:dup-test'
    );
    perform public.restore_archived_bond('bond-archive:dup-test');
    raise exception 'duplicate restore should have failed';
  exception when others then
    if sqlerrm ilike '%duplicate restore should%' then raise; end if;
    if sqlerrm not ilike '%already has a bond%' then
      raise exception 'unexpected duplicate error: %', sqlerrm;
    end if;
  end;

  -- 6) Unauthorised caller blocked
  perform set_config('app.uid', '22222222-2222-2222-2222-222222222222', true);
  begin
    perform public.refund_retained_bond_atomic(
      101, 1, 'nope', null, null, 'refund-retained:101:unauth', current_date
    );
    raise exception 'unauth should fail';
  exception when others then
    if sqlerrm ilike '%unauth should%' then raise; end if;
  end;

  raise notice 'ALL ISOLATED SCENARIOS PASSED';
end $$;

commit;
