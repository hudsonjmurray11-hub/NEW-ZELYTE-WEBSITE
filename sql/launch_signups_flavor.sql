-- ZELYTE — launch_signups: add the flavor preference column
--
-- MIGRATION. launch_signups.sql already ran against the live project, so the
-- table exists without this column. Run this in the Supabase SQL editor BEFORE
-- deploying the main.js that sends `flavor` — PostgREST rejects the whole
-- insert when the body names a column the table does not have, which would
-- take the launch list down rather than degrade it.
--
-- Safe to run more than once, and safe to run on a fresh project that already
-- got the column from launch_signups.sql: every statement here is idempotent.

alter table public.launch_signups
  add column if not exists flavor text;

-- NULLABLE ON PURPOSE. Null means "did not say", which is real data. The four
-- non-product capture forms preselect nothing, so a default here would invent
-- a preference nobody expressed and quietly skew what the first batch packs.
alter table public.launch_signups
  drop constraint if exists launch_signups_flavor_check;
alter table public.launch_signups
  add constraint launch_signups_flavor_check
  check (flavor is null or flavor in ('crispy-mint', 'black-cherry'));

-- NO RLS CHANGE IS NEEDED, and none is made here. The insert policy in
-- launch_signups.sql is `with check (true)` for `anon`, which already permits
-- the extra column. There is still no select/update/delete policy for `anon`:
-- the list stays unreadable with the public key, which is the whole point.
