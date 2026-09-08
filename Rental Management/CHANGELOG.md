# Changelog

## Extra room + 加床 fees — 2026-09-08
- Reframed former “Extra sofa” as **Extra room** (sofa guest treated as extra room; typically $25/day).
- Added per-room **加床 / Extra bed** fee (typically $50), stored in existing `extra_bed_fee`.
- Extra room fee stored via `pricing_note` marker `EXTRA_ROOM_FEE:` (no DB schema change).

## Bond status buttons + Extra sofa fee — 2026-09-08
- Bond register: added **Mark refunded** / **Mark not refunded** buttons (plus matching actions in Refund/deduct dialog).
- Room Profiles: relabelled Extra bed fee → **Extra sofa fee ($/day)** and show Extra sofa on each room card.
- Note on Room Profiles: McGregor sofa-guest rate typically **$25/day** (set via Edit profile → Extra sofa fee).

## Shared payment groups — 2026-09-08
- Owner-confirmed rule: same `room_id` + same `check_in` date share one payment group.
- Any paid `rent_payments` row for a group member covers the whole group (clears overdue for co-occupants).
- If one person ends/does not renew, after check-out they leave the active group; remaining stays continue alone.
- Rent due schedule shows the group total **once** (option A), labelled as a shared payment group.

## Free GitHub Pages URL — 2026-09-08
- Added GitHub Actions Pages deploy from `Rental Management/`.
- Set app `CANONICAL_URL` to `https://clararentalpm.github.io/Rental-pm/` (Netlify team production deploys paused).
- Legacy Netlify URL remains documented; no production rental data changed.

## Phase 1 final verification — 2026-09-08
- Completed remaining Phase 1 verification without production data changes.
- Confirmed the single automated FAIL is Netlify Edge Access (HTTP 401), not a client regression.
- Confirmed `payments` table does not exist; `rent_payments` is correct.
- Confirmed `activity_log.actor_user_id` does not exist; `user_id` is correct.
- Mock-rendered Dashboard/Rooms/Tenants/Calendar/Payments/Bonds/Income/Search without regressions.
- Phase 2 still blocked pending owner approval.

## Master requirements + Phase 1 gate — 2026-09-08
- Saved authoritative brief as `MASTER_REQUIREMENTS.md`.
- Phase 1 code complete; Phase 2 blocked until owner approves the Phase 1 test report.

## Project folder layout — 2026-09-08
- Moved the working app into repo folder **`Rental Management/`** (future edits live here).
- Kept `netlify.toml` at the repo root with `publish = "Rental Management"`.

## Phase 1 stabilise — 2026-09-08
- Fixed Income page crash: added missing `property()` helper (uses current `state.propertyId`).
- Fixed owner payment delete to use table `rent_payments` (was incorrectly deleting from `payments`).
- Fixed Tenant live search selector to `#content` (markup has `<main class="main">`, not `id="main"`).
- Fixed bond delete local state update to use `state.bondEvents` (matches `loadAll` key).
- Aligned payment-delete audit with bond-delete: `activity_log.user_id`, best-effort so audit failure cannot block the delete.
- Restored versioned `netlify.toml` (publish folder + no-cache headers only; no SPA catch-all rewrite).

## Assessment — 2026-09-08
- Restored authoritative V6.5.2 `index.html` and handoff docs into the GitHub repo (previously empty aside from README).
- Added `ASSESSMENT.md` covering architecture, working features, broken items, security and deployment risks, and priority order.
- **No application logic or production data was modified.**

## Cursor handoff — 2026-09-08
- Preserved Rental PM V6.5.2 source unchanged.
- Added `CURSOR_CONTEXT.md` with project history, requirements, security rules and takeover instructions.
- Added `TODO.md` for initial audit and continuation work.
- No application logic or production data was modified during handoff packaging.
