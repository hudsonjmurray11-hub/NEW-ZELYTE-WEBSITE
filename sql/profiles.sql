-- ZELYTE — accounts, waitlist position, launch code
-- Run in the Supabase SQL editor AFTER sql/launch_signups.sql.
-- Idempotent: safe to run again.
--
--   1. waitlist_no_seq     the position counter
--   2. public.profiles     one row per auth.users row
--   3. new_launch_code()   per-user discount code
--   4. handle_new_user()   creates the profile AND mirrors the address into
--                          launch_signups, so there is one marketing list
--   5. profiles_guard()    reverts writes to the protected columns
--   6. RLS + GRANTs        a signed-in user reads/writes ONE row and only
--                          THREE of its columns
--   7. backfill            for any account created before this file was run
--
-- The anon key ships in config.js and is public by design. RLS is the only
-- boundary. The service_role key is never committed anywhere, ever.


/* 1. THE COUNTER ----------------------------------------------------------
   A sequence, not count(*). The number has to be STABLE — a deleted account
   must not renumber everyone behind it — and cheap, because account.html
   reads it off the row it has already fetched. Sequence numbers are monotonic
   but NOT gapless (a rolled-back signup burns one), so the copy on
   account.html says "early access no.", never "you are the Nth of N".
   ------------------------------------------------------------------------ */
create sequence if not exists public.waitlist_no_seq as integer start with 1;


/* 2. THE TABLE ------------------------------------------------------------
   `email` is duplicated out of auth.users on purpose: PostgREST cannot read
   the auth schema and must not be able to, and account.html needs to print
   the address. A trigger in section 4 keeps it in sync.

   The flavor values are the product page filenames — one vocabulary for the
   SKU across SQL, HTML and JS.
   ------------------------------------------------------------------------ */
create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text not null,
  full_name        text,
  flavor           text,
  marketing_opt_in boolean not null default true,
  signup_no        integer not null default nextval('public.waitlist_no_seq'),
  launch_code      text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint profiles_flavor_check
    check (flavor is null or flavor in ('crispy-mint', 'black-cherry'))
);

create unique index if not exists profiles_launch_code_key on public.profiles (launch_code);
create unique index if not exists profiles_signup_no_key   on public.profiles (signup_no);


/* 3. THE LAUNCH CODE ------------------------------------------------------
   One code per user, not one shared LAUNCH15. A shared code sits in the page
   source of a page anyone can view, which makes it a coupon, not a perk; a
   per-user code is only readable through RLS by its owner and is traceable to
   an account when it is redeemed. Same 15% for everyone — the prefix says so.

   The alphabet is Crockford-ish: no I, L, O or U, so a code read off a screen
   and typed into a checkout cannot be mistranscribed.

   random() and not gen_random_bytes(): this function runs with
   `search_path = ''` and gen_random_bytes lives in the `extensions` schema on
   Supabase, which would have to be hard-coded here. random() is in pg_catalog,
   always on the path. These are coupons, not secrets — if they ever become
   redeemable without a login, switch to extensions.gen_random_bytes and widen
   the code to 10 characters.
   ------------------------------------------------------------------------ */
create or replace function public.new_launch_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  candidate text;
  i         int;
  tries     int := 0;
begin
  loop
    candidate := 'ZLT15-';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    exit when not exists (select 1 from public.profiles p where p.launch_code = candidate);
    tries := tries + 1;
    if tries > 20 then
      raise exception 'could not allocate a unique launch code';
    end if;
  end loop;
  return candidate;
end;
$$;


