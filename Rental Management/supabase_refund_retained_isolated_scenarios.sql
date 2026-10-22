-- Isolated scenarios after migration. Fictional bond #101 only.
begin;
select set_config('app.uid', '11111111-1111-1111-1111-111111111111', true);

do $$
declare
  r jsonb;
  b public.bonds%rowtype;
  evt_count int;
  arch jsonb;
begin
  -- 1) Partial refund from retained: 100 retained → refund 30
  r := public.refund_retained_bond_atomic(
    101, 30, 'Partial admin refund', 'EFT', 'RR-30',
    'refund-retained:101:partial-1', current_date
  );
  if (r->>'ok')::boolean is not true then raise exception 'partial failed: %', r; end if;
  if (r->>'replayed')::boolean then raise exception 'unexpected replay'; end if;
  select * into b from public.bonds where id = 101;
  if coalesce(b.forfeited_amount,0) <> 70 or coalesce(b.refund_amount,0) <> 30 then
    raise exception 'ledger after partial: retained=% refunded=%', b.forfeited_amount, b.refund_amount;
  end if;
  if coalesce(b.remaining_amount,0) <> 0 then raise exception 'remaining should stay 0'; end if;
  select count(*) into evt_count from public.bond_refund_events
    where bond_id=101 and action='refund_retained' and reference='refund-retained:101:partial-1';
  if evt_count <> 1 then raise exception 'history missing'; end if;

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

  -- 4) Full remaining retained (70)
  r := public.refund_retained_bond_atomic(
    101, 70, 'Full of remaining retained', 'Cash', null,
    'refund-retained:101:full-rest', current_date
  );
  if (r->>'ok')::boolean is not true then raise exception 'full rest failed: %', r; end if;
  select * into b from public.bonds where id = 101;
  if coalesce(b.forfeited_amount,0) <> 0 or coalesce(b.refund_amount,0) <> 100 then
    raise exception 'after full rest retained=% refunded=%', b.forfeited_amount, b.refund_amount;
  end if;

  -- 5) CHECK now allows retain_full insert
  insert into public.bond_refund_events(bond_id, action, amount, currency, notes, created_by)
  values (101, 'retain_full', 0, 'AUD', 'CHECK allow smoke', '11111111-1111-1111-1111-111111111111');

  -- 6) Archive + delete + restore (new bond id)
  insert into public.bonds(id, tenancy_id, amount, forfeited_amount, refund_amount, remaining_amount, deposit_status)
  values (202, 9002, 50, 50, 0, 0, 'Forfeited / Retained');
  insert into public.bond_refund_events(bond_id, action, amount, currency, reference, notes, created_by)
  values (202, 'retain_full', 50, 'AUD', 'retain:202:iso', 'kept', '11111111-1111-1111-1111-111111111111');

  arch := public.archive_and_delete_bond(202, 'DELETE BOND');
  if (arch->>'ok')::boolean is not true then raise exception 'archive failed %', arch; end if;
  if exists(select 1 from public.bonds where id=202) then raise exception 'bond still live'; end if;
  if exists(select 1 from public.bond_refund_events where bond_id=202) then raise exception 'events still live'; end if;

  r := public.restore_archived_bond(arch->>'restore_token');
  if (r->>'ok')::boolean is not true then raise exception 'restore failed %', r; end if;
  if not exists(select 1 from public.bonds where id=(r->>'restored_bond_id')::bigint) then
    raise exception 'restored bond missing';
  end if;

  raise notice 'ALL ISOLATED SCENARIOS PASSED';
end $$;

commit;
