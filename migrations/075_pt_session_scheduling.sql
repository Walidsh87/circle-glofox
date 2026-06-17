-- 075_pt_session_scheduling.sql — #95 turn pt_sessions into scheduled 1:1 sessions.

alter table pt_sessions add column if not exists scheduled_at     timestamptz;
alter table pt_sessions add column if not exists duration_minutes int not null default 60;
alter table pt_sessions add column if not exists status           text not null default 'scheduled'
  check (status in ('scheduled','cancelled'));

-- Backfill existing payroll rows: the session "happened" when the credit was redeemed.
update pt_sessions set scheduled_at = redeemed_at where scheduled_at is null;
alter table pt_sessions alter column scheduled_at set not null;

-- List upcoming sessions + payroll-by-delivery-month.
create index if not exists idx_pt_sessions_box_scheduled on pt_sessions (box_id, scheduled_at);

-- RLS: widen reads from owner-only to staff + athlete-own. Writes stay service-role
-- (the staff-gated schedule/cancel actions), so no write policy is created.
drop policy if exists pt_sessions_owner_all on pt_sessions;
drop policy if exists pt_sessions_staff_read on pt_sessions;
create policy pt_sessions_staff_read on pt_sessions
  for select using (box_id = auth_box_id() and auth_is_staff());
drop policy if exists pt_sessions_athlete_read_own on pt_sessions;
create policy pt_sessions_athlete_read_own on pt_sessions
  for select using (box_id = auth_box_id() and athlete_id = auth.uid());
