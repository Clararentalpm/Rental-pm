# Rental PM — Master Requirements

**Status:** Authoritative product brief  
**Working folder:** `Rental Management/`  
**Baseline:** V6.5.2  
**Last saved:** 2026-09-08  

This document is the master requirements for Rental PM. Future work must follow it. Do not rebuild from scratch. Do not start a new phase until the owner approves the previous phase report.

---

## Development instruction

Treat the current Rental PM V6.5.2 as an existing product, not a prototype to throw away.

Work incrementally.

### Priority order

1. **Phase 1 — Stabilise V6.5.2**  
   Fix confirmed bugs, broken references, Supabase inconsistencies, loading/deployment problems and test existing functions.
2. **Phase 2 — Data integrity**  
   Improve Tenant → Stay → Room → Payment → Bond relationships and duplicate prevention without losing existing data.
3. **Phase 3 — Rental workflow**  
   Improve Add Tenant/Add Stay, room conflict detection, check-in/out and payment workflows.
4. **Phase 4 — Calendar**  
   Make the occupancy/availability calendar genuinely useful for day-to-day management.
5. **Phase 5 — Multi-user management**  
   Strengthen Owner / Manager / Viewer permissions and shared management.
6. **Phase 6 — UX**  
   Improve iPad/mobile usability and dashboard clarity.

**Gate rule:** Complete one phase → test → report results → wait for owner approval → only then start the next phase.

Before making a major structural/database change, explain what you intend to change and why. For ordinary bug fixes and small improvements, proceed and test them.

Do not rebuild Rental PM from scratch.  
Do not remove working V6.5.2 functionality.  
Do not fabricate data.  
Do not destroy historical rental/payment records.

---

## 1. What this system should be

Rental PM is a private rental/property management system.

The owner manages a house with multiple separately rented rooms. Some tenants are long-term; others may stay for only a few days or weeks.

One simple system should immediately show:

- Who is living in each room
- Which rooms are occupied/vacant
- Move-in/check-in date and time
- Expected move-out/check-out date and time
- Long-term vs short-term stays
- Weekly or daily rent
- Bond/deposit
- Rent/payment history
- Amount paid
- Amount outstanding/overdue
- Upcoming payments
- Upcoming check-ins/check-outs
- Room availability
- Rental history
- Notes about each tenant/stay

The system should reduce the amount of rental information that must be remembered manually.

---

## 2. Dashboard

The Dashboard should give a quick overview without opening every tenant.

Show clearly:

**Room status**

- Occupied
- Vacant
- Upcoming tenant
- Short stay
- Long-term stay

**Important upcoming events**

- Check-ins
- Check-outs
- Rent due
- Overdue rent
- Bond/payment issues

Clicking a room or tenant from the dashboard should open the relevant record. Keep the interface simple and practical.

---

## 3. Rooms

The property currently has multiple rooms, including Room 1–Room 5.

**McGregor layout (owner-confirmed):** five rooms (Room 1–5) plus a sixth profile **Sofa** (living-area / Extra room guest, typically $25/day). Sofa is a bookable unit in Room Profiles, stay dropdowns, dashboard, and calendar — labelled **Sofa**, not “Room 6”.

Each room needs its own profile/history:

- Current tenant
- Previous tenants
- Rental price
- Daily/weekly rent type
- Start date
- End date if applicable
- Bond arrangement
- Payment cycle
- Occupancy status
- Notes
- Rental history

When one tenant leaves and another arrives, **do not destroy** the previous rental record. The room must maintain historical occupancy.

---

## 4. Tenants

Each tenant needs a reusable tenant profile.

Do **not** create unnecessary duplicate tenant profiles every time the same person books another stay.

Tenant information should support:

- Name
- Contact details
- Room
- Stay type
- Check-in date/time
- Check-out date/time
- Rent
- Rent cycle
- Bond/deposit
- Payment status
- Notes
- Previous stays
- Current stay

Tenant Search must work as a live search/filter.

If the same tenant returns later, prefer reusing the existing tenant and creating a **new stay**.

---

## 5. Stays / rental periods

Separate:

- **Tenant** = the person
- **Stay** = that person’s particular rental period

A stay should contain:

- Room
- Tenant
- Start date
- Check-in time
- End date/check-out date if known
- Check-out time
- Daily/weekly rental amount
- Long-term/short-term status
- Payment arrangement
- Bond
- Notes

Long-term tenants may have no known end date.  
Short-term tenants must have clear date ranges.

---

## 6. Calendar

Calendar is a very important part of Rental PM.

It must make it easy to understand:

- Which room is occupied
- Who is staying there
- Arrival date/time
- Departure date/time
- Available dates
- Upcoming bookings
- Long-term occupancy
- Short-term occupancy

Different rooms/stays should be visually easy to distinguish.  
Clicking a calendar stay should open the relevant tenant/stay information.  
The calendar should help decide whether another tenant can be accepted.  
It must work well on iPad as well as desktop/mobile.

---

## 7. Adding a new tenant / booking

Easy workflow:

Add Tenant / Add Stay → Search existing tenant first → select existing person **or** create new tenant → select room → enter dates → rent → bond → payment arrangement → notes → save.

