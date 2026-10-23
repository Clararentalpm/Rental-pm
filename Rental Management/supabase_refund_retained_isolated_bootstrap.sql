-- Bootstrap a throwaway DB for isolated verification (fictional data only).

create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('app.uid', true), '')
  )::uuid
$$;

do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key,
  display_name text,
  role text
);

-- Production-shaped staff helpers (local stubs)
create or replace function public.is_rental_staff()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.profiles p where p.id = auth.uid());
$$;

create or replace function public.can_edit_rental()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select public.is_rental_staff();
$$;

grant execute on function public.is_rental_staff() to authenticated;
grant execute on function public.can_edit_rental() to authenticated;

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

drop table if exists public.bond_payment_events cascade;
create table public.bond_payment_events (
  id bigserial primary key,
  bond_id bigint references public.bonds(id),
  amount numeric,
  currency text,
  method text,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
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
  -- Pre-migration production-shaped CHECK (includes received; omit refund_retained)
  constraint bond_refund_events_action_check check (
    action is null or action in (
      'received','partial_refund','full_refund','deduction','note',
      'retain_partial','retain_full'
    )
  )
);

truncate public.bond_payment_events, public.bond_refund_events, public.bonds, public.profiles restart identity cascade;
insert into public.profiles(id, display_name, role)
values ('11111111-1111-1111-1111-111111111111', 'Iso Tester', 'owner');

insert into public.bonds(id, tenancy_id, amount, original_currency, forfeited_amount, refund_amount, remaining_amount, deposit_status)
values (101, 9001, 100, 'AUD', 100, 0, 0, 'Forfeited / Retained');

-- Existing received history row (must remain valid before and after migration)
insert into public.bond_refund_events(bond_id, action, amount, currency, notes, created_by)
values (101, 'received', 100, 'AUD', 'Original receipt', '11111111-1111-1111-1111-111111111111');

insert into public.bond_payment_events(bond_id, amount, currency, method, reference, notes, created_by)
values (101, 100, 'AUD', 'EFT', 'PAY-101', 'Bond paid', '11111111-1111-1111-1111-111111111111');

select setval(pg_get_serial_sequence('public.bonds','id'), 200, false);
select setval(pg_get_serial_sequence('public.bond_refund_events','id'), 50, false);
select setval(pg_get_serial_sequence('public.bond_payment_events','id'), 50, false);
