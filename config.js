/* ==========================================================================
   ZELYTE — config.js

   The only file in the repo that carries credentials, so it is the only file
   to touch when the project moves. There is no build step and therefore no
   environment variables: these two values are committed, and that is correct.

   The ANON key is SAFE to commit. It is a signed JWT that asserts nothing but
   "role: anon" — it grants exactly the privileges the database grants that
   role, and sql/launch_signups.sql and sql/profiles.sql are what actually
   decide those. RLS is the boundary; the key is not a secret.

   The SERVICE_ROLE key (Settings > API, labelled "secret") bypasses RLS
   entirely. It must NEVER appear in this file, in any .html, in main.js, in
   auth.js, or anywhere else this repository can reach. Read the signup list
   with it from a terminal, never from a browser.

   Until both values are filled in, the launch-list form validates, shows its
   success state and logs to the console, and the account pages say so.

   Where to find them: Supabase dashboard > Settings > API.

   SHOP_LIVE opens purchasing on the public site. Localhost always enables the
   pack builder; deployed test hosts must be listed in SHOP_PREVIEW_HOSTS.
   The one entry is the `checkout` branch's Vercel preview URL, which needs a
   Vercel login. Never list www.takezelyte.com or takezelyte.com there.

   SHOP configures the custom Storefront Cart API checkout, without a Buy
   Button embed. DOMAIN is the Shopify host; VARIANTS maps mint-cherry tin
   counts to public variant IDs. SELLING_PLAN holds a monthly plan per pack;
   0 keeps subscription checkout unavailable until its plan is configured.
   STOREFRONT_TOKEN is optional and may contain only a PUBLIC Storefront token.
   Never put Admin tokens, private Storefront tokens, or app secrets here.
   Shopify prices and validates the actual cart. No payment data touches this
   site, and the pack builder does not forward site-account personal data.
   ========================================================================== */
window.ZELYTE_CONFIG = {
  SUPABASE_URL: 'https://yyutliqftvhmkvxgwpxz.supabase.co',
  SHOP_LIVE: false,
  SHOP_PREVIEW_HOSTS: ['new-zelyte-website-git-checkout-hudsons-projects-3b80eb70.vercel.app'],
  SHOP: {
    DOMAIN: 'zrzdws-4z.myshopify.com',
    STOREFRONT_TOKEN: '216ba8007f5bd7a51d6d70e29a604938', // Public client-side token, limited Storefront scopes
    VARIANTS: {
      pro:   { '3-0': '67686179602799', '2-1': '67686179635567', '1-2': '67686179668335', '0-3': '67686179701103' },
      elite: { '5-0': '67686181732719', '4-1': '67686181765487', '3-2': '67686181798255', '2-3': '67686181831023', '1-4': '67686182486383', '0-5': '67686182519151' }
    },
    SELLING_PLAN: { pro: '708485579119', elite: '708485611887' }
  },
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5dXRsaXFmdHZobWt2eGd3cHh6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NjgzNDgsImV4cCI6MjEwMTQ0NDM0OH0.9ZAxg-CEoR1h9SKeHbyPJY6F9CNil4rdhK3BeHmGETw'
};
