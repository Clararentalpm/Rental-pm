-- Bootstrap a throwaway DB for isolated verification (fictional data only).
-- Creates minimal public schema stubs, then expects the forward migration next.

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('app.uid', true), '')
  )::uuid
$$;

do $$ begin
  create role authenticated;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role anon;
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key,
  display_name text,
  role text
);

create table if not exists public.bonds (
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

drop table if exists public.bond_refund_events cascade;
create table public.bond_refund_events (
  id bigserial primary key,
  bond_id bigint references public.bonds(id),
  action text,
  amount numeric,
  currency text,
  method text,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz default now(),
  -- Pre-migration CHECK (PR #30 mismatch shape): retain_* / refund_retained NOT allowed
  constraint bond_refund_events_action_check check (
    action is null or action in (
      'mark_refunded','mark_not_refunded','partial_refund','full_refund',
      'forfeit_full','forfeit_partial','deduction','note','edit_bond'
    )
  )
);

truncate public.bond_refund_events, public.bonds, public.profiles restart identity cascade;
insert into public.profiles(id, display_name, role)
values ('11111111-1111-1111-1111-111111111111', 'Iso Tester', 'owner');

-- Fictional closed retained bond
insert into public.bonds(id, tenancy_id, amount, original_currency, forfeited_amount, refund_amount, remaining_amount, deposit_status)
values (101, 9001, 100, 'AUD', 100, 0, 0, 'Forfeited / Retained');
select setval(pg_get_serial_sequence('public.bonds','id'), 200, false);
select setval(pg_get_serial_sequence('public.bond_refund_events','id'), 1, false);
