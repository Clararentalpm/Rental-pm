# Inspection → Deposit → Confirmed Stay lifecycle (v1)

## Goal

One continuous workflow in the Rental PM UI:

**Inspection → Deposit Paid → Payment Action → Confirmed Stay → Room Reserved → Upcoming / Active → Bond Current / Past**

Without creating a second payments, bookings, or bonds system, and **without a database migration**.

## Approach (no migration)

v1 reuses existing tables only:

| Step | Table | Notes |
|------|--------|--------|
| Inspection booked | `room_viewings` | Existing fields + notes markers |
| Deposit cash | `rent_payments` | `PAYMENT_TYPE:deposit` + idempotency key |
| Deposit action | `payment_actions` | `action_type:'deposit'`, `status:'resolved'` |
| Confirmed stay | `tenants` + `tenancies` | Reuse tenant by exact name when present |
| Bond / deposit held | `bonds` | `bond_type:'booking_deposit'` |
| Refund / forfeit history | `bond_refund_events` | Unchanged |

Links between inspection ↔ stay ↔ payment ↔ action ↔ bond are stored as **notes markers** (same pattern as `ROOM_IDS` / `BOOKING_GROUP`).

## Notes markers

### On `room_viewings.notes`

| Marker | Meaning |
|--------|---------|
| `ROOM_IDS:12,15` | Multi-room inspection (primary still in `room_id`) |
| `TENANCY_ID:n` | Linked confirmed stay |
| `DEPOSIT_PAYMENT_ID:n` | Linked `rent_payments` deposit row |
| `DEPOSIT_ACTION_ID:n` | Linked deposit `payment_actions` row |
| `BOND_ID:n` | Linked `bonds` row |
| `LIFECYCLE:deposit_paid` | Lifecycle hint |
| `INSPECTION_COMPLETED:YYYY-MM-DD` | Inspection treated as completed |

### On `tenancies.notes` (created from deposit)

| Marker | Meaning |
|--------|---------|
| `VIEWING_ID:n` | Source inspection |
| `LIFECYCLE:stay_confirmed` | Confirmed from deposit flow |
| `SOURCE:inspection_deposit` | Provenance |
| `BOOKING_GROUP` / `SEGMENT_*` | Unchanged multi-room split stays |

### On deposit `rent_payments.notes`

| Marker | Meaning |
|--------|---------|
| `PAYMENT_TYPE:deposit` | Excluded from rental income / rent-due totals |
| `PAYMENT_CURRENCY:AUD\|CNY` | Display currency |
| `VIEWING_ID` / `TENANCY_ID` | Traceability |
| `IDEMPOTENCY_KEY:viewing-deposit-{id}` | Prevents duplicate deposit payments |

## Core API

- `viewingLifecycleStage(v)` — `inspection_scheduled` | `inspection_completed` | `deposit_paid` | `stay_confirmed` | `cancelled`
- `viewingLinkedTenancyId` / `viewingLinkedPaymentId` / … — read markers
- `viewingLifecycleBadgesHtml(v)` — chips + Open stay
- `buildConfirmDepositStayPlan(v, opts)` — pure plan (testable)
- `confirmDepositAndStayFromViewing(viewingId, opts)` — executes plan via existing `insert` / `patch`
- `markViewingDeposit` — confirm dialog, then calls confirm workflow
- `bondIsFinanciallyFinalised(b)` / `bondBucket(b)` — Current | Past bond tabs

## Behaviour notes

1. **Idempotent confirm** — if `TENANCY_ID` already linked to a non-cancelled stay, only deposit flags / markers on the viewing are refreshed; no second stay/payment/bond.
2. **Tenant reuse** — exact name match in `state.tenants` reuses the row (no duplicate guest).
3. **Half-open occupancy** — still `check_in <= date < check_out`. Upcoming stays show as **Next** on room cards (`Confirmed · upcoming`), not Current.
4. **Cancel** — does **not** delete `rent_payments` or deposit payment actions. Room is freed via cancelled status / `stayBlocksDate`. Bond forfeit/refund flow unchanged.
5. **Deposit ≠ rent income** — `isDepositPayment` / `isRentalCashPayment` exclude deposits from income KPIs and rent-due coverage.
6. **Multi-room** — single-room + `ROOM_IDS` inspections and `BOOKING_GROUP` split stays keep working; deposit confirm uses the primary `room_id` (first of `viewingRoomIds`).

## Why no migration for v1

- No new tables or columns.
- All linkage lives in existing `notes` text.
- Production historical deposit rows are **not** fabricated; legacy “deposit paid” inspections without `TENANCY_ID` get a **Confirm booking from deposit** button instead.

## Recommended future FKs (optional — do **not** run)

```sql
-- Optional later; out of scope for v1
alter table room_viewings
  add column linked_tenancy_id bigint references tenancies(id),
  add column linked_deposit_payment_id bigint references rent_payments(id),
  add column linked_deposit_action_id bigint references payment_actions(id),
  add column linked_bond_id bigint references bonds(id);

alter table rent_payments
  add column payment_kind text; -- e.g. 'rent' | 'deposit'
```

Backfill would map markers → FKs. Not required for current UI.

## Regression coverage

`inspection-deposit-lifecycle-regression-test.js` — TEST 1–13 (confirm markers, occupancy, cancel retain deposit, multi-room / booking group, bond Current/Past buckets, tenant reuse).
