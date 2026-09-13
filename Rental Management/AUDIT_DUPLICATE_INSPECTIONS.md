# Duplicate inspection report (do not auto-delete production rows)

## Prevention shipped
- Save button disables after first click (`data-busy`)
- Exact duplicate create blocked when same visitor + room + date + time already exists

## Recommended production query (read-only)
```sql
select visitor_name, room_id, inspection_date, inspection_time, count(*) as n, array_agg(id order by id) as ids
from room_viewings
group by 1,2,3,4
having count(*) > 1
order by n desc, inspection_date desc;
```

Review duplicates with the owner before any cleanup. Prefer keeping the earliest id and retiring later accidental clones only after confirmation.
