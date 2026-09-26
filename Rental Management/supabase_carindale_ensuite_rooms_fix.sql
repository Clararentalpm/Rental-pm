-- =============================================================================
-- Carindale ensuite configuration (canonical)
--   Room 3 = ENSUITE
--   Room 4 = NOT ENSUITE
-- McGregor rooms must remain unchanged.
-- Room-config only — does NOT touch tenancies, payments, bonds, or bookings.
-- DO NOT RUN IN PRODUCTION without owner approval.
-- Prefer applying via app reconcile (reconcileCarindaleEnsuiteFlags) after deploy,
-- or run this SQL manually in Supabase SQL Editor.
-- =============================================================================

-- Preview current Carindale / McGregor rooms 3 and 4:
select r.id, p.name as property, r.room_no, r.ensuite, r.notes
from rooms r
join properties p on p.id = r.property_id
where r.room_no in (3, 4)
order by p.name, r.room_no, r.id;

-- 1) Carindale Room 3 → ensuite = true
update rooms r
set ensuite = true
from properties p
where r.property_id = p.id
  and r.room_no = 3
  and p.name ilike '%carindale%'
  and coalesce(r.ensuite, false) = false;

-- 2) Carindale Room 4 → ensuite = false
update rooms r
set ensuite = false
from properties p
where r.property_id = p.id
  and r.room_no = 4
  and p.name ilike '%carindale%'
  and coalesce(r.ensuite, false) = true;

-- Optional: align room_profiles.bathroom_type labels for Carindale R3/R4 only
update room_profiles rp
set bathroom_type = 'Ensuite'
from rooms r
join properties p on p.id = r.property_id
where rp.room_id = r.id
  and r.room_no = 3
  and p.name ilike '%carindale%'
  and coalesce(rp.bathroom_type, '') !~* 'ensuite';

update room_profiles rp
set bathroom_type = 'Shared'
from rooms r
join properties p on p.id = r.property_id
where rp.room_id = r.id
  and r.room_no = 4
  and p.name ilike '%carindale%'
  and coalesce(rp.bathroom_type, '') ~* '^ensuite$';

-- Verify (Carindale R3 true, R4 false; McGregor unchanged):
select r.id, p.name as property, r.room_no, r.ensuite
from rooms r
join properties p on p.id = r.property_id
where r.room_no in (3, 4)
order by p.name, r.room_no, r.id;
