# Retain Bond — atomic RPC (PR #30)

## Deployment prerequisite (blocking)

Retain Bond in the app calls **one** PostgREST RPC:

`POST /rest/v1/rpc/retain_bond_atomic`

That function is **not** on production until an owner applies the reviewed SQL.

**Do not** auto-run this migration from Cursor, CI, or agents.

## Permissions (reviewed)

- `SECURITY INVOKER` (not DEFINER) — existing RLS is not bypassed
- `REVOKE ALL … FROM PUBLIC`
- `REVOKE ALL … FROM anon`
- `GRANT EXECUTE … TO authenticated` only
- Function body requires `auth.uid()` **and** a `profiles` row (same rule as app `canEdit` / authorised account holder)

## Isolated database evidence (agent-run, fictional data)

Local Postgres DB `rental_pm_retain_isolated` (created, tested, **dropped** — never production):

1. `supabase_bond_retain_isolated_harness.sql` — stub `auth.uid()`, roles, RLS, fictional bonds 101–103  
2. `supabase_bond_retain_atomic.sql` — forward migration  
3. `supabase_bond_retain_atomic_VERIFY.sql` — **PASS** (INVOKER, unique index, EXECUTE ACL no PUBLIC/anon)  
4. `supabase_bond_retain_isolated_scenarios.sql` — **ALL ISOLATED SQL SCENARIOS PASSED**:
   - anon blocked; JWT without profiles blocked
   - partial retention (balance + history together once)
   - refund after partial retention
   - full retention of remaining
   - repeated idempotency key → replay, no double apply
   - concurrent second retain blocked (overdraw)
   - post-commit same-key retry → replay once

## Exact owner deployment checklist (order)

1. **You:** Take a Supabase/Postgres backup (or PITR restore point) of production.  
2. **You:** Re-read the final reviewed `supabase_bond_retain_atomic.sql` in this PR.  
3. **You:** Apply **only that file** in the Supabase SQL Editor (approved production SQL).  
4. **You:** Run `supabase_bond_retain_atomic_VERIFY.sql` in production; confirm SECURITY INVOKER, unique index, and `execute_acl_check = PASS`.  
5. **You:** Merge Draft PR #30 (or mark Ready and merge) **after** VERIFY passes.  
6. **You:** Deploy/publish the site (or wait for Pages deploy from `main`).  
7. **You:** On the live site, open Bond & Refund with a **test** bond only; confirm Retain Bond appears and a dry-run path is understood (prefer a non-critical test property if available).

Agent must not run steps 1–7 against production.

## Rollback

Manual: `supabase_bond_retain_atomic_ROLLBACK.sql` (drops function + unique index; keeps history rows).

## Remaining limitations

- Production SQL apply and live UI check are **owner-only**; agent verified on an isolated local DB with fictional rows only.
- True multi-session race under Supabase connection pooler was approximated in-process (sequential calls under one session with row lock semantics); pooler-level concurrency was not load-tested against cloud Supabase.
- Optional `booking_financial_events` insert failures are swallowed in a subtransaction so they cannot undo bond + history.
