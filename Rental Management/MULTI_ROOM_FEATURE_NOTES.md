# Multi-room Inspection + Split/Multi-room Stay (v1)

## Approach

v1 encodes multi-room inspections and multi-segment stays **without schema changes**.

### A) Multi-room inspections

- DB column `room_id` remains the **primary** room (first selected; FK-compatible).
- Additional rooms are stored in notes as `ROOM_IDS:12,15,18` (sorted, unique; always includes primary).
- UI uses a checkbox multi-select + chip display; a hidden `room_id` stays synced to the first selected id.
- List / calendar show **one** row/event with rooms joined (e.g. `Room 2, Room 5, Sofa`).
- Reminder SMS: `Room inspection: {Property} Room 2, Room 5 & Sofa — {date} at {time}.`
- Availability checks **each** selected room against intended stay dates and names exact conflicting room(s).

### B) Multi-segment / multi-room stays

- **One** `tenants` row.
- Multiple `tenancies` rows share the same `tenant_id`.
- Linked via notes markers:
  - `BOOKING_GROUP:<uuid>`
  - `SEGMENT_INDEX:n`
  - `SEGMENT_COUNT:n` (optional but written on create)
- Each segment has its own `room_id`, check-in/out, rent amount/period — existing per-tenancy occupancy already blocks conflicts.
- New stay form supports “+ Add another room / date period” segment cards.
- On save: insert tenant once, then each segment tenancy with the shared `BOOKING_GROUP`.
- Payments: booking-group total = sum of segment `expectedStayTotalSolo`; schedule/actions show **one** primary row for the group.
- Tenants page: one tenant row with journey summary (`13 Sep → 20 Sep · Room 2 → Room 5`) and muted segment history.
- Cancel one future segment by cancelling that tenancy id only — siblings stay intact.
- Existing delete/cancel payment safety rules are unchanged.

Single-room inspections and single-room stays (no markers) keep working exactly as before.

## Why no migration is required for v1

- No new tables or columns.
- Existing `room_id` FK on `room_viewings` and `tenancies` stays valid.
- Markers live in free-text `notes` already used for rent overrides, cancel markers, etc.
- Production rows are **not** auto-migrated; legacy single-room rows simply omit markers and fall back to `room_id` / solo tenancy behaviour.
- Occupancy remains half-open: `check_in <= date < check_out`.

## Recommended future schema (do **not** run)

If/when you want normalized tables later:

```sql
-- Parent booking for multi-segment stays
create table bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id bigint not null references tenants(id),
  property_id bigint references properties(id),
  notes text,
  created_at timestamptz default now()
);

alter table tenancies
  add column booking_id uuid references bookings(id),
  add column segment_index int;

-- Multi-room inspections junction
create table viewing_rooms (
  viewing_id bigint not null references room_viewings(id) on delete cascade,
  room_id bigint not null references rooms(id),
  primary key (viewing_id, room_id)
);
-- Keep room_viewings.room_id as primary for backward compatibility during cutover.
```

Migration would then backfill `BOOKING_GROUP` / `ROOM_IDS` markers into these tables — **out of scope for v1**.

## Regression coverage

`multi-room-stay-regression-test.js` covers markers, viewing labels/reminders, availability naming, booking segments/journey/obligation, primary schedule row, half-open occupancy, cancel-one-segment, and payment double-count guards (A–Q).
