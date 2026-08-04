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
   ========================================================================== */
window.ZELYTE_CONFIG = {
  SUPABASE_URL: '',        // e.g. 'https://abcdefghijklm.supabase.co' — no trailing slash
  SUPABASE_ANON_KEY: ''    // Project API keys > anon / publishable
};
