# Crystal Clear Optometry — Master Context

**Status:** Phase 1 audit complete — **source repository not attached**  
**Document version:** 2026-09-09  
**Authoritative product brief:** Owner Master Handover (September 2026)  
**Implementation source of truth:** Crystal Clear Optometry **application source** (not yet present in this Cursor workspace)

---

## 0. Critical workspace finding (read first)

This Cursor Cloud Agent environment is currently connected to:

| Item | Value |
| --- | --- |
| GitHub repository | `github.com/Clararentalpm/Rental-pm` |
| Local working tree | Rental PM V6.5.2 (`Rental Management/`) |
| Product in repo | **Room rental / property management** — not optometry |

**Crystal Clear Optometry application source code is NOT in this repository.**

A live Crystal Clear Optometry deployment was previously observed at:

`https://crystal-clear-optometry.rvygq6dry9.chatgpt.site`

That deployment appears to be a ChatGPT-hosted (vinext/React) practice system. Only minified client bundles were inspectable from that URL. No editable TypeScript/React source tree, no SQL migrations, and no conventional backend project were available in this workspace.

### What this agent must not do until the correct source is attached

- Do **not** rebuild Crystal Clear inside the Rental PM repo as a greenfield app.
- Do **not** merge optometry clinical modules into `Rental Management/`.
- Do **not** invent a new database schema and claim it is production.
- Do **not** perform destructive migrations.
- Do **not** fabricate PBS, Medicare fee, Hoya coating, or optical thickness “facts”.

### Required owner action

Attach / open the **actual Crystal Clear Optometry source repository** (or export/import the ChatGPT site source into a Git repo) and re-run Phase 1 against that codebase.

Until then, this Master Context records:

1. Product requirements from the Master Handover.
2. What could be inferred from the live ChatGPT site + minified bundles.
3. Gap classification against the Master Brief.
4. Recommended next implementation batch **after** source access.

---

## 1. Project purpose

Crystal Clear Optometry is an Australian optometry clinical record + optical practice management system intended for eventual real-practice use.

It combines (target state):

- Patient management
- Clinical records / refraction / prescriptions
- Medication prescribing
- Referral / report generation
- Optical quotes & orders (multi-pair)
- Collection / fitting / aftercare / remake
- Medicare + HICAPS / health fund
- Inventory
- Appointments + public booking
- Recall / reminders
- Staff management
- Reports
- Lens demonstration (patient education)
- Public education / booking pages

**Customers must not access the internal clinical system.**

Work targets: desktop, tablet, mobile; concurrent multi-staff use.

---

## 2. Architecture discovered (from live site / bundles only)

> Confidence: **medium for UI surface**, **low for persistence/security**. Re-verify against real source.

### A. Framework / frontend

- ChatGPT Site / vinext RSC + React client
- Single practice SPA with route segments including `/login`, `/book`, `/lens-guide`
- Internal app modules loaded from minified `practice-app-*.js`
- UI styling: CSS variables (`--primary: #006a70`, Avenir Next stack), panel/card layout

### B. Backend

- No conventional Express/Next API project found in this workspace
- Client `fetch` calls present in bundles
- Auth path uses ChatGPT site sign-in (`/signin-with-chatgpt`)
- Persistence model for clinical data **unknown** without source (ChatGPT site storage vs external DB)

### C. Database

- **Not present** in the open Cursor repo
- No Supabase client strings observed in the inspected practice-app bundle
- `localStorage` not observed as primary clinical store in that bundle snippet search
- Treat any demo seed data as non-authoritative; may contain or eventually contain **real confidential patient information**

### D. Authentication

- Internal pages gated behind ChatGPT staff sign-in
- Public pages: `/book`, `/lens-guide`
- Staff security UI labels: clinic owner access vs staff read-only access
- Role model language observed: Owner / staff; Optometrist / Dispenser labels present in UI copy
- Exact authorization enforcement layer (server policies vs UI-only) **not verified**

### E. Hosting / deployment

- Live: `*.chatgpt.site` (ChatGPT hosting)
- This GitHub repo deploys **Rental PM** via GitHub Pages / Netlify config — unrelated to Crystal Clear

### F. Existing internal nav modules (from bundle)

| Route key | Label |
| --- | --- |
| `clinical` | Clinical record |
| `appointments` | Appointments |
| `lenses` | Lens demonstration |
| `quote` | Quote & order |
| `inventory` | Inventory |
| `billing` | Billing & MYOB |
| `settings` | Staff settings |

