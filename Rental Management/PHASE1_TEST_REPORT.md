# Phase 1 Test Report — Rental PM V6.5.2

**Date:** 2026-09-08  
**Folder:** `Rental Management/`  
**Master requirements:** `MASTER_REQUIREMENTS.md`  
**Gate:** Phase 2 must not start until the owner approves this report.

---

## Verdict

**Phase 1 client stabilisation: PASS (code + local smoke)**  
**Live hosted access: BLOCKED (Netlify HTTP 401 — pre-existing hosting gate)**  
**Signed-in live CRUD / RLS: NOT TESTED (no credentials used; no production data touched)**

---

## What Phase 1 fixed

| Bug | Fix | Automated check |
| --- | --- | --- |
| Income `property()` undefined | Added `property()` → `propertyBy(state.propertyId)` | PASS |
| Payment delete used table `payments` | Delete uses `rent_payments` | PASS |
| Tenant search used `#main` | Selector uses `#content` | PASS |
| Bond delete used `bondPaymentEvents` | Uses `state.bondEvents` | PASS |
| Payment audit used `actor_user_id` | Uses `user_id`, best-effort | PASS |
| Missing deploy config | Repo-root `netlify.toml` publishes `Rental Management` | PASS |

Also: working app moved into **`Rental Management/`**; master requirements saved.

---

## Tests run

### A. Automated regression (`phase1-test.js`)
- **26 PASS / 1 FAIL**
- The only FAIL is live Netlify public reachability: **HTTP 401** (Edge Access / site password). This is a hosting access issue, not a regression of the Phase 1 client bug fixes.
- Results JSON: `phase1-test-results.json`

### B. Local browser smoke (no sign-in)
- Served `http://127.0.0.1:8080/`
- Boot screen cleared; **Staff sign-in** UI shown
- Did **not** stick on Loading
- No fatal 8s startup timeout
- Console: only benign `favicon.ico` 404 (no app JS crash on first paint)
- Screenshot: auth sign-in screen captured during smoke test

### C. Not tested in Phase 1 (needs your access / approval)
- Real staff login / refresh / forgot-password against production
- Owner payment delete / bond delete against live Supabase
- Tenant search with live tenant rows after login
- Income page with live property data after login
- RLS / role enforcement for owner / manager / viewer
- Public Netlify URL after removing Edge Access / password gate

---

## Known remaining risks (not Phase 1 code defects)

1. **`https://rental-pm-v2.netlify.app/` returns 401** — staff invite/reset redirects may look broken until Edge Access is opened for staff.
2. Role checks in UI are still client-side; **RLS must be verified** separately.
3. Phase 2 items remain open by design: tenant reuse, stay overlap warnings, etc.

---

## Owner decision needed

Please reply with one of:

1. **Approve Phase 1** → I will start **Phase 2 only** (Tenant → Stay reuse / duplicate prevention / data integrity; no rebuild).
2. **Request changes** → tell me what to adjust in Phase 1 first.
3. **Provide access** (Netlify unlock and/or test login) → I can extend Phase 1 verification to signed-in live checks before Phase 2.

**I am waiting for your approval before starting Phase 2.**
