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

   Note that sodium and chloride share one compound entry. 175 mg of sodium
   chloride is a single input that yields two separately declared elementals —
   70 mg sodium and 106 mg chloride. Summing the compound column across rows
   would double-count it. That is one more reason the compound column does not
   exist on the site.

   %DV is COMPUTED, not stored: round(mg / dv * 100). The four percentages on
   the formulation sheet all reproduce exactly from the standard FDA Daily
   Values below, which is what `dvPct` is checked against in main.js.

     sodium     70 / 2300 = 3.04  -> 3%
     chloride  106 / 2300 = 4.61  -> 5%
     potassium  10 / 4700 = 0.21  -> 0%
     magnesium   6 / 420  = 1.43  -> 1%

   Caffeine has no established Daily Value, so dv is null and its %DV cell
   renders the dagger with the standard footnote.
   ========================================================================== */
window.ZELYTE_FORMULA = {
  build: 'B',

  /* Per pouch. The baseline the stacking control multiplies. */
  perPouch: {
    sodium:    { label: 'Sodium',    mg: 70,  dv: 2300, role: 'The one you lose most in sweat', compound: { name: 'Sodium chloride',   mg: 175 } },
    chloride:  { label: 'Chloride',  mg: 106, dv: 2300, role: 'Paired with sodium as salt',     compound: { name: 'Sodium chloride',   mg: 175 } },
    caffeine:  { label: 'Caffeine',  mg: 25,  dv: null, role: 'Stimulant',                      compound: null },
    potassium: { label: 'Potassium', mg: 10,  dv: 4700, role: 'Minor constituent',              compound: { name: 'Potassium citrate', mg: 25  } },
    magnesium: { label: 'Magnesium', mg: 6,   dv: 420,  role: 'Minor constituent',              compound: { name: 'Magnesium oxide',   mg: 10  } }
  },

  /* Display order for every table and list on the site. */
  order: ['sodium', 'chloride', 'caffeine', 'potassium', 'magnesium'],

  /* Copy hierarchy, enforced by hand in the markup and recorded here so the
     reasoning survives. `lead` may headline. `quiet` is listed as present and
     never headlined: at 10 mg and 6 mg those two will not support a "full
     electrolyte blend" claim under scrutiny, so the site does not make one. */
  lead:  ['sodium', 'caffeine'],
  quiet: ['potassium', 'magnesium'],

  /* Directions. `max` is the top of the per-session range the stacking
     control offers; `dailyMax` is the ceiling, which renders next to that
     control rather than being buried in the FAQ. */
  dose: { min: 1, max: 3, dailyMax: 6 },

  perTin: 15,
  windowSeconds: 1500
};
