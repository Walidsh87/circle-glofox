-- #75a Quote → contract → payment (one-off sales). Run in Supabase SQL Editor.

alter table boxes add column if not exists quote_terms_template text;

create table if not exists quotes (
  id uuid primary key default gen_random_uuid(),
  box_id uuid not null references boxes(id) on delete cascade,
  athlete_id uuid references profiles(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  buyer_name text not null,
  buyer_email text not null,
  title text not null,
  status text not null default 'draft'
    check (status in ('draft','sent','accepted','paid','declined','expired','void')),
  terms text not null default '',
  valid_until date,
  public_token text unique,
  quote_number text,
  sequence int,
  subtotal_aed numeric(10,2) not null,
  vat_rate numeric(5,2) not null,
  vat_aed numeric(10,2) not null,
  total_aed numeric(10,2) not null,
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  signed_user_agent text,
  sent_at timestamptz,
  accepted_at timestamptz,
  paid_at timestamptz,
  invoice_id uuid references invoices(id) on delete set null,
  provider_checkout_ref text,
  provider_payment_ref text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (box_id, sequence),
  unique (box_id, quote_number)
);

create index if not exists idx_quotes_box on quotes(box_id, created_at desc);
create index if not exists idx_quotes_token on quotes(public_token);
create index if not exists idx_quotes_athlete on quotes(athlete_id);
create index if not exists idx_quotes_lead on quotes(lead_id);

create table if not exists quote_line_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  box_id uuid not null references boxes(id) on delete cascade,
  kind text not null check (kind in ('package','custom','discount')),
  package_id uuid references packages(id) on delete set null,
  label text not null,
  quantity int not null default 1 check (quantity >= 1),
  unit_amount_aed numeric(10,2) not null,
  line_total_aed numeric(10,2) not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_quote_lines_quote on quote_line_items(quote_id, sort_order);

alter table quotes enable row level security;
alter table quote_line_items enable row level security;

drop policy if exists quotes_staff_all on quotes;
create policy quotes_staff_all on quotes
  for all using (box_id = auth_box_id() and auth_is_staff())
          with check (box_id = auth_box_id() and auth_is_staff());

drop policy if exists quote_lines_staff_all on quote_line_items;
create policy quote_lines_staff_all on quote_line_items
  for all using (box_id = auth_box_id() and auth_is_staff())
          with check (box_id = auth_box_id() and auth_is_staff());

-- Gap-free per-box quote sequence (mirrors next_invoice_sequence).
create or replace function next_quote_sequence(p_box_id uuid)
returns int language plpgsql as $$
declare next_seq int;
begin
  perform 1 from boxes where id = p_box_id for update;
  select coalesce(max(sequence),0)+1 into next_seq from quotes where box_id = p_box_id;
  return next_seq;
end; $$;
