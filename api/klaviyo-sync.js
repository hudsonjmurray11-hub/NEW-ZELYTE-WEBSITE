/* ==========================================================================
   ZELYTE — POST /api/klaviyo-sync
   Called by a Supabase Database Webhook, not by the browser:

     Supabase -> Database -> Webhooks -> Create
       table   public.launch_signups, event INSERT
       type    HTTP request, POST https://www.takezelyte.com/api/klaviyo-sync
       header  Authorization: Bearer <SYNC_WEBHOOK_SECRET>

   Why a database webhook and not a second fetch from main.js: it catches
   every path into the list — the inline form, the popup, AND the account
   trigger in profiles.sql — from one place, and the browser never needs a
   Klaviyo key of any kind.

   An account signup only subscribes if its profile kept marketing_opt_in.
   The trigger mirrors every account into launch_signups regardless, so the
   opt-in has to be checked here rather than assumed from the row.
   ========================================================================== */
import crypto from 'node:crypto';
import { db } from './_lib/supabase.js';
import { subscribe, upsertProfile } from './_lib/klaviyo.js';

function authorized(header) {
  const want = process.env.SYNC_WEBHOOK_SECRET || '';
  const given = String(header || '').replace(/^Bearer\s+/i, '');
  if (!want || !given) return false;
  const a = Buffer.from(want), b = Buffer.from(given);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!authorized(request.headers.get('authorization'))) return new Response('forbidden', { status: 403 });

  let body;
  try { body = await request.json(); } catch (e) { return new Response('bad request', { status: 400 }); }
  const rec = body && body.record;
  if (!body || body.type !== 'INSERT' || !rec || !rec.email) return new Response('ignored', { status: 200 });

  const email = String(rec.email).toLowerCase();
  const props = { launch_source: rec.source || 'marketing-site' };
  if (rec.flavor) props.flavor = rec.flavor;

  try {
    let optedIn = rec.source !== 'account';
    if (rec.source === 'account') {
      const rows = await db('GET', '/profiles?select=launch_code,signup_no,flavor,marketing_opt_in&email=eq.' + encodeURIComponent(email) + '&limit=1');
      const p = rows && rows[0];
      // An unavailable/missing profile is not consent. Fail the webhook so
      // the event can be retried or replayed after the lookup recovers.
      if (!p) throw new Error('Account profile unavailable');
      optedIn = p.marketing_opt_in === true;
      props.launch_code = p.launch_code;
      props.early_access_no = p.signup_no;
      if (p.flavor) props.flavor = p.flavor;
    }

    await upsertProfile(email, props);
    if (optedIn) await subscribe(email);
    return new Response('ok', { status: 200 });
  } catch (e) {
    // Provider response bodies can contain personal data. Keep failures
    // observable without logging the email, credentials, or provider body.
    console.error('[klaviyo-sync] synchronization failed');
    return new Response('sync unavailable', { status: 503 });
  }
}