/* 4. THE TRIGGERS ---------------------------------------------------------
   The client cannot create the profile itself: with email confirmation on
   there is no session at signup time, so a client-side insert would either
   race the confirmation or need an insert policy for `anon` — which would let
   anyone forge rows. The standard handle_new_user pattern is the only correct
   shape here.

   READ THIS BEFORE EDITING. If anything in this function raises, GoTrue rolls
   the whole signup back and the user sees "Database error saving new user"
   with no account created. It is the single most common way to break Supabase
   auth. Everything below is written so it cannot throw:

     - `on conflict do nothing` on both inserts,
     - a `case` expression rather than a ::boolean cast, which would throw on
       any metadata value that is not a boolean literal,
     - the launch_signups insert in its own exception block, so a marketing
       list problem can never cost somebody an account.

   Keep all three.
   ------------------------------------------------------------------------ */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, marketing_opt_in, launch_code)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    case lower(coalesce(new.raw_user_meta_data ->> 'marketing_opt_in', 'true'))
      when 'false' then false
      when 'f'     then false
      when '0'     then false
      else true
    end,
    public.new_launch_code()
  )
  on conflict (id) do nothing;

  -- An account IS a launch-list signup. One list, one export, one send.
  -- `on conflict do nothing` with NO inference target on purpose: the unique
  -- index on launch_signups is on lower(email), an EXPRESSION index, so
  -- `on conflict (email)` would not match it and would raise.
  begin
    if coalesce(new.email, '') <> '' then
      insert into public.launch_signups (email, source)
      values (lower(new.email), 'account')
      on conflict do nothing;
    end if;
  exception when others then
    null;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Keeps profiles.email honest if the address is ever changed in auth.users.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set email = lower(new.email), updated_at = now()
   where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.handle_user_email_change();


/* 5. COLUMN GUARD ---------------------------------------------------------
   Second line of defence only — the GRANT in section 6 is the real fence.

   Gated on current_user because the email-sync trigger above runs SECURITY
   DEFINER as `postgres`, and without the gate this trigger would silently
   revert it. PostgREST requests arrive as `authenticated`; nothing else does.
   ------------------------------------------------------------------------ */
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.id          := old.id;
    new.email       := old.email;
    new.signup_no   := old.signup_no;
    new.launch_code := old.launch_code;
    new.created_at  := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.profiles_guard();


/* 6. RLS AND GRANTS -------------------------------------------------------
   RLS decides WHICH ROWS. It cannot decide which columns — that is a GRANT,
   and Supabase hands `authenticated` all privileges on public tables by
   default, so the revoke has to come first or the grant means nothing.

   DO NOT later run `grant all on all tables in schema public to authenticated`
   anywhere in this project. It is a common copy-paste and it would reopen
   every column below, letting anyone set their own waitlist number and mint
   their own launch code.

   `(select auth.uid())` and not bare `auth.uid()`: the subquery is Supabase's
   documented form and lets the planner cache the result as an InitPlan rather
   than re-evaluating it per row.
   ------------------------------------------------------------------------ */
alter table public.profiles enable row level security;

drop policy if exists "profiles: owner reads own row" on public.profiles;
create policy "profiles: owner reads own row"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles: owner updates own row" on public.profiles;
create policy "profiles: owner updates own row"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No insert policy and no delete policy, deliberately. handle_new_user()
-- creates the row (SECURITY DEFINER, so RLS does not apply to it) and the
-- `on delete cascade` on the primary key removes it. A browser never does
-- either one.

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, flavor, marketing_opt_in) on public.profiles to authenticated;

-- anon gets nothing at all: a signed-out read is 42501 permission denied,
-- which is a different and louder failure than the empty array RLS returns.
revoke all on sequence public.waitlist_no_seq from anon, authenticated;


/* 7. BACKFILL -------------------------------------------------------------
   For any account created before this file was first run. `order by
   created_at` so the sequence hands out numbers in signup order rather than
   whatever order the rows happen to sit in on the heap.
   ------------------------------------------------------------------------ */
insert into public.profiles (id, email, full_name, marketing_opt_in, launch_code)
select u.id,
       lower(u.email),
       nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
       true,
       public.new_launch_code()
  from auth.users u
 where u.email is not null
 order by u.created_at
    on conflict (id) do nothing;

insert into public.launch_signups (email, source)
select lower(u.email), 'account'
  from auth.users u
 where u.email is not null
    on conflict do nothing;
