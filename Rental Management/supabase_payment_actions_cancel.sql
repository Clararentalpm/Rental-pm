-- Payment Actions + Cancel / Forfeit support (NON-DESTRUCTIVE)
-- Run ONLY after owner approval in Supabase SQL Editor.
-- Do NOT run from agents against production automatically.
-- Safe to re-run: IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.

-- ---------------------------------------------------------------------------
-- 1) Tenancy booking cancellation / no-show fields
-- ---------------------------------------------------------------------------
alter table public.tenancies add column if not exists cancelled_at timestamptz;
alter table public.tenancies add column if not exists cancelled_by uuid;
alter table public.tenancies add column if not exists cancellation_reason text;
alter table public.tenancies add column if not exists cancellation_notes text;
alter table public.tenancies add column if not exists deposit_treatment text;
alter table public.tenancies add column if not exists rent_treatment text;
-- status text already exists; app uses: upcoming|active|completed|cancelled|no_show|tbc|historical|ended

-- ---------------------------------------------------------------------------
-- 2) Bond / deposit forfeiture fields (append-only events still preferred)
-- ---------------------------------------------------------------------------
alter table public.bonds add column if not exists forfeited_amount numeric default 0;
alter table public.bonds add column if not exists forfeited_at date;
alter table public.bonds add column if not exists forfeited_by uuid;
alter table public.bonds add column if not exists forfeiture_reason text;
alter table public.bonds add column if not exists deposit_status text;
-- bond_type continues to distinguish rental_bond | deposit | booking_deposit | rent_advance | other

-- ---------------------------------------------------------------------------
-- 3) Persisted Payment Actions / Reminders (editable + traceable)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_actions (
  id bigserial primary key,
  property_id bigint references public.properties(id) on delete set null,
  tenancy_id bigint references public.tenancies(id) on delete set null,
  tenant_id bigint references public.tenants(id) on delete set null,
  room_id bigint references public.rooms(id) on delete set null,
  related_payment_id bigint,
  related_bond_id bigint,
  action_type text default 'rent_due',
  amount numeric,
  due_date date,
  status text default 'open',
  priority text default 'normal',
  notes text,
  resolve_reason text,
  superseded_by bigint,
  supersede_reason text,
  source_fingerprint text,
  created_by uuid,
  created_at timestamptz default now(),
  last_modified_by uuid,
  last_modified_at timestamptz default now(),
  resolved_by uuid,
  resolved_at timestamptz
);

create index if not exists payment_actions_tenancy_idx on public.payment_actions (tenancy_id);
create index if not exists payment_actions_status_due_idx on public.payment_actions (status, due_date);
create index if not exists payment_actions_property_idx on public.payment_actions (property_id);

alter table public.payment_actions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payment_actions' and policyname='payment_actions_auth_all'
  ) then
    create policy payment_actions_auth_all on public.payment_actions
      for all to authenticated
      using (true)
      with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.payment_actions to authenticated;
grant usage, select on sequence public.payment_actions_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Payment action audit history (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_action_history (
  id bigserial primary key,
  payment_action_id bigint references public.payment_actions(id) on delete cascade,
  field_name text,
  old_value text,
  new_value text,
  reason text,
  changed_by uuid,
  changed_at timestamptz default now()
);

create index if not exists payment_action_history_action_idx
  on public.payment_action_history (payment_action_id, changed_at desc);

alter table public.payment_action_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='payment_action_history' and policyname='payment_action_history_auth_all'
  ) then
    create policy payment_action_history_auth_all on public.payment_action_history
      for all to authenticated
      using (true)
      with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.payment_action_history to authenticated;
grant usage, select on sequence public.payment_action_history_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Booking / financial event log (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.booking_financial_events (
  id bigserial primary key,
  tenancy_id bigint references public.tenancies(id) on delete set null,
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

create index if not exists booking_financial_events_tenancy_idx
  on public.booking_financial_events (tenancy_id, created_at desc);

alter table public.booking_financial_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='booking_financial_events'
      and policyname='booking_financial_events_auth_all'
  ) then
    create policy booking_financial_events_auth_all on public.booking_financial_events
      for all to authenticated
      using (true)
      with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.booking_financial_events to authenticated;
grant usage, select on sequence public.booking_financial_events_id_seq to authenticated;
