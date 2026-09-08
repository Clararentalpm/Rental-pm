-- Room viewings / 看房 inspections
-- Run in Supabase → SQL Editor (owner), then in Rental PM click left-bottom Refresh.
-- Safe to re-run.

-- 1) Create table if brand new
create table if not exists public.room_viewings (
  id bigserial primary key,
  property_id bigint references public.properties(id) on delete set null,
  room_id bigint references public.rooms(id) on delete set null,
  visitor_name text not null,
  contact_method text,
  people_count integer default 1,
  needs_extra_bed boolean default false,
  inspection_date date,
  inspection_time time,
  intended_check_in date,
  intended_check_out date,
  intended_tenancy_type text,
  intended_nights integer,
  deposit_paid boolean default false,
  deposit_amount numeric,
  deposit_currency text default 'AUD',
  notes text,
  status text default 'scheduled',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid
);

-- 2) If you already created a short table (only id/property/room/visitor), add missing columns
alter table public.room_viewings add column if not exists contact_method text;
alter table public.room_viewings add column if not exists people_count integer default 1;
alter table public.room_viewings add column if not exists needs_extra_bed boolean default false;
alter table public.room_viewings add column if not exists inspection_date date;
alter table public.room_viewings add column if not exists inspection_time time;
alter table public.room_viewings add column if not exists intended_check_in date;
alter table public.room_viewings add column if not exists intended_check_out date;
alter table public.room_viewings add column if not exists intended_tenancy_type text;
alter table public.room_viewings add column if not exists intended_nights integer;
alter table public.room_viewings add column if not exists deposit_paid boolean default false;
alter table public.room_viewings add column if not exists deposit_amount numeric;
alter table public.room_viewings add column if not exists deposit_currency text default 'AUD';
alter table public.room_viewings add column if not exists notes text;
alter table public.room_viewings add column if not exists status text default 'scheduled';
alter table public.room_viewings add column if not exists created_at timestamptz default now();
alter table public.room_viewings add column if not exists updated_at timestamptz default now();
alter table public.room_viewings add column if not exists created_by uuid;

create index if not exists room_viewings_property_date_idx
  on public.room_viewings (property_id, inspection_date);

create index if not exists room_viewings_room_date_idx
  on public.room_viewings (room_id, inspection_date);

alter table public.room_viewings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='room_viewings' and policyname='room_viewings_auth_all'
  ) then
    create policy room_viewings_auth_all on public.room_viewings
      for all to authenticated
      using (true)
      with check (true);
  end if;
end $$;

grant select, insert, update, delete on public.room_viewings to authenticated;
grant usage, select on sequence public.room_viewings_id_seq to authenticated;
