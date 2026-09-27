# Safe iPad manual preview — PR #28 Carindale ensuite

## Critical safety facts

| Question | Answer |
|---|---|
| Connects to production Supabase? | **NO** |
| Production Auth / REST / Edge / SQL? | **NO** |
| Data source | In-browser **TEST DATA** only |
| What does Save do? | Updates **test data in this browser only** |
| Soft-reconcile production writes? | **Disabled** (memory-only on test rows) |
| PR #28 status | Remains **Draft** — not merged, not deployed to production site |

**Do not use** `https://clararentalpm.github.io/Rental-pm/` or `https://rental-pm-v2.netlify.app/` for this PR check — those are production UI hosts and talk to production Supabase. Opening PR #28’s normal `index.html` while signed in as an editor can PATCH Carindale room flags via soft-reconcile.

## Preview URL

### Primary (HTTPS, Safari / iPad) — verified

**URL:** https://classy-crostata-ecb4d6.netlify.app/

**Password when asked:** `My-Drop-Site`

This is a **separate Netlify Drop test site** (not `rental-pm-v2.netlify.app`, not GitHub Pages production).

- Connects to production Supabase? **NO** (test data only; orange banner)
- **Availability:** about **1 hour** from publish unless you **Claim this site** with a free Netlify account (claiming keeps it online and still separate from production)
- Open soon, or claim it if you need it longer

### Durable offline alternative (no host expiry)

1. On iPad Safari open: https://github.com/Clararentalpm/Rental-pm/releases/tag/safe-preview-pr28
2. Download **`rental-pm-pr28-safe-manual-preview.html`**
3. In **Files**, tap the file → Share → **Open in Safari** (or Open With → Safari)
4. You should see the orange **SAFE MANUAL PREVIEW / TEST DATA** banner

Same test-data app; works offline; does not talk to production Supabase.

### Do not use

- `https://clararentalpm.github.io/Rental-pm/`
- `https://rental-pm-v2.netlify.app/`
- Old tunnel `https://slots-roger-scripting-growing.trycloudflare.com/` (dead)



## How to check (iPad)

Open the safe preview URL. You should see an orange banner: **Does NOT connect to production Supabase.**

### 1. Carindale Room 3 — Ensuite badge + Bathroom

1. Top tabs: select **Carindale**
2. Left nav: **Room Profiles**
3. Find **Room 3**
4. Confirm amber **Ensuite** badge
5. Confirm **Bathroom** field shows **Ensuite** (fixture intentionally stores wrong `Shared` / `ensuite:false` — UI must still show Ensuite)

### 2. Carindale Room 4 — not Ensuite

1. Same Room Profiles page
2. Find **Room 4**
3. Confirm **no** Ensuite badge
4. Confirm **Bathroom** does **not** say Ensuite (shows **Shared**; fixture intentionally stores wrong `Ensuite`)

### 3. Edit + reload still correct

1. On Room 3 → **Edit profile**
2. Confirm checkbox/bathroom fields match Ensuite
3. Close (or Save — saves **test data only**)
4. Safari refresh
5. Repeat for Room 4 (must stay non-Ensuite)

### 4. Labels on Availability / Calendar / Room Status / Book inspection / Find Room

Use Carindale tab. Check room labels:

- Room 3 should include **Ensuite** in picker-style labels where used
- Room 4 must **not**

Where to look in this app:

- **Room Status** → left nav **Overview** (section “Room status”)
- **Calendar** → **Availability** → **Calendar View**
- **Find Room** → **Availability** → **Vacancy View** → **Find a room**
- **Book Room Inspection** → **Inspections** → **+ Book inspection**

Test bookings included:

- Carindale Room 3 current guest
- Carindale Room 5 upcoming
- Scheduled inspection on Carindale Room 4

These are **sample** bookings, not your live production rows.

### 5. McGregor unchanged

1. Switch property tab to **McGregor**
2. Room Profiles: McGregor Room 4 may show Ensuite from **stored** flag (Carindale rules must not rewrite McGregor)
3. Availability / Calendar / Tenants: multi-room test booking for **Preview Guest McGregor Multi** spans Room 2 → Room 5 via `BOOKING_GROUP`

## What this preview cannot verify

- Live production tenancies, payments, bonds, or real multi-room history
- Production SQL migration `supabase_carindale_ensuite_rooms_fix.sql` (not run; do not run without explicit approval)
- Netlify / GitHub Pages production deploy of PR #28 (intentionally not done)

Automated `carindale-ensuite-regression-test.js` (9/9) is **not** a substitute for this manual check.
