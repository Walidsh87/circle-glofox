-- ============================================================
-- Gym Platform v1 — Multi-Tenant Schema
-- Author: Walid (with ruthless mentor)
-- Run order: top to bottom in Supabase SQL editor
-- ============================================================

-- ---------- ENUMS ----------
create type user_role as enum ('owner', 'coach', 'athlete');
create type class_status as enum ('scheduled', 'cancelled', 'completed');
create type payment_status as enum ('paid', 'unpaid', 'overdue');

-- ---------- TENANTS ----------
create table boxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Dubai',
  created_at timestamptz not null default now()
);

-- ---------- USERS (linked to Supabase auth.users) ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  box_id uuid not null references boxes(id) on delete cascade,
  role user_role not null,
  full_name text not null,
  phone text,
  email text,
  created_at timestamptz not null default now()
);
create index idx_profiles_box on profiles(box_id);

-- ---------- MEMBERSHIPS ----------
create table memberships (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  plan_name text not null,             -- "Unlimited", "10x/month", etc.
  monthly_price_aed numeric(10,2),
  start_date date not null,
  end_date date,                       -- null = active
  payment_status payment_status not null default 'unpaid',
  last_paid_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index idx_memberships_box on memberships(box_id);
create index idx_memberships_athlete on memberships(athlete_id);

-- ---------- CLASS TEMPLATES (recurring) ----------
create table class_templates (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  name text not null,                  -- "CrossFit 6 AM", "Open Gym 5 PM"
  coach_id uuid references profiles(id),
  weekday smallint not null,           -- 0=Sun ... 6=Sat
  start_time time not null,
  duration_minutes int not null default 60,
  capacity int not null default 12,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_class_templates_box on class_templates(box_id);

-- ---------- CLASS INSTANCES (actual sessions) ----------
create table class_instances (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  template_id uuid references class_templates(id),
  coach_id uuid references profiles(id),
  starts_at timestamptz not null,
  duration_minutes int not null default 60,
  capacity int not null default 12,
  status class_status not null default 'scheduled',
  created_at timestamptz not null default now()
);
create index idx_class_instances_box_starts on class_instances(box_id, starts_at);

-- ---------- BOOKINGS ----------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  class_instance_id uuid not null references class_instances(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  booked_at timestamptz not null default now(),
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  unique (class_instance_id, athlete_id)
);
create index idx_bookings_box on bookings(box_id);
create index idx_bookings_class on bookings(class_instance_id);

-- ---------- WORKOUTS (the daily WOD) ----------
create table workouts (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  date date not null,
  title text not null,                 -- "Fran", "Murph"
  description text not null,           -- free-text WOD description
  scoring_type text not null,          -- 'time' | 'rounds_reps' | 'load_kg' | 'amrap'
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (box_id, date)                -- one WOD per box per day
);
create index idx_workouts_box_date on workouts(box_id, date);

-- ---------- ATHLETE 1RM REFERENCES (powers % calculator) ----------
create table athlete_lifts (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  lift_name text not null,             -- "back_squat", "deadlift", "clean", etc.
  one_rm_grams int not null,           -- canonical storage in grams
  recorded_on date not null default current_date,
  unique (athlete_id, lift_name)       -- one current 1RM per lift
);
create index idx_athlete_lifts_box on athlete_lifts(box_id);

-- ---------- WORKOUT SCORES ----------
create table workout_scores (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  workout_id uuid not null references workouts(id) on delete cascade,
  athlete_id uuid not null references profiles(id) on delete cascade,
  score_value numeric not null,        -- seconds, reps, or grams depending on scoring_type
  rx boolean not null default false,
  notes text,
  logged_at timestamptz not null default now(),
  unique (workout_id, athlete_id)
);
create index idx_scores_workout on workout_scores(workout_id);
create index idx_scores_athlete on workout_scores(athlete_id);

-- ============================================================
-- ROW-LEVEL SECURITY (this is the actual multi-tenancy)
-- ============================================================

-- Helper: get caller's box_id.
-- SECURITY DEFINER is REQUIRED: these helpers are called from the profiles RLS
-- policy, so without DEFINER the inner read of `profiles` re-triggers that same
-- policy → "infinite recursion detected in policy for relation profiles".
create or replace function auth_box_id() returns uuid language sql stable security definer as $$
  select box_id from profiles where id = auth.uid()
$$;

-- Helper: caller's role (SECURITY DEFINER — same recursion reason as auth_box_id)
create or replace function auth_role() returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid()
$$;

-- Enable RLS on everything
alter table boxes              enable row level security;
alter table profiles           enable row level security;
alter table memberships        enable row level security;
alter table class_templates    enable row level security;
alter table class_instances    enable row level security;
alter table bookings           enable row level security;
alter table workouts           enable row level security;
alter table athlete_lifts      enable row level security;
alter table workout_scores     enable row level security;

-- Generic "same box only" policy template applied to all box-scoped tables
create policy box_isolation_select on profiles
  for select using (box_id = auth_box_id());
create policy box_isolation_select on memberships
  for select using (box_id = auth_box_id());
create policy box_isolation_select on class_templates
  for select using (box_id = auth_box_id());
create policy box_isolation_select on class_instances
  for select using (box_id = auth_box_id());
create policy box_isolation_select on bookings
  for select using (box_id = auth_box_id());
create policy box_isolation_select on workouts
  for select using (box_id = auth_box_id());
create policy box_isolation_select on athlete_lifts
  for select using (box_id = auth_box_id());
create policy box_isolation_select on workout_scores
  for select using (box_id = auth_box_id());

-- Owner/coach can mutate; athlete can mutate own rows only
create policy staff_write_classes on class_templates
  for all using (box_id = auth_box_id() and auth_role() in ('owner','coach'));
create policy staff_write_instances on class_instances
  for all using (box_id = auth_box_id() and auth_role() in ('owner','coach'));
create policy staff_write_workouts on workouts
  for all using (box_id = auth_box_id() and auth_role() in ('owner','coach'));
create policy owner_write_memberships on memberships
  for all using (box_id = auth_box_id() and auth_role() = 'owner');

-- Athletes: book own classes, log own scores/lifts
create policy athlete_book on bookings
  for all using (box_id = auth_box_id() and athlete_id = auth.uid());
create policy athlete_log_score on workout_scores
  for all using (box_id = auth_box_id() and athlete_id = auth.uid());
create policy athlete_log_lift on athlete_lifts
  for all using (box_id = auth_box_id() and athlete_id = auth.uid());

-- Box row itself: only members can see their own box
create policy box_self_select on boxes
  for select using (id = auth_box_id());
