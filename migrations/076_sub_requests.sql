-- 076_sub_requests.sql — #93 one-way cover board (post a class for cover → claim → reassign).

create table if not exists sub_requests (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid not null references boxes(id) on delete cascade,
  instance_id uuid not null references class_instances(id) on delete cascade,
  posted_by   uuid not null references profiles(id) on delete cascade,
  claimed_by  uuid references profiles(id) on delete set null,
  status      text not null default 'open' check (status in ('open','claimed','cancelled')),
  note        text,
  posted_at   timestamptz not null default now(),
  claimed_at  timestamptz
);
-- One OPEN request per class (a cancelled one can be re-posted).
create unique index if not exists idx_sub_requests_open_instance
  on sub_requests (instance_id) where status = 'open';
create index if not exists idx_sub_requests_box_status on sub_requests (box_id, status);

alter table sub_requests enable row level security;

drop policy if exists sub_requests_staff_read on sub_requests;
create policy sub_requests_staff_read on sub_requests
  for select using (box_id = auth_box_id() and auth_is_staff());

drop policy if exists sub_requests_coach_insert on sub_requests;
create policy sub_requests_coach_insert on sub_requests
  for insert with check (box_id = auth_box_id() and auth_is_programming() and posted_by = auth.uid());

-- FOR UPDATE only (not FOR ALL) so INSERT is governed solely by the own-post policy;
-- a permissive FOR ALL would let a coach insert with someone else's posted_by.
drop policy if exists sub_requests_programming_update on sub_requests;
create policy sub_requests_programming_update on sub_requests
  for update
  using (box_id = auth_box_id() and auth_is_programming())
  with check (box_id = auth_box_id() and auth_is_programming());
