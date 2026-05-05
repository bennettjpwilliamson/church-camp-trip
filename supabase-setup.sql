-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)

create table signups (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text,
  party_size integer not null default 1,
  setup text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Index for quick lookups
create index idx_signups_email on signups(email);
create index idx_signups_created on signups(created_at desc);

-- Row-level security (optional but recommended)
alter table signups enable row level security;

-- Only the service role (your API) can insert/read
create policy "Service role full access"
  on signups
  for all
  using (true)
  with check (true);