### G. Public routes observed

| Route | Purpose |
| --- | --- |
| `/login` | Staff sign-in shell |
| `/book` | Public appointment booking |
| `/lens-guide` | Public lens demonstration / education |

---

## 3. Existing modules (UI-level evidence)

### Implemented or substantially present in UI (verify in source)

- Clinical record shell with presenting complaint, history, medications, refraction, slit lamp, fundus, visual field attachments, BV/children fields (NFV/PFV/stereo), diagnostic drops (Tropicamide/Cyclopentolate)
- Copy previous history / copy previous refraction labels
- Prescription / medication / referral letter generation UI
- Appointments (“Make an appointment”, Arrived/Waiting status language)
- Quote & order with multi-pair / HICAPS shortcuts, customer note vs internal note language
- Inventory catalogue UI
- Billing & MYOB (mixed bulk/private billing register UI)
- Staff settings / Staff security (accounts & permissions + staff report)
- Lens demonstration: recommendation shortcuts, sun & coating comparison, single-vision design compare, HOYA multifocal corridor illustration, thickness calculator (educational estimate), task-specific lenses
- Public booking page + public lens guide

### Not confirmed / likely incomplete vs Master Brief

- Durable multi-tenant clinical DB with RLS
- Full Owner/Manager/Optometrist/Dispenser dual-role permission matrix enforced server-side
- Pair-level order lifecycle (independent ETA/collection/remake) as specified
- Collection/fitting/aftercare/remake workflows as separate non-clinical events
- Validated PBS drug data
- Live Outlook / MYOB / HICAPS / SMS integrations (UI mentions exist; success must not be faked)
- AR Coating Basic/Premium interactive demo (current coating UI is binary Anti-reflective toggle inside sun/tint scene)
- Duplicate patient matching / merge workflow
- Audit fields (`created_by` / `updated_by`) end-to-end

---

## 4. Requirement classification (Master Brief vs observed UI)

Legend:

- **IMPLEMENTED** — UI/feature clearly present; persistence/security still to verify in source
- **PARTIAL** — some UI exists; missing Master Brief rules or depth
- **MISSING** — not found in inspected UI/bundles
- **BROKEN** — cannot classify without source/runtime with staff credentials
- **NEEDS INTEGRATION** — requires external credentials/APIs
- **NEEDS OWNER DECISION** — product/policy choice required

| Area | Classification | Notes |
| --- | --- | --- |
| Auth gate for internal app | PARTIAL | ChatGPT sign-in present; clinic allow-list claimed; RLS/backend unknown |
| Public vs internal boundary | PARTIAL | Public book + lens-guide exist; depth of isolation unverified |
| Patient profile + auto Patient ID | PARTIAL | Patient UI exists; ID/matching/merge rules unverified |
| Duplicate prevention / merge | MISSING / UNVERIFIED | Not clearly present in inspected strings |
| Previous visit navigation (-1/-2/-3) | PARTIAL | “Five examination history”, copy previous refraction/history present |
| Clinical core exam | PARTIAL | Many fields present in UI |
| Refraction + prescribed Rx links | PARTIAL | Present; quote linkage labels exist |
| Slit lamp / fundus | PARTIAL | Structured OD/OS labels present |
| Visual field | PARTIAL | Attach file UI; automated import future |
| Children / BV | PARTIAL | NFV/PFV/stereo labels present |
| Diagnostic drops | PARTIAL | Tropicamide / Cyclopentolate present |
| Medication / PBS | PARTIAL | Medication UI; **do not invent PBS**; validated data needed |
| Referral letter | PARTIAL | Generate referral / PDF labels present |
| Staff dual roles + provider number rules | PARTIAL | Staff security UI; provider number mentioned; enforce rules in source |
| Appointments internal | PARTIAL | Make appointment UI; duration/status completeness unverified |
| Public booking | PARTIAL | Page exists; Outlook connection required messaging |
| SMS/Email reminders | PARTIAL / NEEDS INTEGRATION | One-click reminder UI language; do not fake success |
| Medicare mixed billing | PARTIAL | Item list + bulk/private UI; fees may be stale — maintainable source needed |
| HICAPS | PARTIAL | Shortcuts / gap fields in quote UI |
| Quote notes (customer vs internal) | PARTIAL | Labels distinguish notes — verify PDF exclusion |
| Multi-pair independent status | PARTIAL / MISSING | Multi-pair quote present; Master Brief pair lifecycle may be incomplete |
| Collection / fitting / feedback | MISSING / UNVERIFIED | Not clearly evidenced as full workflow |
| Remake preserving original pair | MISSING / UNVERIFIED | |
| Aftercare without new exam | MISSING / UNVERIFIED | |
| Order tracking dashboard | PARTIAL / MISSING | Some order workflow labels; overdue dashboard unverified |
| Inventory reporting | PARTIAL | Catalogue / stock language present |
| Lens demos (design/thickness/tint) | IMPLEMENTED (UI) | Educational disclaimers present for thickness |
| AR Basic/Premium interactive | PARTIAL / MISSING | Only binary Anti-reflective in sun scene |
| Outlook calendar | NEEDS INTEGRATION | Booking page states connection required |
| MYOB | NEEDS INTEGRATION | Connect MYOB Business CTA present |
| Real clinical persistence + audit | UNVERIFIED | **Priority 1 once source available** |

