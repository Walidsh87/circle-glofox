-- #75b Subscription-membership quotes. Run in Supabase SQL Editor.

alter table quotes
  add column if not exists mode text not null default 'one_off'
    check (mode in ('one_off','subscription')),
  add column if not exists plan_id uuid references membership_plans(id) on delete set null,
  add column if not exists membership_id uuid references memberships(id) on delete set null;

create index if not exists idx_quotes_membership on quotes(membership_id);
