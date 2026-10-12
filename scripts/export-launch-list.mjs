/* ==========================================================================
   ZELYTE — scripts/export-launch-list.mjs
   Writes launch-list-YYYY-MM-DD.csv for the launch-day email: one row per
   address that may be emailed, with the personal launch code where the
   address has an account.

     node --env-file=.env.local scripts/export-launch-list.mjs

   Import into Klaviyo (Lists & segments -> the launch list -> Import), mapping
   `launch_code` to a custom property of the same name. The campaign then uses:

     {% if person.launch_code %}{{ person.launch_code }}{% else %}FIRSTBATCH{% endif %}

   Left out: accounts that turned marketing off. Buyers are not known here —
   orders live in Shopify — so exclude them in the Klaviyo campaign instead,
   with a "Placed Order zero times" segment from the Shopify integration.

   The CSV is gitignored and vercelignored. It is a list of real people's
   addresses — keep it off shared drives and delete it after the import.
   ========================================================================== */
import { writeFileSync } from 'node:fs';
import { db } from '../api/_lib/supabase.js';

async function all(path) {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await db('GET', path + '&limit=1000&offset=' + offset);
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

const signups = await all('/launch_signups?select=email,flavor,source,created_at&order=created_at');
const profiles = await all('/profiles?select=email,flavor,launch_code,signup_no,marketing_opt_in&order=signup_no');
const byEmail = new Map(profiles.map((p) => [p.email.toLowerCase(), p]));

const csv = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

const lines = [['email', 'flavor', 'source', 'launch_code', 'early_access_no', 'signed_up'].join(',')];
let kept = 0, optedOut = 0;

for (const s of signups) {
  const email = s.email.toLowerCase();
  const p = byEmail.get(email);
  if (p && !p.marketing_opt_in) { optedOut++; continue; }
  lines.push([email, (p && p.flavor) || s.flavor, s.source, p && p.launch_code, p && p.signup_no, s.created_at.slice(0, 10)].map(csv).join(','));
  kept++;
}

const file = 'launch-list-' + new Date().toISOString().slice(0, 10) + '.csv';
writeFileSync(file, lines.join('\n') + '\n');
console.log(`${file}: ${kept} rows (left out ${optedOut} opted out)`);
