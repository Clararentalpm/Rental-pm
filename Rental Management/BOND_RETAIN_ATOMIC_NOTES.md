# Retain Bond — atomic RPC (PR #30)

## Deployment prerequisite (blocking)

Retain Bond in the app calls **one** PostgREST RPC:

`POST /rest/v1/rpc/retain_bond_atomic`

That function is **not** on production until an owner applies:

- `supabase_bond_retain_atomic.sql` (manual Supabase SQL Editor)
- Then `supabase_bond_retain_atomic_VERIFY.sql`

Until the migration is applied, the UI refuses the action with an explicit error and **does not** fall back to multi-request writes.

**Do not** auto-run this migration from Cursor, CI, or agents. **Do not** merge/deploy the app expecting Retain Bond to work without the SQL apply.

## Atomicity

Inside one Postgres transaction the function:

1. Locks the bond row (`FOR UPDATE`)
2. Replays if `reference = idempotency_key` already exists
3. Inserts `bond_refund_events` (durable key `retain:…`)
4. Updates `bonds` forfeited/remaining/status
5. Optionally inserts `booking_financial_events` (same txn; failure aborts all)

Client retries with the **same** idempotency key are safe. Ambiguous network errors are reconciled by looking up the key — never by deleting history after a suspected success.
