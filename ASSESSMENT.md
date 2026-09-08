# Rental PM V6.5.2 — Initial Assessment

Assessment date: 2026-09-08  
Scope: inspect uploaded V6.5.2 `index.html` + handoff docs only. **No application logic or production data was modified.**

## 1. Architecture and data flow

- Single-page app: one static `index.html` (HTML + CSS + inline JS). No build step.
- Client talks directly to Supabase Auth REST (`/auth/v1/...`) and PostgREST (`/rest/v1/...`).
- Session JWT/refresh token stored in `localStorage` under `rental-pm-v6-session`.
- Staff invite / delete / resend go through Supabase Edge Functions:
  - `rental-invite-staff`
  - `rental-delete-staff`
  - `rental-resend-staff-link`
- Canonical redirect URL hard-coded to `https://rental-pm-v2.netlify.app/`.
- Boot path: 8s timeout → auth/recovery parse → session refresh → `loadAll()` (12 parallel table reads via `Promise.allSettled`) → client-side render by page.
- Role model in UI: `owner` / `manager` / `viewer` from `profiles`. `canEdit()` = owner|manager. Staff page and destructive deletes are owner-only in UI.

### Tables loaded

`properties`, `rooms`, `tenants`, `tenancies`, `bonds`, `rent_payments`, `profiles`, `room_profiles`, `room_price_history`, `activity_log`, `bond_payment_events`, `bond_refund_events`

## 2. Working features (as implemented in code)

- Staff sign-in, forgot-password, invite/recovery password setup from URL hash/query tokens.
- Startup fail-fast (8s) instead of infinite Loading.
- Overview: room cards, metrics, 7-day arrivals/departures, overdue rent, bond watch, stay table filters.
- Tenants: filters (current/upcoming/past/all), edit tenant/stay dialogs.
- Room profiles: view/edit pricing fields; price changes logged to `room_price_history`.
- Availability: 90-day calendar + vacancy view + datetime room finder.
- Payments: due schedule from paid-through logic; record payment.
- Income dashboard: week/month/year totals and history grouping.
- Bonds: create, refund/deduct/note actions with remaining-amount updates + event history.
- Staff Access (owner UI): invite, role change, resend link, reset, delete via edge functions.
- History: historical tenancies + recent `activity_log`.
- Responsive layout with mobile bottom nav.

## 3. Broken / incomplete features

| Issue | Impact |
| --- | --- |
| `property()` called on Income page but **never defined** (only `propertyBy`) | Income page likely throws and fails to render |
| `deletePayment` DELETEs table `payments`, while reads/inserts use `rent_payments` | Owner payment delete likely fails |
| Tenant live search selects `#main ...` but markup is `<main class="main">` (no `id="main"`) | Typing in search does not filter rows |
| `deleteBond` mutates `state.bondPaymentEvents`, but `loadAll` stores that data as `state.bondEvents` | Possible runtime error after bond delete |
| `activity_log` column inconsistency: payment delete uses `actor_user_id`; bond delete uses `user_id` | One of the audit writes may fail depending on schema |
| New stay always creates a **new** tenant row | Duplicate tenant risk; no reuse/search of existing tenants |
| No overlap validation on create/edit stay | Overlapping room bookings possible |
| `payment_cycle_weeks` not used by `nextRentDue` / `rentState` | Due dates advance by paid period end + 1 day only; cycle length may not match business expectation |
| Viewer/manager role checks are **client-side only** | Any authenticated user can call REST directly unless RLS blocks them |
| `netlify.toml` missing from handoff package | Deploy config not versioned in this repo |
| Live URL returns Netlify **401 Edge Access / password gate** | Site not publicly reachable without Netlify login; may break invite/reset redirects for staff |

## 4. Supabase / auth / RLS / security risks

- Publishable client key is in browser source (expected for SPA). Authorization must be enforced by **RLS + edge-function auth**, not UI role checks.
- Unknown without DB access (must verify next): RLS on every table; whether viewers can INSERT/UPDATE/DELETE; whether `profiles.role` can be self-escalated to `owner`; whether edge functions verify caller is owner.
- Session in `localStorage` is XSS-sensitive; XSS would expose JWTs.
- Password recovery/invite tokens land in URL hash then are stripped; still sensitive to referrer/history leakage windows.
- Staff delete/invite rely on edge functions — if those functions use service role without verifying owner JWT claims, any signed-in user could abuse them.
- Do not treat UI hiding of Staff Access / Delete buttons as security.

## 5. Deployment risks

- Repo on GitHub was empty except `README.md`; V6.5.2 lived only in the agent upload until this handoff restore.
- Canonical host `rental-pm-v2.netlify.app` is currently behind Netlify site password / edge access (HTTP 401). Staff invite/reset emails redirect there — gated hosting can look like “broken login” or “stuck” after email links.
- Historical 404s: likely publish/root/`index.html` path issues; cannot fully verify without Netlify access. No `netlify.toml` in package to confirm publish settings.
- No Vercel config present; Netlify is the assumed host.
- Hard-coded canonical URL means renaming/migrating the Netlify site without a code change will break recovery redirects.

## 6. Recommended priority order

1. **Repo restore complete** — keep V6.5.2 as authoritative source; do not rebuild.
2. **Confirm Netlify config** — obtain/restore `netlify.toml`, clarify Edge Access vs public staff access, confirm SPA routing.
3. **Map Supabase schema + RLS** — especially `profiles`, `rent_payments` vs `payments`, `activity_log` columns, edge function authorization.
4. **Fix confirmed client bugs** (Income `property()`, payment delete table name, tenant search selector, bondEvents state key) without changing rent/bond semantics.
5. **Auth flows** — login, refresh, forgot/reset, invite activate against live (or staging) with each role.
6. **CRUD + calendar + rent-due verification** using non-destructive reads first; only then controlled write tests.
7. **Feature work** only after the above (duplicate-tenant prevention, overlap checks, etc.).

## Notes

- Live operational data must not be seeded, wiped, or casually migrated.
- Ambiguous business rules should be confirmed with the owner before inventing behavior.
