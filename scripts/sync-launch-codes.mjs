/* ==========================================================================
   ZELYTE — scripts/sync-launch-codes.mjs
   Makes every account's ZLT10-XXXXXX launch code redeemable at Shopify
   checkout, by creating one Shopify discount code per profile: 10% off, used
   once, on one-time purchases and subscriptions alike, and on a subscription's
   first payment only. The ZLT10- prefix in profiles.sql promises exactly
   this. Safe to re-run — codes that already exist are skipped — so run it
   again right before launch, and after, to pick up accounts created since.

     node --env-file=.env.local scripts/sync-launch-codes.mjs

   .env.local: SHOPIFY_STORE (zelyte.myshopify.com), SUPABASE_URL,
   SUPABASE_SERVICE_ROLE_KEY, and either SHOPIFY_ADMIN_TOKEN (shpat_…) or
   SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET for an app made in the Shopify
   Dev Dashboard. The app needs read_discounts and write_discounts.
   Run from a terminal only. None of these keys go near a browser.

   One discount per code, not one discount with many codes, because Shopify's
   usage limit counts the whole discount: a per-code limit of one only exists
   when each code is its own discount.

   Also creates one shared, unlimited code (PUBLIC_CODE below), once per
   customer, for the launch email to people who joined the list without
   making an account — they have no personal code. It is never written on
   the site.
   ========================================================================== */
import { db } from '../api/_lib/supabase.js';

const PUBLIC_CODE = 'FIRSTBATCH';
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';
const STORE = String(process.env.SHOPIFY_STORE || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
if (!STORE) throw new Error('SHOPIFY_STORE not set');

async function accessToken() {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN;
  const id = process.env.SHOPIFY_CLIENT_ID, secret = process.env.SHOPIFY_CLIENT_SECRET;
  if (!id || !secret) throw new Error('Set SHOPIFY_ADMIN_TOKEN, or SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET');
  const res = await fetch(`https://${STORE}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret })
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || !b.access_token) throw new Error('Shopify token request failed: ' + res.status + ' ' + JSON.stringify(b));
  return b.access_token;
}

const TOKEN = await accessToken();

/* Retries on THROTTLED, which a few hundred mutations in a row will hit on
   the smaller plans' cost bucket. */
async function gql(query, variables) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${STORE}/admin/api/${VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': TOKEN },
      body: JSON.stringify({ query, variables })
    });
    const b = await res.json().catch(() => ({}));
    const throttled = res.status === 429 || (b.errors || []).some(e => e.extensions && e.extensions.code === 'THROTTLED');
    if (throttled && attempt < 8) { await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); continue; }
    if (!res.ok || b.errors) throw new Error('Shopify ' + res.status + ': ' + JSON.stringify(b.errors || b));
    return b.data;
  }
}

async function codeExists(code) {
  const d = await gql('query($code: String!) { codeDiscountNodeByCode(code: $code) { id } }', { code });
  return !!d.codeDiscountNodeByCode;
}

async function createCode(code, single) {
  const input = {
    title: single ? 'Launch code ' + code : 'Launch list — ' + code,
    code,
    startsAt: new Date().toISOString(),
    context: { all: 'ALL' },
    customerGets: {
      value: { percentage: 0.1 },
      items: { all: true },
      appliesOnOneTimePurchase: true,
      appliesOnSubscription: true
    },
    recurringCycleLimit: 1,
    appliesOncePerCustomer: true,
    usageLimit: single ? 1 : null
  };
  const d = await gql(`mutation($input: DiscountCodeBasicInput!) {
    discountCodeBasicCreate(basicCodeDiscount: $input) { userErrors { field message } }
  }`, { input });
  const errs = d.discountCodeBasicCreate.userErrors;
  if (errs.length) throw new Error(code + ': ' + errs.map(e => (e.field || []).join('.') + ' ' + e.message).join('; '));
}

let made = 0, skipped = 0;

if (await codeExists(PUBLIC_CODE)) skipped++;
else { await createCode(PUBLIC_CODE, false); made++; }

for (let offset = 0; ; offset += 500) {
  const rows = await db('GET', '/profiles?select=id,launch_code&order=signup_no&limit=500&offset=' + offset);
  if (!rows.length) break;
  for (const p of rows) {
    if (!p.launch_code) continue;
    if (await codeExists(p.launch_code)) { skipped++; continue; }
    await createCode(p.launch_code, true);
    made++;
  }
}

console.log(`created ${made}, already there ${skipped}`);
