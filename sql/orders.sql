-- ZELYTE — orders
--
-- RETIRED. Checkout moved to Shopify, which keeps orders, tracking and
-- subscriptions itself; nothing in api/ writes this table any more and
-- account.html no longer reads it. Kept for reference only — do not run it on
-- a new project. If it already ran, the table is harmless and can be dropped
-- whenever you like.
--
-- Run in the Supabase SQL editor AFTER sql/profiles.sql. Idempotent.
--
-- One row per thing that goes in a box: a one-time Checkout, the first month
-- of a subscription, and every renewal after it. Written ONLY by the webhooks
-- in api/ with the service_role key; a browser can read its own rows and
-- nothing else.
--
--   1. public.orders     the table
--   2. RLS + GRANTs      a signed-in user SELECTs their own rows, no writes
--   3. customer flag     launch_signups.customer_at, for list segmentation


/* 1. THE TABLE ------------------------------------------------------------
   `stripe_ref` is the idempotency key. Stripe retries webhooks and can
   deliver the same event twice; inserting on a unique key with
   `resolution=ignore-duplicates` is what turns the second delivery into a
   no-op instead of a second box in the mail.

     one-time and first subscription month  -> the Checkout Session id (cs_…)
     every renewal                          -> the Invoice id (in_…)

   `user_id` is filled when the paying email matches an account, so a guest
   checkout with the same address still shows up on account.html.

   Status only ever moves forward:
     paid -> shipped -> delivered, or -> refunded from anywhere.
   ------------------------------------------------------------------------ */
create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  order_no               integer generated always as identity,
  stripe_ref             text not null,
  stripe_customer_id     text,
  stripe_subscription_id text,
  stripe_payment_intent  text,
  user_id                uuid references auth.users (id) on delete set null,
  email                  text not null,
  name                   text,
  pack                   text not null check (pack in ('pro', 'elite')),
  mode                   text not null check (mode in ('one', 'sub')),
  mint_qty               integer not null default 0 check (mint_qty >= 0),
  cherry_qty             integer not null default 0 check (cherry_qty >= 0),
  amount_total           integer not null,           -- cents, as charged
  amount_shipping        integer not null default 0, -- cents
  shipping_method        text,
  shipping               jsonb,                      -- {name, line1, line2, city, state, postal_code, country}
  status                 text not null default 'paid'
                           check (status in ('paid', 'shipped', 'delivered', 'refunded')),
  shippo_order_id        text,
  tracking_number        text,
  tracking_url           text,
  carrier                text,
  created_at             timestamptz not null default now(),
  shipped_at             timestamptz,
  constraint orders_tins_check check (mint_qty + cherry_qty in (3, 5))
);

create unique index if not exists orders_stripe_ref_key on public.orders (stripe_ref);
create unique index if not exists orders_order_no_key   on public.orders (order_no);
create index if not exists orders_user_idx       on public.orders (user_id);
create index if not exists orders_email_idx      on public.orders (lower(email));
create index if not exists orders_shippo_idx     on public.orders (shippo_order_id);
create index if not exists orders_tracking_idx   on public.orders (tracking_number);


/* 2. RLS AND GRANTS -------------------------------------------------------
   Same shape as profiles.sql: RLS picks the rows, the GRANT picks what may
   be done with them. No insert, update or delete for anyone but the service
   role, which bypasses RLS and is only ever used from api/.
   ------------------------------------------------------------------------ */
alter table public.orders enable row level security;

drop policy if exists "orders: owner reads own rows" on public.orders;
create policy "orders: owner reads own rows"
  on public.orders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.orders from anon, authenticated;
grant select on public.orders to authenticated;


/* 3. CUSTOMER FLAG --------------------------------------------------------
   Set by the Stripe webhook on first purchase, so the launch-list export can
   leave out people who have already bought.
   ------------------------------------------------------------------------ */
alter table public.launch_signups add column if not exists customer_at timestamptz;