Before saving, check for:

- Duplicate tenant
- Room/date conflicts
- Overlapping stays

Warn if two tenants would occupy the same room for overlapping dates.  
Do not silently overwrite another booking.

---

## 8. Payments

Payment management should support:

- Weekly rent
- Daily rent
- Amount due
- Amount paid
- Payment date
- Next due date
- Overdue amount
- Payment history
- Bond/deposit
- Bond refund
- Partial payments if needed
- Notes

Payment records belong to the correct tenant/stay.  
Do not delete rental history when a tenant leaves.

### Short-stay / one-off payment rules (owner-confirmed 2026-09-08)

1. Short stay, day/night/total rent, or a stay of about **4 weeks or less** with a confirmed end (`check_out` / `confirmed_until`) is usually **paid once** for the whole stay — do **not** invent the next weekly cycle after it is paid in full.
2. If they pay in **instalments**, keep a balance due; status is **awaiting payment**, **unpaid**, or **overdue** until the stay total is covered.
3. Payments page shows a **Payment actions / reminders** list for those statuses so staff can follow up and record the next instalment.

### Shared payment group rules (owner-confirmed 2026-09-08)

1. Same room + same check-in date = one payment group (joint booking).
2. Any paid rent payment for any group member covers the whole group.
3. Co-occupants must not show overdue when the group period is already paid (e.g. 辣豆 + Vicky).
4. If one person renews and another does not: after the departing person’s check-out they leave the active group; remaining occupants continue alone.
5. Rent-due amount display: show the group total once (do not double-count).

---

## 9. Bond / deposit

Track:

- Bond required
- Bond received
- Date received
- Amount
- Refund amount
- Refund date
- Deductions if applicable
- Notes/status

Keep bond events/history rather than only showing the latest value.

---

## 10. Multiple managers / sub-accounts

Main administrator/owner retains full control.

Authorised sub-account users/managers should see:

- Who is currently staying
- Which rooms are occupied
- Upcoming check-ins/check-outs
- Relevant calendar information

Roles:

- **Owner/Admin** — full access
- **Manager** — operational rental management access (including record/delete rent payments)
- **Viewer** — read-only where appropriate

Do not give every account unrestricted destructive permissions. Bond history delete remains owner-only unless the owner later approves otherwise.

---

## 11. History / auditability

Maintain:

- Tenant history
- Stay history
- Room occupancy history
- Payment history
- Bond history
- Relevant activity/history

Do not solve problems by deleting historical records.

---

## 12. Example data / business context

Previous development examples (context only — **not** permanent production seed data):

- Room 1 — long-term tenant, approximately $200/week
- Room 3 — Juny, long-term, approximately $210/week, originally recorded from 24 April
- Room 4 — long-term male tenant, approximately $270/week, originally recorded from 14 July
- Room 5 — Laura, short stay, approximately $35/day, check-in previously recorded as 11 September at 11:00, with an initial stay through at least 16 September

The database is the source of truth. Do not hard-code production tenant data into the application.

---

## 13. Supabase / data

Preserve and properly structure the existing Supabase integration.

Important:

- Database is the source of truth
- Do not hard-code production tenant data
- Authentication must be secure
- Respect user roles
- Do not expose secrets in frontend code
- Do not commit service-role/admin secrets
- Check database relationships before changing table structures
- Preserve existing data during migrations

If schema changes are needed, plan the migration before changing production data.

---

## 14. Deployment

Previous deployment problems included:

- 404 Not Found
- Page stuck on Loading
- Vercel/deployment configuration issues

Do not randomly change routing/build/deployment configuration.  
Before changing deployment settings, understand why the current configuration exists.  
The final deployed application should open reliably from its normal URL and not remain indefinitely on Loading.

Canonical host referenced in app: `https://rental-pm-v2.netlify.app/`  
Repo-root `netlify.toml` publishes the `Rental Management` folder.

---

## 15. Known V6.5.2 issues (Phase 1 targets)

Confirmed defects to fix carefully:

- `property()` vs `propertyBy()` issue on Income
- Payment table naming inconsistency
- Tenant Search live-filter issue
- `bondPaymentEvents` vs `bondEvents` inconsistency

Also inspect for similar:

- Broken function references
- Wrong variable names
- Wrong Supabase table names
- Undefined state properties
- Broken buttons
- Incorrect filters
- Loading-state problems

Do not change business behaviour merely because another implementation is preferred.

---

## 16. UI / device requirements

Must work properly on:

- iPad/tablet
- Desktop
- Mobile

Important actions should not require hover.  
Buttons and forms should be touch friendly.  
Calendar and tables should remain usable on smaller screens.  
Keep the UI clean, straightforward and fast.

---

## Phase gate checklist

| Phase | Focus | Owner approval required before next? |
| --- | --- | --- |
| 1 | Stabilise V6.5.2 bugs / deploy basics | **Yes** |
| 2 | Data integrity / tenant reuse | Yes |
| 3 | Rental workflow / conflicts | Yes |
| 4 | Calendar usefulness | Yes |
| 5 | Multi-user permissions | Yes |
| 6 | UX polish | Yes |
