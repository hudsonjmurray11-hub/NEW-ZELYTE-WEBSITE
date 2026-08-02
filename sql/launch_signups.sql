-- ZELYTE — launch email capture
-- Run this in the Supabase SQL editor BEFORE putting credentials in main.js.
--
-- The previous app (zelyte-ecommerce-main/src/components/LaunchCapture.tsx)
-- inserts into `launch_signups`, but no CREATE TABLE for it exists in any of
-- that repo's .sql files. This is that missing definition.

create table if not exists public.launch_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  created_at  timestamptz not null default now(),
  source      text default 'marketing-site'
);

-- Lets the client treat a duplicate submit as success (Postgres error 23505),
-- which is what the previous app already did.
create unique index if not exists launch_signups_email_key
  on public.launch_signups (lower(email));

alter table public.launch_signups enable row level security;

-- REQUIRED. The anon key ships in main.js and is public by design, so the
-- table must be insert-only for anonymous users: they may add a row and may
-- not read, update, or delete any. Without this policy the anon key would
-- expose the whole signup list.
drop policy if exists "anon can insert signups" on public.launch_signups;
create policy "anon can insert signups"
  on public.launch_signups
  for insert
  to anon
  with check (true);

-- No select/update/delete policy for `anon` is defined on purpose.
-- Read the list with the service role key, from a server, only.
