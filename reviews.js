/* ==========================================================================
   ZELYTE — reviews.js

   Seeded now, dark until October. The section is built and tested today so
   that turning it on is a one-line change and not a launch-week build.

   LIVE is the whole switch. While it is false, main.js section 15 renders
   nothing — no heading, no empty grid, no "reviews coming soon" placeholder.
   An empty shell is worse than no shell: it tells a first visitor the product
   has no reviews, which is exactly the impression the section exists to avoid.

   THE AGGREGATE RATING IS NOT AUTHORED ANYWHERE, and that is deliberate.
   Section 15 injects the AggregateRating node into the page's Product JSON-LD
   at render time, so it exists only when LIVE is true and only over reviews
   that are actually on the page. Writing it into the static <head> block
   instead would leave a rating in the markup whenever the flag is off — a
   review-snippet claim with no reviews behind it, which is a manipulative
   structured-data signal to Google and grounds for a manual action. It would
   also disagree with what a reader sees, which is the one thing the JSON-LD
   drift check in main.js section 1b exists to prevent.

   TO GO LIVE IN OCTOBER
     1. Replace the seed items below with real, verifiable customer reviews.
        Every one needs a real person behind it and a real date.
     2. Set LIVE: true.
     3. Reload both product pages and confirm section 1b prints no warnings.

   DO NOT ship the seed copy below as if it were real. These are placeholders
   written to size the layout, and publishing them as customer reviews would
   be fabricated testimony — illegal under the FTC's rule on fake reviews
   (16 CFR Part 465), not merely inadvisable.
   ========================================================================== */
window.ZELYTE_REVIEWS = {

  /* The switch. Nothing renders while this is false. */
  LIVE: false,

  /* Keyed by SKU slug — the same vocabulary as the filenames, the --sku class
     names, and the profiles_flavor_check constraint in sql/profiles.sql. */
  items: {
    'crispy-mint': [
      { stars: 5, name: 'PLACEHOLDER', title: 'Rower',      date: '2026-10-01', text: 'Seed copy. Replace before setting LIVE to true.' },
      { stars: 5, name: 'PLACEHOLDER', title: 'Trail runner', date: '2026-10-01', text: 'Seed copy. Replace before setting LIVE to true.' },
      { stars: 4, name: 'PLACEHOLDER', title: 'Cyclist',    date: '2026-10-01', text: 'Seed copy. Replace before setting LIVE to true.' }
    ],
    'black-cherry': [
      { stars: 5, name: 'PLACEHOLDER', title: 'Lifter',     date: '2026-10-01', text: 'Seed copy. Replace before setting LIVE to true.' },
      { stars: 5, name: 'PLACEHOLDER', title: 'Nurse',      date: '2026-10-01', text: 'Seed copy. Replace before setting LIVE to true.' },
      { stars: 4, name: 'PLACEHOLDER', title: 'Goalkeeper', date: '2026-10-01', text: 'Seed copy. Replace before setting LIVE to true.' }
    ]
  }
};
