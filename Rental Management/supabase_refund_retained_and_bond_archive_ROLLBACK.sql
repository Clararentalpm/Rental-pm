-- ROLLBACK — supabase_refund_retained_and_bond_archive.sql
-- Manual only. Does NOT delete bond_deletion_archives rows or bond_refund_events.
-- Does NOT restore the previous action CHECK list (restore_* remain allowed if you keep the constraint).

drop function if exists public.restore_archived_bond(text);
drop function if exists public.archive_and_delete_bond(bigint, text);
drop function if exists public.refund_retained_bond_atomic(bigint, numeric, text, text, text, text, date);

drop index if exists public.bond_refund_events_refund_retained_idempotency_uidx;

-- Keep bond_deletion_archives by default (contains recovery data).
-- Uncomment to remove the table:
-- drop table if exists public.bond_deletion_archives;

-- Optional: tighten CHECK again (only if you are sure no retain_*/refund_retained rows exist)
-- alter table public.bond_refund_events drop constraint if exists bond_refund_events_action_check;
