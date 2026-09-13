# Room Status duplicate / legacy occupancy report

## Do not auto-delete or rewrite production stay rows
This report is diagnostic only. Owner approval is required before any historical cleanup.

## Root cause (shared logic — fixed in this PR)

Room Status previously treated too many stays as "current":

1. **`tenancyKind` ignored `confirmed_until`** when `check_out` was null, so ended short stays could remain "current".
2. **`stayActiveOn` did not exclude cancelled / no-show** bookings.
3. **Payment-group member lookup included cancelled stays** with the same room + check-in.
4. **Sofa / Extra room** with `room_no = 6` could render as **Room 6** when notes/profile markers were missing.

Room Status cards now derive occupants only via:

- `isCurrentOccupancyStay` / `currentOccupantsForRoom`
- `isUpcomingOccupancyStay` / `nextBookingForRoom`

Rules:

- same property + room
- not cancelled / no-show / deleted / superseded
- `check_in <= today`
- checkout (or `confirmed_until`) is null **or** `> today` (half-open)
- past / future stays are excluded from Current
- Next = earliest future valid booking only

## Recommended read-only production queries

### A. Multiple non-cancelled stays that look "current" for the same room
```sql
select r.room_no, p.name as property, t.id as tenancy_id, tn.name as tenant,
       t.status, t.check_in, t.check_out, t.confirmed_until
from tenancies t
join rooms r on r.id = t.room_id
join properties p on p.id = r.property_id
join tenants tn on tn.id = t.tenant_id
where coalesce(lower(t.status),'') not in ('cancelled','canceled','no_show','noshow','historical','ended','inactive','completed')
  and t.check_in <= current_date
  and (t.check_out is null or t.check_out > current_date)
  and (t.confirmed_until is null or t.check_out is not null or t.confirmed_until > current_date)
order by p.name, r.room_no, t.check_in, t.id;
```

### B. Same tenant appearing many times as current in one room (Laura / Black Gun style)
```sql
select p.name, r.room_no, tn.name, count(*) as active_rows, array_agg(t.id order by t.id) as tenancy_ids
from tenancies t
join rooms r on r.id = t.room_id
join properties p on p.id = r.property_id
join tenants tn on tn.id = t.tenant_id
where coalesce(lower(t.status),'') not in ('cancelled','canceled','no_show','noshow','historical','ended','inactive','completed')
  and t.check_in <= current_date
  and (t.check_out is null or t.check_out > current_date)
group by 1,2,3
having count(*) > 1
order by count(*) desc;
```

### C. McGregor rooms labeled by room_no (catch Room 6 vs Sofa)
```sql
select r.id, r.room_no, r.notes, rp.room_type, r.ensuite
from rooms r
join properties p on p.id = r.property_id
left join room_profiles rp on rp.room_id = r.id
where p.name ilike '%mcgregor%'
order by r.room_no;
```

Review results with the owner before any merge, delete, or status correction.
