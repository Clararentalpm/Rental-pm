# Changelog

## Defect fixes — 2026-09-08
- Fixed Income page crash: added missing `property()` helper wrapping `propertyBy(state.propertyId)`.
- Fixed owner payment delete to target `rent_payments` (was incorrectly deleting from `payments`).
- Fixed Tenants live search selector to `#content` (was `#main`, which does not exist).
- Fixed bond delete optimistic state update to use `state.bondEvents` (was `bondPaymentEvents`).
- Verified no remaining `api('payments')` / `bondPaymentEvents` / `#main` tenant-search references.

## Assessment — 2026-09-08
- Restored authoritative V6.5.2 `index.html` and handoff docs into the GitHub repo (previously empty aside from README).
- Added `ASSESSMENT.md` covering architecture, working features, broken items, security and deployment risks, and priority order.
- **No application logic or production data was modified.**

## Cursor handoff — 2026-09-08
- Preserved Rental PM V6.5.2 source unchanged.
- Added `CURSOR_CONTEXT.md` with project history, requirements, security rules and takeover instructions.
- Added `TODO.md` for initial audit and continuation work.
- No application logic or production data was modified during handoff packaging.
