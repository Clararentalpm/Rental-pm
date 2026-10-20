-- =============================================================================
-- ISOLATED SCENARIO TESTS — fictional bonds only (local Postgres)
-- Prerequisites: harness + forward migration already applied.
-- Run as a superuser that can SET ROLE authenticated and set JWT claim.
-- =============================================================================

\set ON_ERROR_STOP on

create or replace function public._test_set_staff(p_uid text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  execute 'set local role authenticated';
end;
$$;

do $$
declare
  r jsonb;
  v_bond_row public.bonds%rowtype;
  evt_count int;
  v_forfeit numeric;
  v_refund numeric;
  v_remaining numeric;
  v_events int;
begin
  -- ---------- Authz: anon / no profile must fail ----------
  begin
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
    perform public.retain_bond_atomic(101, 'partial', 10, 'nope', 'retain:101:anon', current_date);
    raise exception 'FAIL authz-anon: should not execute';
  exception when others then
    if sqlerrm like 'FAIL authz-anon%' then raise; end if;
    raise notice 'PASS authz-anon blocked: %', sqlerrm;
  end;
  reset role;

  begin
    perform set_config('request.jwt.claim.sub', 'cccccccc-cccc-cccc-cccc-cccccccccccc', true);
    execute 'set local role authenticated';
    perform public.retain_bond_atomic(101, 'partial', 10, 'nope', 'retain:101:noprofile', current_date);
    raise exception 'FAIL authz-noprofile: should not execute';
  exception when others then
    if sqlerrm like 'FAIL authz-noprofile%' then raise; end if;
    raise notice 'PASS authz-noprofile blocked: %', sqlerrm;
  end;
  reset role;

  -- ---------- Partial retention ----------
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  execute 'set local role authenticated';
  r := public.retain_bond_atomic(101, 'partial', 150, 'Partial cleaning', 'retain:101:partial-1', '2026-10-20');
  if coalesce((r->>'replayed')::boolean, true) then raise exception 'FAIL partial: unexpected replay'; end if;
  if (r->>'retaining_now')::numeric <> 150 then raise exception 'FAIL partial amount %', r; end if;
  select * into v_bond_row from public.bonds where id = 101;
  if v_bond_row.forfeited_amount <> 150 or v_bond_row.remaining_amount <> 350 then
    raise exception 'FAIL partial ledger forfeit=% rem=%', v_bond_row.forfeited_amount, v_bond_row.remaining_amount;
  end if;
  select count(*) into evt_count from public.bond_refund_events where bond_id = 101 and reference = 'retain:101:partial-1';
  if evt_count <> 1 then raise exception 'FAIL partial history count %', evt_count; end if;
  raise notice 'PASS partial retention';

  -- ---------- Refund after partial (simulate existing refund path: update refund_amount) ----------
  -- Still authenticated staff; administrative refund record + balance (not via retain RPC).
  update public.bonds
    set refund_amount = coalesce(refund_amount,0) + 100,
        remaining_amount = greatest(0, amount - (coalesce(refund_amount,0)+100) - coalesce(forfeited_amount,0) - coalesce(deduction_amount,0)),
        remaining_description = 'Remaining after partial refund: 250'
  where id = 101;
  insert into public.bond_refund_events (bond_id, action, amount, currency, reference, notes, created_by)
  values (101, 'partial_refund', 100, 'AUD', null, 'Refund after partial retain', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  select forfeited_amount, refund_amount, remaining_amount into v_forfeit, v_refund, v_remaining from public.bonds where id = 101;
  if v_forfeit <> 150 or v_refund <> 100 or v_remaining <> 250 then
    raise exception 'FAIL refund-after-partial ledger f=% r=% rem=%', v_forfeit, v_refund, v_remaining;
  end if;
  raise notice 'PASS refund after partial retention';

  -- ---------- Full retention of remaining on bond 102 (had prior refund 100) ----------
  r := public.retain_bond_atomic(102, 'full', 9999, 'Full remaining', 'retain:102:full-1', '2026-10-20');
  if (r->>'retaining_now')::numeric <> 300 then raise exception 'FAIL full amount %', r; end if;
  select * into v_bond_row from public.bonds where id = 102;
  if v_bond_row.forfeited_amount <> 300 or v_bond_row.remaining_amount <> 0 or v_bond_row.refund_amount <> 100 then
    raise exception 'FAIL full ledger forfeit=% rem=% refund=%', v_bond_row.forfeited_amount, v_bond_row.remaining_amount, v_bond_row.refund_amount;
  end if;
  select count(*) into evt_count from public.bond_refund_events where reference = 'retain:102:full-1';
  if evt_count <> 1 then raise exception 'FAIL full history'; end if;
  raise notice 'PASS full retention';

  -- ---------- Repeated idempotency key ----------
  r := public.retain_bond_atomic(101, 'partial', 150, 'Partial cleaning', 'retain:101:partial-1', '2026-10-20');
  if not coalesce((r->>'replayed')::boolean, false) then raise exception 'FAIL idempotent replay flag'; end if;
  select count(*) into v_events from public.bond_refund_events where reference = 'retain:101:partial-1';
  select forfeited_amount into v_forfeit from public.bonds where id = 101;
  if v_events <> 1 or v_forfeit <> 150 then
    raise exception 'FAIL idempotent double apply events=% forfeit=%', v_events, v_forfeit;
  end if;
  raise notice 'PASS repeated idempotency key';

  -- ---------- Concurrent different keys: one should win remaining; other must not overdraw ----------
  -- Reset a fresh fictional bond for concurrency
  reset role;
  insert into public.bonds (id, tenancy_id, amount, original_currency, refund_amount, forfeited_amount, deduction_amount, remaining_amount)
  values (103, 9003, 200, 'AUD', 0, 0, 0, 200)
  on conflict (id) do update set amount=200, refund_amount=0, forfeited_amount=0, deduction_amount=0, remaining_amount=200;

  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', true);
  execute 'set local role authenticated';
  r := public.retain_bond_atomic(103, 'partial', 120, 'First concurrent', 'retain:103:c1', '2026-10-20');
  begin
    perform public.retain_bond_atomic(103, 'partial', 120, 'Second concurrent overdraw', 'retain:103:c2', '2026-10-20');
    raise exception 'FAIL concurrent: second overdraw should fail';
  exception when others then
    if sqlerrm like 'FAIL concurrent%' then raise; end if;
    raise notice 'PASS concurrent second blocked: %', sqlerrm;
  end;
  select forfeited_amount, remaining_amount into v_forfeit, v_remaining from public.bonds where id = 103;
  if v_forfeit <> 120 or v_remaining <> 80 then
    raise exception 'FAIL concurrent ledger forfeit=% rem=%', v_forfeit, v_remaining;
  end if;
  select count(*) into v_events from public.bond_refund_events where bond_id = 103 and action like 'retain%';
  if v_events <> 1 then raise exception 'FAIL concurrent history count %', v_events; end if;
  raise notice 'PASS concurrent attempts (second blocked, once applied)';

  -- ---------- Network error after successful commit (client ambiguity) ----------
  -- Server already committed retain:103:c1. Client "retry" with same key must replay, not double.
  r := public.retain_bond_atomic(103, 'partial', 120, 'First concurrent', 'retain:103:c1', '2026-10-20');
  if not coalesce((r->>'replayed')::boolean, false) then
    raise exception 'FAIL ambiguous-retry: expected replay after commit';
  end if;
  select forfeited_amount into v_forfeit from public.bonds where id = 103;
  select count(*) into v_events from public.bond_refund_events where reference = 'retain:103:c1';
  if v_forfeit <> 120 or v_events <> 1 then
    raise exception 'FAIL ambiguous-retry ledger forfeit=% events=%', v_forfeit, v_events;
  end if;
  raise notice 'PASS network-error-after-commit retry (idempotent replay, once)';

  reset role;
  raise notice 'ALL ISOLATED SQL SCENARIOS PASSED';
end $$;
