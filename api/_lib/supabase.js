/* ==========================================================================
   ZELYTE — api/_lib/supabase.js
   PostgREST with the SERVICE ROLE key. This file runs on Vercel only; the key
   comes from an environment variable and must never reach config.js or any
   file a browser loads (see the header of config.js).

   The project URL is not a secret and is read from config.js's value via the
   SUPABASE_URL env var so the two cannot point at different projects by
   accident — set it to the same string.
   ========================================================================== */

function base() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');
  return { url, key };
}

export async function db(method, path, body, prefer) {
  const { url, key } = base();
  const headers = {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  };
  if (prefer) headers['Prefer'] = prefer;
  const res = await fetch(url + '/rest/v1' + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const txt = await res.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!res.ok) {
    const e = new Error((data && data.message) || 'Supabase ' + res.status);
    e.status = res.status;
    e.body = data;
    throw e;
  }
  return data;
}
