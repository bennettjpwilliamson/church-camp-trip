-- Run this in Supabase SQL Editor (supabase.com → your project → SQL Editor)

create table if not exists signups (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  phone text,
  party_size integer not null default 1,
  setup text not null,
  notes text,
  created_at timestamptz not null default now()
);

-- Email is the natural unique key; we upsert on it
create unique index if not exists idx_signups_email on signups (lower(email));
create index if not exists idx_signups_created on signups (created_at desc);

-- Row-level security (recommended)
alter table signups enable row level security;

-- Only the service role (the API) can read/write
do $$
begin
  if not exists (select 1 from pg_policies where tablename='signups' and policyname='Service role full access') then
    create policy "Service role full access"
      on signups
      for all
      using (true)
      with check (true);
  end if;
end $$;
