# Payment Activity Log — `actor_user_id` investigation

## Root cause

Production `activity_log` has column **`user_id`**. It does **not** have `actor_user_id`.

Read-only probe (2026-10-31):

| Check | Result |
|-------|--------|
| `activity_log.user_id` | HTTP 200 |
| `activity_log.actor_user_id` | HTTP 400 / PGRST204: *Could not find the 'actor_user_id' column of 'activity_log' in the schema cache* |

That exact PostgREST message is a **client payload schema mismatch**, not a stale cache for a column that should exist, and not a missing `activity_log` table.

Historically (Phase 1), **payment delete** sent `actor_user_id`. Add/Edit Payment on current `main` did **not** write `activity_log` at all — so a user-visible PGRST204 on Add/Edit implies an older client payload and/or any code path still posting that column. Correct column name is `user_id`.

## Payment save vs log ordering

| Step | Behaviour after this fix |
|------|---------------------------|
| 1. Insert/patch `rent_payments` | Required — failure shows as payment error |
| 2. `logActivityBestEffort(...)` with `user_id` | After save; never throws; never rolls back payment |
| 3. Payment Action reconcile | After save; secondary note if it fails |
| 4. Toast + reload | Reports payment success; mentions log/reconcile issues without claiming payment failed |

**Payments are saved before activity logging.** A log failure must not be reported as a payment failure. Retries use `IDEMPOTENCY_KEY` in notes to avoid duplicate `rent_payments` rows.

## Fix (app only — no production SQL)

- `logActivityBestEffort` — always `user_id`, best-effort
- Payment form: save → log → reconcile; clear success/secondary messaging
- Delete payment: still audits after delete via the same helper

## SQL

**No migration required.** Do not add `actor_user_id` (duplicate/wrong column). Optional owner-only read-only check: `supabase_activity_log_user_id_VERIFY.sql`.

## Production safety

- No production DB changes by this agent
- No deletes/updates of existing payments
- No merge / deploy until explicit approval
