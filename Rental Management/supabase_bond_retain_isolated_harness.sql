-- =============================================================================
-- ISOLATED TEST HARNESS ONLY — fictional data, local Postgres
-- File: Rental Management/supabase_bond_retain_isolated_harness.sql
-- =============================================================================
-- NOT for production. Creates minimal Supabase-like roles/schema so
-- retain_bond_atomic can be exercised offline. Does not touch cloud DBs.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

create schema if not exists auth;

-- Stub auth.uid() matching Supabase PostgREST JWT claim wiring.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Mirror Supabase: authenticated may resolve auth.uid(); anon may not call retain RPC.
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;

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
  refund_amount numeric default 0,
  forfeited_amount numeric default 0,
  deduction_amount numeric default 0,
  remaining_amount numeric,
  remaining_description text,
  deposit_status text,
  forfeited_at date,
  forfeited_by uuid,
  forfeiture_reason text,
  received boolean default true,
  refunded boolean default false
);

create table if not exists public.bond_refund_events (
  id bigserial primary key,
  bond_id bigint references public.bonds(id),
  action text,
  amount numeric,
  currency text,
  method text,
  reference text,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.booking_financial_events (
  id bigserial primary key,
  tenancy_id bigint,
  bond_id bigint,
  payment_id bigint,
  event_type text not null,
  amount numeric,
  currency text default 'AUD',
  classification text,
  notes text,
  created_by uuid,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;
alter table public.bonds enable row level security;
alter table public.bond_refund_events enable row level security;
alter table public.booking_financial_events enable row level security;

-- App parity: authorised = authenticated + profiles row (any role label).
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists bonds_all_authorised on public.bonds;
create policy bonds_all_authorised on public.bonds
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

drop policy if exists bond_events_all_authorised on public.bond_refund_events;
create policy bond_events_all_authorised on public.bond_refund_events
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

drop policy if exists booking_events_insert_authorised on public.booking_financial_events;
create policy booking_events_insert_authorised on public.booking_financial_events
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

drop policy if exists booking_events_select_authorised on public.booking_financial_events;
create policy booking_events_select_authorised on public.booking_financial_events
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()));

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update on public.bonds to authenticated;
grant select, insert, update, delete on public.bond_refund_events to authenticated;
grant select, insert on public.booking_financial_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Fictional staff + unauthorised user (no production IDs)
truncate public.booking_financial_events, public.bond_refund_events, public.bonds, public.profiles restart identity cascade;

insert into public.profiles (id, display_name, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Staff', 'viewer'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Other Staff', 'manager');
-- Note: cccccccc... deliberately has NO profiles row (unauthorised JWT subject).

insert into public.bonds (
  id, tenancy_id, amount, original_currency, refund_amount, forfeited_amount, deduction_amount, remaining_amount
) values
  (101, 9001, 500, 'AUD', 0, 0, 0, 500),
  (102, 9002, 400, 'AUD', 100, 0, 0, 300);

select setval(pg_get_serial_sequence('public.bonds', 'id'), 200);
select setval(pg_get_serial_sequence('public.bond_refund_events', 'id'), 1, false);
