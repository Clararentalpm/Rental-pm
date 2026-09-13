-- Carindale Room 4 is NOT ensuite.
-- DO NOT RUN IN PRODUCTION without owner approval.
-- McGregor Room 4 must remain unchanged.

-- Preview first:
select r.id, p.name as property, r.room_no, r.ensuite, r.notes
from rooms r
join properties p on p.id = r.property_id
where r.room_no = 4
order by p.name, r.id;

-- Corrective update (Carindale / Carindale name variants only):
update rooms r
set ensuite = false
from properties p
where r.property_id = p.id
  and r.room_no = 4
  and (
    p.name ilike '%carindale%'
    or p.name ilike '%carindale%'
  )
  and coalesce(r.ensuite, false) = true;

-- Verify:
select r.id, p.name as property, r.room_no, r.ensuite
from rooms r
join properties p on p.id = r.property_id
where r.room_no = 4
order by p.name, r.id;
