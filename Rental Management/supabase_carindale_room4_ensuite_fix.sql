-- Carindale Room 4 is NOT ensuite; Carindale Room 3 IS ensuite.
-- DO NOT RUN IN PRODUCTION without owner approval.
-- McGregor rooms must remain unchanged.
--
-- This file is kept for backward links. Prefer the full canonical script:
--   supabase_carindale_ensuite_rooms_fix.sql
-- which also sets Carindale Room 3 = ensuite.

-- Preview first:
select r.id, p.name as property, r.room_no, r.ensuite, r.notes
from rooms r
join properties p on p.id = r.property_id
where r.room_no in (3, 4)
order by p.name, r.room_no, r.id;

-- Carindale Room 3 → ensuite
update rooms r
set ensuite = true
from properties p
where r.property_id = p.id
  and r.room_no = 3
  and p.name ilike '%carindale%'
  and coalesce(r.ensuite, false) = false;

-- Carindale Room 4 → NOT ensuite
update rooms r
set ensuite = false
from properties p
where r.property_id = p.id
  and r.room_no = 4
  and (
    p.name ilike '%carindale%'
  )
  and coalesce(r.ensuite, false) = true;

-- Verify:
select r.id, p.name as property, r.room_no, r.ensuite
from rooms r
join properties p on p.id = r.property_id
where r.room_no in (3, 4)
order by p.name, r.room_no, r.id;
