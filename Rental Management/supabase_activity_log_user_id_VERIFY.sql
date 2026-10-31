-- =============================================================================
-- READ-ONLY VERIFY — activity_log actor column (Free plan safe)
-- File: Rental Management/supabase_activity_log_user_id_VERIFY.sql
-- =============================================================================
-- Purpose: Confirm production uses activity_log.user_id and does NOT need
--          actor_user_id. Safe to run in Supabase SQL Editor.
--
-- Does NOT: INSERT / UPDATE / DELETE / ALTER / DROP
-- Does NOT: refresh PostgREST schema cache (not required when column is correct)
--
-- Expected:
--   * user_id_exists = true
--   * actor_user_id_exists = false
--   * No migration needed for the Payment Activity Log PGRST204 error
-- =============================================================================

select
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_log' and column_name='user_id'
  ) as user_id_exists,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='activity_log' and column_name='actor_user_id'
  ) as actor_user_id_exists;

-- Column list (read-only)
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='activity_log'
order by ordinal_position;

-- Row count only (no row payloads)
select count(*)::bigint as activity_log_rows from public.activity_log;
