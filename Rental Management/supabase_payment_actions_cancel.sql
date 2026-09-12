-- ============================================================================
-- FORWARD MIGRATION ONLY — production-safe, non-destructive
-- File: Rental Management/supabase_payment_actions_cancel.sql
-- ============================================================================
-- Run ONLY after owner approval in Supabase SQL Editor.
-- Do NOT run from agents against production automatically.
--
-- Guarantees:
--   * Uses CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
--   * Creates policies only when missing (no DROP / DELETE / TRUNCATE / DROP CASCADE)
--   * Does NOT UPDATE or DELETE any existing business rows
--   * Does NOT auto-cancel bookings, waive payment actions, or forfeit deposits
--   * forfeited_amount default 0 means "none forfeited yet" — not a forfeiture classification
--
-- Rollback instructions: see supabase_payment_actions_cancel_ROLLBACK.sql
-- Post-run checks:       see supabase_payment_actions_cancel_VERIFY.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Tenancy booking cancellation / no-show fields (nullable; no data change)
-- ---------------------------------------------------------------------------
alter table public.tenancies add column if not exists cancelled_at timestamptz;
alter table public.tenancies add column if not exists cancelled_by uuid;
alter table public.tenancies add column if not exists cancellation_reason text;
alter table public.tenancies add column if not exists cancellation_notes text;
alter table public.tenancies add column if not exists deposit_treatment text;
alter table public.tenancies add column if not exists rent_treatment text;
-- Existing tenancies.status values are left unchanged.

-- ---------------------------------------------------------------------------
-- 2) Bond / deposit forfeiture fields (nullable / default 0; no auto-forfeit)
-- ---------------------------------------------------------------------------
alter table public.bonds add column if not exists forfeited_amount numeric default 0;
alter table public.bonds add column if not exists forfeited_at date;
alter table public.bonds add column if not exists forfeited_by uuid;
alter table public.bonds add column if not exists forfeiture_reason text;
alter table public.bonds add column if not exists deposit_status text;
-- Existing bonds keep deposit_status NULL until staff explicitly acts in the app.

-- ---------------------------------------------------------------------------
-- 3) payment_actions (new empty table)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_actions (
  id bigserial primary key,
  property_id bigint references public.properties(id) on delete set null,
  tenancy_id bigint references public.tenancies(id) on delete set null,
  tenant_id bigint references public.tenants(id) on delete set null,
  room_id bigint references public.rooms(id) on delete set null,
  -- No FK to rent_payments / bonds: table/id conventions vary; app stores ids when known.
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
    where schemaname = 'public'
      and tablename = 'payment_actions'
      and policyname = 'payment_actions_select_authenticated'
  ) then
    create policy payment_actions_select_authenticated on public.payment_actions
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_actions'
      and policyname = 'payment_actions_write_staff'
  ) then
    create policy payment_actions_write_staff on public.payment_actions
      for all to authenticated
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('owner', 'manager')
        )
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('owner', 'manager')
        )
      );
  end if;
end $$;

grant select, insert, update, delete on public.payment_actions to authenticated;
grant usage, select on sequence public.payment_actions_id_seq to authenticated;
-- Viewer: SELECT allowed; writes blocked by payment_actions_write_staff.

-- ---------------------------------------------------------------------------
-- 4) payment_action_history (new empty append-only table)
-- ---------------------------------------------------------------------------
create table if not exists public.payment_action_history (
  id bigserial primary key,
  payment_action_id bigint references public.payment_actions(id) on delete set null,
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
    where schemaname = 'public'
      and tablename = 'payment_action_history'
      and policyname = 'payment_action_history_select_authenticated'
  ) then
    create policy payment_action_history_select_authenticated on public.payment_action_history
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_action_history'
      and policyname = 'payment_action_history_insert_staff'
  ) then
    create policy payment_action_history_insert_staff on public.payment_action_history
      for insert to authenticated
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('owner', 'manager')
        )
      );
  end if;
end $$;

grant select, insert on public.payment_action_history to authenticated;
grant usage, select on sequence public.payment_action_history_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 5) booking_financial_events (new empty append-only table)
-- Complements existing bond_refund_events; does not replace it.
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
    where schemaname = 'public'
      and tablename = 'booking_financial_events'
      and policyname = 'booking_financial_events_select_authenticated'
  ) then
    create policy booking_financial_events_select_authenticated on public.booking_financial_events
      for select to authenticated
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'booking_financial_events'
      and policyname = 'booking_financial_events_insert_staff'
  ) then
    create policy booking_financial_events_insert_staff on public.booking_financial_events
      for insert to authenticated
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role in ('owner', 'manager')
        )
      );
  end if;
end $$;

grant select, insert on public.booking_financial_events to authenticated;
grant usage, select on sequence public.booking_financial_events_id_seq to authenticated;

-- End of forward migration. Run VERIFY script next.
