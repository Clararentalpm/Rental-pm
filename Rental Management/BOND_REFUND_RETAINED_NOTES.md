# Refund from retained bond + past-stay bond + soft-delete archive

## What changed (app)

- **Refund from retained** — distinct action on Bond & Refund (including Refunded / Closed). Atomically decreases `forfeited_amount` and increases `refund_amount`. Remaining stays `$0` when already closed. Action code: `refund_retained`. Administrative only.
- Ordinary **Partial / Full refund** paths refuse when remaining is `$0` (they must not inflate the ledger against retained balance).
- **Record bond for past stay** — selector for historical stays; duplicate bond blocked; stay dates unchanged; no invented history.
- **Delete bond** — type `DELETE BOND` confirmation with amounts/history counts; archives via `archive_and_delete_bond` then hard-deletes live rows; restore creates a **new** bond id from the archive (does not claim older hard-deletes are recoverable).

## Database prerequisite (blocking for RPC paths)

Apply once (SQL Editor or any Postgres client with DDL rights) — **not** by this agent:

1. `supabase_refund_retained_and_bond_archive.sql`
2. `supabase_refund_retained_and_bond_archive_VERIFY.sql` — expect OK for:
   `action_check_received`, `action_check_no_extra_drops`, `rpc_refund_retained`,
   `rpc_acl_editors`, `archive_rls_staff`, `archive_table`, `idempotency_index`

CHECK update drops **only** `bond_refund_events_action_check` by exact name (no `%action%` loop).
Keeps `received` and other legal actions; adds `refund_retained`.
RPCs / archive RLS use `can_edit_rental()` / `is_rental_staff()` (not bare profiles membership).
Archive delete/restore always handles **both** `bond_refund_events` and `bond_payment_events` with count+amount verification; unsafe restore fails and rolls back.
Restore refuses when the stay already has a bond.

Isolated fictional verification (local throwaway DB):

1. `supabase_refund_retained_isolated_bootstrap.sql`
2. forward migration
3. VERIFY
4. `supabase_refund_retained_isolated_scenarios.sql`

## Free plan

No Dashboard → Backups dependency. Archive table lives in the same Postgres project. No money transfer claims.

## Already-deleted bonds (before this migration) — verified

Production probe (anon schema check, 2026-10-22):

| Source | Result |
|--------|--------|
| `bond_deletion_archives` | **Not present** (PGRST205) — archive/undo not installed yet |
| `archive_and_delete_bond` | **Not present** (PGRST202) |
| Old `deleteBond()` behaviour | Hard-deleted `bond_refund_events` then `bonds` |
| Thin `activity_log` (`delete_bond`) | May contain only `{amount, tenancy_id, type}` if the best-effort insert succeeded — **not** paid date/method/reference/retain-refund events |

**Conclusion:** An already hard-deleted bond’s action history cannot be claimed restored. Staff must re-record the original bond from the payment receipt on the existing historical stay (past-stay flow). After re-record → Retain → Refund from retained works on the new ledger. Future deletes (after SQL apply) go through archive + restore.

## Tests

- `node bond-refund-retained-regression-test.js` (40 checks, fictional)
- Existing `bond-retain-regression-test.js` and project suite remain green
