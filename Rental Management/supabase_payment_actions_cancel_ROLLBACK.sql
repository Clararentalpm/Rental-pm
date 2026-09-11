-- ============================================================================
-- ROLLBACK ONLY — optional, manual
-- File: Rental Management/supabase_payment_actions_cancel_ROLLBACK.sql
-- ============================================================================
-- Use ONLY if you need to remove the structures added by
-- supabase_payment_actions_cancel.sql
--
-- This is NOT part of the forward migration.
-- Do NOT run unless you intentionally want to undo the schema add-on.
--
-- Effects:
--   * Drops the three NEW tables (and their rows, if any were created after migration)
--   * Drops the NEW columns from tenancies / bonds
--   * Does NOT delete original tenants, payments, bonds amount/refund history,
--     rooms, or pre-existing audit tables
-- ============================================================================

drop table if exists public.payment_action_history;
drop table if exists public.booking_financial_events;
drop table if exists public.payment_actions;

alter table public.tenancies drop column if exists cancelled_at;
alter table public.tenancies drop column if exists cancelled_by;
alter table public.tenancies drop column if exists cancellation_reason;
alter table public.tenancies drop column if exists cancellation_notes;
alter table public.tenancies drop column if exists deposit_treatment;
alter table public.tenancies drop column if exists rent_treatment;

alter table public.bonds drop column if exists forfeited_amount;
alter table public.bonds drop column if exists forfeited_at;
alter table public.bonds drop column if exists forfeited_by;
alter table public.bonds drop column if exists forfeiture_reason;
alter table public.bonds drop column if exists deposit_status;
