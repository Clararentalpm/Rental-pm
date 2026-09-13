# Rental PM Consistency Audit — Final Report

**Branch:** `cursor/rental-pm-consistency-audit-930a`  
**Status:** Draft — awaiting approval. **Do not merge / deploy / run production SQL.**

## 1. Root causes (confirmed bugs)

| # | Issue | Root cause | Fix |
|---|------|------------|-----|
| 1 | Bond register no Edit/Delete | Actions omitted | Owner Edit (fields only) + Delete with history warning / blockers |
| 2 | Room Status stale | Relied on loose `tenancyKind`; did not re-derive after writes | `currentOccupantsForRoom` / `nextBookingForRoom`; `loadAll` after mutations |
| 3 | Notes showed `IDEMPOTENCY_KEY` | Raw notes rendered | `displayPaymentNotes` strips internal markers |
| 4–5,16 | Ambiguous finance cards | Mixed rent-roll with cash | Explicit KPIs + tooltips + historical seasonality |
| 6 | Carindale Room 4 ensuite | Source `rooms.ensuite` | SQL fix file (not executed); UI reads source flag |
| 7 | Subtle find-room results | Weak markup | Prominent AVAILABLE / PARTIAL / NOT panels |
| 8–9 | Cancel/delete with payments | No integrity gate | Block with clear message; Delete stay owner-only with blockers |
| 10 | Unpaid stay not overdue until refresh | Action not recreated after create | `recreateActionForTenancy` + `loadAll` after stay create |
| 11 | Unfiltered rent schedule | No controls | Search + status/type + due-from/to |
| 12 | Inspection SMS | No integration point | Prefer SMS; show “SMS service not configured” if absent; log sends |
| 13 | Duplicate inspections | Double-submit | Busy disable + identical visitor/room/time guard |
| 14 | Checkout off-by-one | Inclusive end day | Half-open `[check_in, check_out)` globally |
| 15 | Room 2 shared rent | Group members double-counted in UI | Payment-group primary + shared rate line |
| 19–25 | Room Status duplicates (Laura×N, Blackgun×N, Room 6) | Past/cancelled/future stays treated as current; sofa as Room 6 | Strict occupancy helpers; McGregor room_no 6 → Sofa; cancelled excluded from departures/groups |
| 26 | Occupancy regressions | Missing scenarios | Added automated room-status cases in consistency audit test |

## 2. Bugs vs expected

- **Bugs:** all items above that shipped code fixes.
- **Expected / deferred:** Carindale ensuite SQL must be run manually after approval; existing production duplicate inspections/stays are **reported only** (`AUDIT_DUPLICATE_INSPECTIONS.md`, `AUDIT_ROOM_STATUS_DUPLICATES.md`) — not auto-deleted.

## 3. Files changed

- `Rental Management/index.html` — shared logic + UI
- `Rental Management/consistency-audit-regression-test.js` — new regression suite
- `Rental Management/supabase_carindale_room4_ensuite_fix.sql` — preview + update (not run)
- `Rental Management/AUDIT_DUPLICATE_INSPECTIONS.md`
- `Rental Management/AUDIT_ROOM_STATUS_DUPLICATES.md`

## 4. Schema / migration

- **Required for Carindale R4:** run `supabase_carindale_room4_ensuite_fix.sql` after owner approval.
- No other production migration in this PR.

## 5. Test results (all pass)

- cancel-forfeit-test.js
- payment-group-test.js
- payment-reconcile-test.js
- phase1-test.js
- stay-rent-consistency-test.js
- tenant-filter-test.js
- viewing-test.js
- final-regression-test.js
- laura-short-stay-regression-test.js
- consistency-audit-regression-test.js (10 checks including room-status occupancy)

## 6. Screenshots

See walkthrough artifacts:

- financial_dashboard_room_status.png
- availability_find_result_panels.png
- payment_notes_sanitised_v2.png
- bond_edit_delete_actions.png
- carindale_room4_no_ensuite.png
- payments_schedule_filters.png
- integrity_sms_checkout_notes.png

## Stop

Waiting for approval before merge, deploy, or production SQL.
