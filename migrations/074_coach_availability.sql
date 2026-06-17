-- 074_coach_availability.sql — #94 coach weekly availability + date-range time-off (owner-approved).

-- Recurring weekly availability windows (one row per window).
create table if not exists coach_availability (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references boxes(id) on delete cascade,
  coach_id   uuid not null references profiles(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),  -- 0=Sun..6=Sat (matches getUTCDay)
  start_time time not null,
  end_time   time not null check (end_time > start_time),
  created_at timestamptz not null default now()
);
create index if not exists idx_coach_availability_coach
  on coach_availability (box_id, coach_id, weekday);

create unique index if not exists idx_coach_availability_unique
  on coach_availability (box_id, coach_id, weekday, start_time);

-- Date-range time-off with an approval gate.
create table if not exists coach_time_off (
  id           uuid primary key default gen_random_uuid(),
  box_id       uuid not null references boxes(id) on delete cascade,
  coach_id     uuid not null references profiles(id) on delete cascade,
  start_date   date not null,
  end_date     date not null check (end_date >= start_date),
  reason       text,
  status       text not null default 'pending' check (status in ('pending','approved','denied')),
  requested_by uuid references profiles(id) on delete set null,
  decided_by   uuid references profiles(id) on delete set null,
  decided_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists idx_coach_time_off_coach
  on coach_time_off (box_id, coach_id, start_date);

alter table coach_availability enable row level security;
alter table coach_time_off     enable row level security;

-- Staff read all rows in their box (managers oversee; conflict detection needs cross-coach reads).
drop policy if exists coach_availability_staff_read on coach_availability;
create policy coach_availability_staff_read on coach_availability
  for select using (box_id = auth_box_id() and auth_is_staff());

drop policy if exists coach_time_off_staff_read on coach_time_off;
create policy coach_time_off_staff_read on coach_time_off
  for select using (box_id = auth_box_id() and auth_is_staff());

-- A coach writes their OWN rows.
drop policy if exists coach_availability_self_write on coach_availability;
create policy coach_availability_self_write on coach_availability
  for all
  using (box_id = auth_box_id() and coach_id = auth.uid())
  with check (box_id = auth_box_id() and coach_id = auth.uid());

drop policy if exists coach_time_off_self_write on coach_time_off;
create policy coach_time_off_self_write on coach_time_off
  for all
  using (box_id = auth_box_id() and coach_id = auth.uid())
  with check (box_id = auth_box_id() and coach_id = auth.uid());

-- Managers (owner/admin) write ANY row in the box (approvals, on-behalf entry).
drop policy if exists coach_availability_manager_write on coach_availability;
create policy coach_availability_manager_write on coach_availability
  for all
  using (box_id = auth_box_id() and auth_is_manager())
  with check (box_id = auth_box_id() and auth_is_manager());

drop policy if exists coach_time_off_manager_write on coach_time_off;
create policy coach_time_off_manager_write on coach_time_off
  for all
  using (box_id = auth_box_id() and auth_is_manager())
  with check (box_id = auth_box_id() and auth_is_manager());
