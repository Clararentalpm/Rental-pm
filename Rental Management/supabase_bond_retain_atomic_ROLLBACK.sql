-- =============================================================================
-- ROLLBACK — supabase_bond_retain_atomic.sql
-- Manual only. Does NOT delete bond_refund_events or bonds rows.
-- =============================================================================

drop function if exists public.retain_bond_atomic(bigint, text, numeric, text, text, date);

drop index if exists public.bond_refund_events_retain_idempotency_uidx;

-- Note: existing retain:* history rows are kept for audit.
select 'rollback complete — function and unique index removed; history rows retained' as note;
