# Phase 1 Final Report — Rental PM V6.5.2

**Date:** 2026-09-08  
**Folder:** `Rental Management/`  
**Production data modified:** **No**  
**Phase 2 started:** **No** (waiting for owner approval)

---

## Final verdict

### Phase 1 client stabilisation: **PASS**
### Live hosted URL verification: **BLOCKED** (Netlify Edge Access HTTP 401)
### Signed-in live CRUD verification: **NOT COMPLETE** (requires your access; no credentials used)

**Overall Phase 1 (safe-to-complete checks):** **PASS with hosting caveat**

---

## 1) The 1 failed automated check

| Item | Detail |
| --- | --- |
| **What failed** | `live Netlify publicly reachable` |
| **Observed** | `GET https://rental-pm-v2.netlify.app/` → **HTTP 401** |
| **Why** | Netlify **Edge Access** gate. Response body redirects to `https://app.netlify.com/edge-access?domain=rental-pm-v2.netlify.app...` |
| **Is this an app-code bug?** | **No.** The Phase 1 client fixes are unrelated. |
| **Does it need fixing?** | **Yes for production usability / staff invite+reset redirects**, but it is a **hosting access setting**, not a V6.5.2 JS defect. |
| **Did Phase 1 introduce it?** | **No.** It was already identified in the assessment. |

Local static serve of the same `index.html` returns **HTTP 200** and shows Staff sign-in (not stuck on Loading).

---

## 2) Four previously identified V6.5.2 bugs — confirmed fixed in current code

| Bug | Current code evidence | Extra confirmation |
| --- | --- | --- |
| Income `property()` missing | `function property(){return propertyBy(state.propertyId)}` present; Income page calls it | Mock render shows **Demo Property** in Income HTML |
| Payment delete wrong table | `api('rent_payments', ... DELETE)`; no `api('payments')` | Live schema probe: table **`payments` does not exist**; PostgREST hint says use `public.rent_payments` |
| Tenant search `#main` | selector is `#content table tbody tr[data-tenant-search]` | Markup is `<main class="main">` + `#content`; mock Tenants/Search pages render search attrs |
| `bondPaymentEvents` vs `bondEvents` | `state.bondEvents=state.bondEvents.filter(...)`; no `bondPaymentEvents` | Matches `loadAll` key `bondEvents` |

Also confirmed by schema probe (read-only):

- `activity_log.user_id` **exists** (HTTP 200)
- `activity_log.actor_user_id` **does not exist** (HTTP 400) → Phase 1 audit-field alignment is correct

---

## 3) Page / auth regression check after Phase 1 fixes

Mock-data render smoke (no network writes):

| Area | Result |
| --- | --- |
| Dashboard / Overview | **PASS** |
| Rooms | **PASS** |
| Tenants | **PASS** |
| Calendar / Availability | **PASS** |
| Payments | **PASS** |
| Bonds | **PASS** |
| Income | **PASS** (uses fixed `property()`) |
| Search (tenant live-filter markup/wiring) | **PASS** |
| Authentication surface (sign-in / forgot / recovery / boot timeout helpers present; local auth UI loads) | **PASS** (local) |

No Phase 1 regression detected in these surfaces from static/mock checks.

---

## 4) Static Supabase CRUD / RLS review (no credentials, no data changes)

### Table-name integrity
- Client reads/writes **`rent_payments`** consistently.
- Probe of non-existent **`payments`** → 404 + hint to `rent_payments` (validates the old bug).
- Expected tables respond as existing: `properties`, `rooms`, `tenants`, `tenancies`, `bonds`, `rent_payments`, `profiles`, `room_profiles`, `activity_log`, `bond_payment_events`, `bond_refund_events`.

### Column probes used by the app (selected fields)
- `rent_payments`, `bonds`, `tenancies`, `profiles` selected field sets used by the client returned **HTTP 200** (columns accepted).
- `activity_log.actor_user_id` rejected (does not exist).

### RLS / permission signals (anonymous publishable key only)
- Anonymous **INSERT** attempts on `tenants`, `rent_payments`, `bonds`, `activity_log`, `profiles` → **HTTP 401 RLS violation** (`42501`). **No rows written.**
- Edge functions without a user JWT → **HTTP 401 Unauthorized** (`rental-invite-staff`, `rental-delete-staff`, `rental-resend-staff-link`).
- Auth password grant endpoint responds normally to invalid login (`invalid_credentials`) — endpoint alive; no credential testing beyond that.

### Likely risks still requiring owner/manual verification
1. **UI role checks are not security.** `canEdit()` / `role()==='owner'` hide buttons only. Real protection must be RLS + edge-function auth.
2. **`changeRole()` has no explicit owner guard in the function** (Staff page is owner-gated in UI). If RLS allows authenticated users to `UPDATE profiles.role`, privilege escalation is possible. **Must verify profiles UPDATE policy.**
3. **Anonymous SELECT returns `[]` (HTTP 200)** for business tables. That usually means “no visible rows for anon,” not “open data,” but **SELECT policies for authenticated roles** (viewer/manager/owner differences) are still unverified.
4. **`bond_payment_events` is selected/deleted but never inserted by the client** — possible dead table or server-only path; not a Phase 1 blocker.
5. Known product gaps (not Phase 1 regressions): new stay always creates a new tenant row; no overlap conflict check; `nextRentDue` ignores `payment_cycle_weeks`.

---

## 5) Netlify HTTP 401 — what access I need (no passwords in chat)

I do **not** need you to send any password, JWT, or service-role key in chat.

**What I need you to do in Netlify (yourself):**
1. Open the Netlify site for **`rental-pm-v2.netlify.app`**.
2. Find **Edge Access / site password / visitor access** settings.
3. Either:
   - **Disable Edge Access / site password** for this staff app, **or**
   - Configure access so the app URL is reachable by staff invite/reset links without an extra Netlify login wall.
4. Confirm the site publish directory is **`Rental Management`** (matches repo-root `netlify.toml`).

**Why:**
- The app hard-codes invite/reset redirects to `https://rental-pm-v2.netlify.app/`.
- While Edge Access returns 401, staff email links can look “broken” even if Rental PM auth itself is fine.
- I cannot complete live hosted smoke (or observe post-login pages on the canonical URL) until that gate is opened by you.

Optional later (still no secrets in chat): after Edge Access is open, you can sign in yourself and tell me whether Overview/Income/Search look correct, or share a **temporary read-only test account** through a secure channel of your choosing — but that is not required to accept Phase 1 client fixes.

---

## 6) What still requires your access / manual testing

- Open/disable Netlify Edge Access on the live URL
- Real staff login / refresh / forgot-password on the live site
- Signed-in checks: Dashboard, Rooms, Tenants search, Calendar, Payments, Bonds, Income with real data
- Supabase RLS policy review in dashboard (especially `profiles` UPDATE and viewer write denial)
- Confirm edge functions only succeed for owner JWTs

---

## Gate

**Phase 2 will not start until you explicitly approve Phase 1.**

Reply with:
1. **Approve Phase 1** → start Phase 2 only, or  
2. **Hold / fix hosting first** → unlock Netlify, then I can extend live verification still within Phase 1 if you want.