---

## 5. Important business rules (from Master Handover)

1. Real patient information remains confidential.
2. Customers cannot access the internal clinical system.
3. Optometrist requires Provider Number.
4. Dispenser does not require Provider Number.
5. Owner/Manager require Provider Number only when also Optometrist.
6. Collection does not automatically create a Clinical Examination.
7. Routine aftercare does not automatically create a Clinical Examination.
8. Each optical pair is independently trackable.
9. One pair arriving ≠ whole order arrived.
10. One pair collected ≠ whole order collected.
11. Remake must preserve the original Pair.
12. Historical clinical/order records must not be silently overwritten.
13. Every Order needs an Order Date.
14. Estimated Arrival, Actual Arrival and Collection are separate events.
15. Staff historical attribution must survive staff deactivation.
16. AR visualisation is educational unless validated product data is provided.
17. Lens thickness numbers must not be fabricated.
18. Internal Staff Notes must never appear on customer-facing PDFs.
19. Online booking should minimise duplicate patient profiles.
20. Do not fake external integration success.

---

## 6. Staff permissions (target)

**System roles:** Owner / Manager / Staff  
**Clinical/job roles:** Optometrist / Dispenser  

Combinations required (Owner+Optometrist, Manager+Dispenser, etc.).  
Enforce at application/backend/database level — not only by hiding buttons.

---

## 7. Clinical safety rules

- Preserve timestamps and staff identity on clinical/order events.
- Prefer inactive staff over destructive deletes.
- Do not overwrite previous exams when copying prior data.
- Escalation from aftercare to clinical exam must be explicit.
- No unsupported medical claims in patient education demos.

---

## 8. Integrations

| Integration | Observed UI | Status |
| --- | --- | --- |
| ChatGPT staff auth | Sign in securely | Live on chatgpt.site |
| Outlook Calendar | Public booking dependency message | Unconnected until admin authorises |
| MYOB Business | Connect CTA / sync captions | Unconnected until admin authorises |
| HICAPS | Codes in quote/order UI | Code list maintainability TBD; payment rail TBD |
| Medicare | Item list + mixed billing | Fee maintenance TBD; claiming rail TBD |
| SMS/Email clinic comms | Reminder UI language | Do not mark success without send |

---

## 9. Known limitations (current agent session)

1. **Wrong Git repository attached** — cannot edit Crystal Clear source.
2. No staff credentials to exercise authenticated clinical workflows end-to-end.
3. Persistence, RLS, and auditability unverified.
4. Minified bundle analysis can miss features or misclassify completeness.
5. This file lives temporarily under `Crystal Clear Optometry/` inside the Rental-pm repo as a handover placeholder only.

---

## 10. Change process for future work

1. Read this Master Context.
2. Inspect the **real** Crystal Clear source for the relevant module.
3. Make the smallest safe change.
4. Test (UI, persistence, permissions, mobile/tablet where relevant).
5. Update `CRYSTAL_CLEAR_CHANGELOG.md`.
6. Update this Master Context only when architecture/requirements/implementation state materially changes.
7. Newest explicit owner instruction overrides this document — then update this file.

---

## 11. Next gate

**Wait for owner approval / source access before any large implementation batch.**

Recommended immediate owner actions:

1. Connect the Crystal Clear Optometry Git repository to Cursor (or provide export of the ChatGPT site source).
2. Confirm whether ChatGPT hosting remains the deployment target or a self-hosted stack is required.
3. Confirm whether any **real patient data** already exists in the live site storage.
4. Approve Priority 1 audit against the real source (auth, permissions, persistence, patient duplicate prevention).
