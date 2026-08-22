/* ==========================================================================
   ZELYTE — formula.js

   The single source of truth for the product formula. Every formula number
   that renders anywhere on the site derives from this file. Nothing else may
   hold one.

   Loaded before main.js on the seven pages that show formula values. main.js
   reads it in section 1b, hydrates the markup from it, and — in dev — warns
   about any authored fallback that has drifted out of agreement with it.

   TWO KINDS OF NUMBER, and the distinction is the whole point of this file:

     mg        the ELEMENTAL value. What the pouch delivers. This is what
               displays, everywhere, without exception.

     compound  the formulation spec: the salt the elemental value comes from
               and its weight. INTERNAL ONLY. It exists here so the two are
               recorded together and can never drift apart, and so a
               formulation question has an answer in the repo. It is NEVER
               rendered. There is deliberately no data-formula token that can
               reach it, and main.js asserts that no compound weight has
               leaked into the page.

   Note that sodium and chloride share one compound entry. 140 mg of sodium
   chloride is a single input that yields two separately declared elementals —
   55 mg sodium and 85 mg chloride. Summing the compound column across rows
   would double-count it, and the two totals do not reconcile anyway: the
   actives add to 235 mg as compounds and 205 mg as elementals. That is one
   more reason the compound column does not exist on the site.

   %DV is COMPUTED, not stored: round(mg / dv * 100), against the standard FDA
   Daily Values below. This is what `dvPct` is checked against in main.js.

     sodium     55 / 2300 = 2.39  -> 2%
     chloride   85 / 2300 = 3.70  -> 4%
     potassium  13 / 4700 = 0.28  -> 0%
     magnesium  12 / 420  = 2.86  -> 3%

   Caffeine has no established Daily Value, so dv is null and its %DV cell
   renders the dagger with the standard footnote.
   ========================================================================== */
window.ZELYTE_FORMULA = {
  build: 'C',

  /* Per pouch. The baseline the stacking control multiplies. */
  perPouch: {
    sodium:    { label: 'Sodium',    mg: 55, dv: 2300, role: 'The one you lose most in sweat', compound: { name: 'Sodium chloride',    mg: 140 } },
    chloride:  { label: 'Chloride',  mg: 85, dv: 2300, role: 'Paired with sodium as salt',     compound: { name: 'Sodium chloride',    mg: 140 } },
    caffeine:  { label: 'Caffeine',  mg: 40, dv: null, role: 'Stimulant',                      compound: { name: 'Caffeine anhydrous', mg: 40  } },
    potassium: { label: 'Potassium', mg: 13, dv: 4700, role: 'Minor constituent',              compound: { name: 'Potassium citrate',  mg: 35  } },
    magnesium: { label: 'Magnesium', mg: 12, dv: 420,  role: 'Minor constituent',              compound: { name: 'Magnesium oxide',    mg: 20  } }
  },

  /* Display order for every table and list on the site. */
  order: ['sodium', 'chloride', 'caffeine', 'potassium', 'magnesium'],

  /* Copy hierarchy, enforced by hand in the markup and recorded here so the
     reasoning survives. `lead` may headline. `quiet` is listed as present and
     never headlined: at 13 mg and 12 mg those two will not support a "full
     electrolyte blend" claim under scrutiny, so the site does not make one.
     3% DV is a long way below the 10% that "good source" requires.

     This is a copy strategy, not a magnitude ranking — note that magnesium's
     3% now runs ahead of sodium's 2%. Sodium still leads because sweat loss
     is what the product is for. */
  lead:  ['sodium', 'caffeine'],
  quiet: ['potassium', 'magnesium'],

  /* Directions. `max` is the top of the per-session range the stacking
     control offers; `dailyMax` is the ceiling, which renders next to that
     control rather than being buried in the FAQ. */
  dose: { min: 1, max: 3, dailyMax: 6 },

  perTin: 15,
  windowSeconds: 1500
};
