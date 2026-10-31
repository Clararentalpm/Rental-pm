# Payment / Room Status / Tenant & Bond filters

## Root causes

1. **Delete Payment `actor_user_id`** — Same schema mismatch as PR #33. Production `activity_log` has `user_id` only. This PR builds on the merged `#33` helper (`logActivityBestEffort`) and hardens delete (richer audit, double-delete guard, soft reconcile after delete). No second migration.

2. **Add/Edit Covered Period** — Form previously required / auto-filled period end, blocking “save now, add period later”.

3. **Room Status former occupants** — Shared occupancy helpers already exclude past/cancelled; UI now shows explicit **Vacant**, check-in/checkout, next upcoming, and availability so past tenants cannot be mistaken for current.

4. **Tenant / Bond filters** — Tenants remapped `all`→current and used Historical naming; Bonds filtered by open/closed money state instead of stay status.
5. **Unlinked bonds** — Missing/invalid `tenancy_id` must not be labelled Past; they use **Unlinked / Needs Review**.

## Implementation (app only)

- Payments: optional covered period; Edit/Delete Payment actions; edit keeps same `rent_payments.id`; delete confirms, guards double-submit, audits via `user_id`; `refreshPaymentDerivedState` recalculates after success; log/reconcile failures are secondary notes only.
- Room Status: Vacant + structured occupancy fields; Brisbane timezone SoT unchanged; Carindale R3 ensuite / R4 not ensuite preserved.
- Tenants: **All | Current | Upcoming | Past** (default Current).
- Bonds: **All | Current | Upcoming | Past | Unlinked / Needs Review** by linked stay; closed past bonds remain listed; unlinked never auto-relinked/deleted.

## Database

**None required.** Optional read-only VERIFY from PR #33 still applies.

## Safety

No production SQL, no merge/deploy from this agent until approved.
