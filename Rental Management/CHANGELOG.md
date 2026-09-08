# Changelog

## Project folder layout — 2026-09-08
- Moved the working app into repo folder **`Rental Management/`** (future edits live here).
- Kept `netlify.toml` at the repo root with `publish = "Rental Management"`.

## Phase 1 stabilise — 2026-09-08
- Fixed Income page crash: added missing `property()` helper (uses current `state.propertyId`).
- Fixed owner payment delete to use table `rent_payments` (was incorrectly deleting from `payments`).
- Fixed Tenant live search selector to `#content` (markup has `<main class="main">`, not `id="main"`).
- Fixed bond delete local state update to use `state.bondEvents` (matches `loadAll` key).
- Aligned payment-delete audit with bond-delete: `activity_log.user_id`, best-effort so audit failure cannot block the delete.
- Restored versioned `netlify.toml` (publish root + no-cache headers only; no SPA catch-all rewrite).

## Assessment — 2026-09-08
- Restored authoritative V6.5.2 `index.html` and handoff docs into the GitHub repo (previously empty aside from README).
- Added `ASSESSMENT.md` covering architecture, working features, broken items, security and deployment risks, and priority order.
- **No application logic or production data was modified.**

## Cursor handoff — 2026-09-08
- Preserved Rental PM V6.5.2 source unchanged.
- Added `CURSOR_CONTEXT.md` with project history, requirements, security rules and takeover instructions.
- Added `TODO.md` for initial audit and continuation work.
- No application logic or production data was modified during handoff packaging.
