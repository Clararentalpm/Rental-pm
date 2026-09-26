-- =============================================================================
-- Carindale ensuite ROLLBACK (room-config only)
-- Reverses supabase_carindale_ensuite_rooms_fix.sql IF you need to undo it.
-- Does NOT touch tenancies, payments, bonds, or bookings.
-- DO NOT RUN unless you intentionally want prior stored flags restored.
-- =============================================================================
-- Canonical forward state was:
--   Carindale Room 3 = ensuite true / bathroom_type Ensuite
--   Carindale Room 4 = ensuite false / bathroom_type Shared (when was Ensuite)
-- This rollback sets:
--   Carindale Room 3 = ensuite false / bathroom_type Shared (if was Ensuite)
--   Carindale Room 4 = ensuite true / bathroom_type Ensuite
-- McGregor is never touched.
-- =============================================================================

-- Preview first:
select r.id, p.name as property, r.room_no, r.ensuite, rp.bathroom_type
from rooms r
join properties p on p.id = r.property_id
left join room_profiles rp on rp.room_id = r.id
where r.room_no in (3, 4)
order by p.name, r.room_no, r.id;

-- Carindale Room 3 → undo ensuite
update rooms r
set ensuite = false
from properties p
where r.property_id = p.id
  and r.room_no = 3
  and p.name ilike '%carindale%'
  and coalesce(r.ensuite, false) = true;

update room_profiles rp
set bathroom_type = 'Shared'
from rooms r
join properties p on p.id = r.property_id
where rp.room_id = r.id
  and r.room_no = 3
  and p.name ilike '%carindale%'
  and coalesce(rp.bathroom_type, '') ~* 'ensuite';

-- Carindale Room 4 → restore ensuite (pre-correction state)
update rooms r
set ensuite = true
from properties p
where r.property_id = p.id
  and r.room_no = 4
  and p.name ilike '%carindale%'
  and coalesce(r.ensuite, false) = false;

update room_profiles rp
set bathroom_type = 'Ensuite'
from rooms r
join properties p on p.id = r.property_id
where rp.room_id = r.id
  and r.room_no = 4
  and p.name ilike '%carindale%'
  and coalesce(rp.bathroom_type, '') !~* 'ensuite';

-- Verify:
select r.id, p.name as property, r.room_no, r.ensuite, rp.bathroom_type
from rooms r
join properties p on p.id = r.property_id
left join room_profiles rp on rp.room_id = r.id
where r.room_no in (3, 4)
order by p.name, r.room_no, r.id;
