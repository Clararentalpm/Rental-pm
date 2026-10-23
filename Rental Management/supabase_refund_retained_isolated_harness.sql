-- Isolated local harness for refund-from-retained + archive (fictional only).
-- Safe to run on a throwaway database / schema.

drop schema if exists refund_retained_test cascade;
create schema refund_retained_test;
set search_path = refund_retained_test, public;

create table profiles (id uuid primary key);
create table bonds (
  id bigserial primary key,
  tenancy_id bigint,
  amount numeric not null default 0,
  currency text default 'AUD',
  original_currency text default 'AUD',
  received_date date,
  bond_type text,
  received_via text,
  notes text,
  received boolean default true,
  refunded boolean default false,
  refund_amount numeric default 0,
  forfeited_amount numeric default 0,
  deduction_amount numeric default 0,
  remaining_amount numeric default 0,
  remaining_description text,
  deposit_status text,
  forfeited_at date,
  forfeited_by uuid,
  forfeiture_reason text,
  refunded_date date
);
create table bond_refund_events (
  id bigserial primary key,
  bond_id bigint references bonds(id),
  action text,
  amount numeric,
  currency text,
  method text,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz default now(),
  constraint bond_refund_events_action_check check (
    action is null or action in (
      'mark_refunded','mark_not_refunded','partial_refund','full_refund',
      'forfeit_full','forfeit_partial','deduction','note','edit_bond'
      -- intentionally omit retain_* / refund_retained here so forward migration expands CHECK
    )
  )
);

-- stub auth.uid for local tests
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql as $$
  select '11111111-1111-1111-1111-111111111111'::uuid
$$;

insert into profiles(id) values ('11111111-1111-1111-1111-111111111111');
insert into bonds(id, tenancy_id, amount, forfeited_amount, refund_amount, remaining_amount, deposit_status)
values (101, 1, 100, 100, 0, 0, 'Forfeited / Retained');
select setval(pg_get_serial_sequence('bonds','id'), 200);
select setval(pg_get_serial_sequence('bond_refund_events','id'), 1, false);
