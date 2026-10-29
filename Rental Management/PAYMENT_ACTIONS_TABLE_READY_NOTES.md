# Payment Actions “table not ready” — investigation

## Root cause (production read-only probe, 2026-10-29)

| Check | Result |
|-------|--------|
| `GET /rest/v1/payment_actions` | **HTTP 200** (table exists) |
| `payment_action_history` | **HTTP 200** |
| `booking_financial_events` | **HTTP 200** |
| Expected columns (`due_date`, `status`, …) | Present (bad-column probe returned 42703 only for invented name) |

The app error **“Payment actions table not ready. Run supabase_payment_actions_cancel.sql first.”** was a **frontend misclassification**:

1. `loadAll()` sets `state.paymentActionsError` on **any** failed `payment_actions` GET (timeout, JWT race, RLS, network).
2. `ensurePersistedAction()` always threw the **migration** message whenever that flag was set — even when the table already existed.

So this is **not** primarily a missing-migration problem. Re-running `CREATE TABLE` alone would not fix auth/RLS/network failures and must not be used to “wipe and recreate” (would risk data if someone used DROP).

Secondary risk: original `supabase_payment_actions_cancel.sql` write policies are **owner/manager role-gated**. After full-access parity, writes should allow **any profiles row**. If that rewrite was never applied, inserts fail with RLS (42501) — still not “table missing”.

## App fix (this PR)

- Classify load errors: `missing` vs `auth` vs `network` vs `rls`
- Only recommend create-table SQL when the relation is actually missing
- Single-flight `refreshSession()` to avoid parallel `loadAll` JWT races
- `ensurePaymentActionsReachable()` re-probes before blocking persist
- Banner shows the classified message

## Optional DB repair (owner-run, idempotent)

If authorised staff still cannot **write** actions (RLS):

1. `supabase_payment_actions_repair.sql` — IF NOT EXISTS objects + rewrite write policies to profiles membership; **no business row deletes**
2. `supabase_payment_actions_repair_VERIFY.sql`

Do **not** run `supabase_payment_actions_cancel_ROLLBACK.sql` (it drops tables).

## Payment behaviour (unchanged ledger rules)

- Partial / multiple payments via `reconcilePaymentAction` + `IDEMPOTENCY_KEY`
- Outstanding = original obligation − linked `rent_payments`
- Excess stays on the payment; no auto-apply to another tenancy
- Does not overwrite/delete existing payments, bonds, or history

## Safest next step

1. Deploy/merge **app fix** (stops false “run SQL” when table exists).
2. If writes still fail after Refresh: run **repair** SQL + VERIFY once.
3. Do not DROP `payment_actions` or re-run ROLLBACK.
