# Crystal Clear Optometry — Current State

**Date:** 2026-09-09  
**Audit type:** Phase 1 repository + live-site discovery  
**Coding status:** No Crystal Clear application changes made

---

## Blocker (must resolve first)

This Cursor agent is open on **`Clararentalpm/Rental-pm`** (Rental Management), not Crystal Clear Optometry source.

Without the real Crystal Clear codebase:

- requirements cannot be verified against implementation safely
- persistence / RLS / permissions cannot be audited
- incremental fixes cannot be applied to the live practice system

**Needed from owner:** attach or provide the Crystal Clear Optometry source repository (or ChatGPT site export), then approve Priority 1 work against that code.

---

## 1. What already works (from live UI / bundles)

Public:

- Staff login shell (ChatGPT sign-in)
- Public appointment booking page
- Public lens guide / education page

Internal module shells present:

- Clinical record (broad exam UI)
- Appointments
- Lens demonstration (multiple demos)
- Quote & order
- Inventory
- Billing & MYOB UI
- Staff settings / security UI

Lens demonstration already includes:

- Recommendation shortcuts
- Sun & coating comparison (tint / polarised / anti-reflective / UV)
- Single vision design comparison
- Multifocal corridor illustration
- Thickness educational calculator
- Task-specific lens cards

---

## 2. What is partially implemented

- Patient workflows (UI present; ID generation / duplicate matching / merge unverified)
- Previous-visit copy tools (labels present; full -1/-2/-3 navigation + side-by-side Rx progression unverified)
- Clinical sections (many fields; persistence & overwrite safety unverified)
- Medication / referral / Medicare / HICAPS (UI present; validated data + real claiming rails incomplete)
- Staff roles / provider number (UI present; dual-role rules + server enforcement unverified)
- Quote multi-pair + notes (UI present; pair-level lifecycle rules likely incomplete)
- Public booking (page present; Outlook connection required)
- Integrations (Outlook / MYOB / SMS) — UI affordances without proven live connection

---

## 3. What is missing (vs Master Brief)

- Confirmed durable clinical database architecture in an owned repo
- Proven role-based authorization at backend/DB level
- Full pair-level order tracking dashboard (overdue / partially collected rules)
- Collection / fitting / feedback as non-clinical dispensing events
- Complaint / remake workflow that preserves original pair
- Aftercare notes + follow-up queue without auto-creating exams
- Interactive **AR Coating** demo with No AR / Basic / Premium, compare mode, drag compare, lighting
- Validated PBS medication dataset
- Patient merge/reconciliation workflow (if not already in source)

---

## 4. What appears broken

- **Cannot classify runtime breakage** without staff login to the live site and without source.
- Historical owner reports from other products (Rental PM) are **not** Crystal Clear defects.

---

## 5. What is unsafe or temporary

- Unknown whether clinical data is stored in ChatGPT site storage vs a practice-owned database
- Unknown whether permissions are UI-only
- Medicare fee tables in UI may become stale if hard-coded
- Any demo/seed patient data must be treated as potentially confidential
- This documentation currently sits inside the **wrong GitHub repo** (Rental-pm) as a temporary handover package

---

## 6. What requires external credentials / integration

- Outlook Calendar (public booking availability)
- MYOB Business
- HICAPS payment/claim rail (beyond local code lists)
- Medicare claiming rail
- Clinic SMS/email provider
- Staff auth allow-list administration on ChatGPT hosting (if that remains the host)

---

## 7. What should be implemented next

### Immediate (owner)

1. Connect Crystal Clear **source repo** to Cursor (or export source from ChatGPT site into Git).
2. Confirm hosting target (remain on ChatGPT site vs migrate).
3. Confirm whether live storage already holds real patient data.

### After source access — Priority 1 batch (recommend approve first)

1. Re-run full Phase 1 audit on real source (stack, DB, auth, RLS, routes, tests).
2. Verify internal/public security boundary.
3. Verify patient create/match/ID generation and no silent duplicates.
4. Verify clinical save/refresh/re-login persistence + audit fields.
5. Verify staff role matrix + Provider Number save rules.
6. Produce an updated Master Context from **source truth**, then propose Priority 2/3 batches.

### Do not start yet

- Large rewrite of Lens Demonstration
- AR Coating feature build in this Rental-pm repo
- New parallel databases (`Patient2`, `OrdersNew`, etc.)
- Fake Outlook/MYOB/SMS “success” paths

---

## Decision requested

Please reply with:

1. Where the Crystal Clear source lives (GitHub URL / export), and  
2. Approval to begin Priority 1 audit+fixes **on that source** after it is attached.
