-- =============================================================================
-- IDEMPOTENT REPAIR — payment_actions grants / RLS (Free plan safe)
-- File: Rental Management/supabase_payment_actions_repair.sql
-- =============================================================================
-- Use when:
--   * Tables already exist (CREATE TABLE IF NOT EXISTS is a no-op), OR
--   * App showed "Payment actions table not ready" but production probe finds
--     payment_actions (frontend misclassified auth/RLS/network as missing), OR
--   * Write policies are still role-gated (owner/manager) after full-access parity.
--
-- Guarantees:
--   * Does NOT DELETE / TRUNCATE / UPDATE business rows (tenants, payments, bonds…)
--   * Does NOT drop payment_actions / history / booking_financial_events tables
--   * CREATE IF NOT EXISTS + policy replace by exact name only
--   * Safe to re-run
--
-- Prefer this over re-running supabase_payment_actions_cancel.sql when tables exist.
-- After apply: run supabase_payment_actions_repair_VERIFY.sql
-- =============================================================================

-- 1) Ensure core objects exist (no-op when already applied)

alter table public.tenancies add column if not exists cancelled_at timestamptz;
alter table public.tenancies add column if not exists cancelled_by uuid;
alter table public.tenancies add column if not exists cancellation_reason text;
alter table public.tenancies add column if not exists cancellation_notes text;
alter table public.tenancies add column if not exists deposit_treatment text;
alter table public.tenancies add column if not exists rent_treatment text;

alter table public.bonds add column if not exists forfeited_amount numeric default 0;
alter table public.bonds add column if not exists forfeited_at date;
alter table public.bonds add column if not exists forfeited_by uuid;
alter table public.bonds add column if not exists forfeiture_reason text;
alter table public.bonds add column if not exists deposit_status text;

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

alter table public.payment_actions enable row level security;
alter table public.payment_action_history enable row level security;
alter table public.booking_financial_events enable row level security;

-- 2) Grants (idempotent)
grant select, insert, update, delete on public.payment_actions to authenticated;
grant usage, select on sequence public.payment_actions_id_seq to authenticated;
grant select, insert on public.payment_action_history to authenticated;
grant usage, select on sequence public.payment_action_history_id_seq to authenticated;
grant select, insert on public.booking_financial_events to authenticated;
grant usage, select on sequence public.booking_financial_events_id_seq to authenticated;
revoke all on public.payment_actions from anon;
revoke all on public.payment_action_history from anon;
revoke all on public.booking_financial_events from anon;

-- 3) Replace named policies to match authorised full-access (profiles membership)
--    SELECT: any authenticated. WRITE: profiles row for auth.uid() (role label ignored).
drop policy if exists payment_actions_select_authenticated on public.payment_actions;
create policy payment_actions_select_authenticated on public.payment_actions
  for select to authenticated
  using (true);

drop policy if exists payment_actions_write_staff on public.payment_actions;
create policy payment_actions_write_staff on public.payment_actions
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

drop policy if exists payment_action_history_select_authenticated on public.payment_action_history;
create policy payment_action_history_select_authenticated on public.payment_action_history
  for select to authenticated
  using (true);

drop policy if exists payment_action_history_insert_staff on public.payment_action_history;
create policy payment_action_history_insert_staff on public.payment_action_history
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

drop policy if exists booking_financial_events_select_authenticated on public.booking_financial_events;
create policy booking_financial_events_select_authenticated on public.booking_financial_events
  for select to authenticated
  using (true);

drop policy if exists booking_financial_events_insert_staff on public.booking_financial_events;
create policy booking_financial_events_insert_staff on public.booking_financial_events
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid()));

-- End repair. Run VERIFY next. No business rows were modified.
