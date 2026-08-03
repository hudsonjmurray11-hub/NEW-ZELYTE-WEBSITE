# ZELYTE — marketing site

Five static pages. No framework, no build step, no dependencies.

```bash
python3 -m http.server 8080
```

## Files

```
index.html    Home — hero + orbit, new category, 25:00 timeline, formula,
              flavors, built for, bundles, launch list
shop.html     Flavors, pricing, what's in the tin
science.html  Buccal delivery, the 25:00 window, full formula, safety
about.html    Founder story, milestones, competitor comparison
faq.html      12 questions in three groups

styles.css    shared, commented by section
main.js       shared; every page-specific block is gated on its elements
assets/fonts/ 6 WOFF2 faces, subsetted locally (925KB TTF -> 58KB)
assets/img/   tin, pouch, two athlete photos
sql/          run before wiring the email form
```

Nav and footer are duplicated into each page rather than injected by JS — no
build step, and LCP and SEO stay intact without JavaScript.

## Lighthouse

All five pages, desktop: **performance 100, accessibility 100, best practices
100, SEO 100.** CLS ≤ 0.006, LCP 0.4–0.5s.

One trap worth knowing: the loader must **not** set `opacity: 0` on the body's
children. Elements at zero opacity are never LCP candidates, and doing so
produced `NO_LCP` and an unscoreable page. The overlay alone hides the page;
content paints behind it and is revealed when the overlay fades.

## The email form is stubbed

`main.js` section 13. The previous app wrote to a Supabase table called
`launch_signups`, but that repo's `.env` holds literal placeholders and no
`CREATE TABLE` for it exists in any of its `.sql` files.

1. Run `sql/launch_signups.sql`. It includes an **insert-only RLS policy** —
   required, not optional. The anon key ships in `main.js` and is public by
   design; without that policy it would expose the whole signup list.
2. Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

Until then the form validates, shows its success state, and logs to the console.
No existing Stripe, Supabase, or checkout code was modified.

## Brand system

Eight colors in `:root` and nothing else — verified by grep. Two derived
hairline tokens carry `--iron` and `--frost` at alpha; same colors, not new
ones. No gradients, shadows, glows, or blur anywhere.

- **Display** — Archivo Black, headlines only, all caps, `-0.03em`, `0.95`
- **Body** — Barlow 400/500/600, sentence case, `1.5`, max `68ch`
- **Data** — JetBrains Mono, uppercase, `+0.05em`

### The Strike

Traced from `NEWZELYTEICON-1.png` to a 31-point path, verified at **IoU 0.992**
against the source. `viewBox="0 0 552 754"`, aspect `0.7321`.

`ZELYTE INC./Z LOGO/zelyte-3d-logo.html` describes the mark as four separate
pieces with gaps. That is an **older stylization** — the current PNG is one
solid connected shape. The traced path is the correct one.

### The lockup

One custom property, `--cap`, drives everything:

| | |
|---|---|
| icon height | `1.757 × cap` |
| icon below baseline | `0.571 × cap` |
| gap icon → text | `0.171 × cap` |
| wordmark size | `cap / 0.688` |

`0.688` is Archivo Black's real `sCapHeight/unitsPerEm`, read from the font.
The icon overshoots the caps by `0.186` above and `0.571` below. **That
overshoot is the brand — do not "fix" it.** Never letter-space the wordmark.

The **nav** uses `.lockup--word` (wordmark alone). The **footer** keeps the
full icon + wordmark, so the measured geometry still ships.

### The Split

Instrumentation, not decoration. Elements only, no gradient functions.
`.split` (dividers) · `.split--dark` · `.split--progress` (pinned page
progress) · `.split--track` (the 25:00 fill).

## Layout and motion

**Card stack.** Every section is a rounded card on black. `.stack__item`
supplies the scroll distance; `.stack__card` pins to the top for that
distance, so consecutive cards rise over one another. Depth is scale + the
black showing through — no shadows. Cards whose content cannot fit one screen
(the FAQ list, the wide tables) take `.stack__item--flow` and simply scroll.

`body` uses `overflow-x: clip`, **not** `hidden` — `hidden` establishes a
scroll container and breaks every `position: sticky` in the stack.

**The orbit.** An absolutely-positioned background layer inside the hero card:
five rings around the tin, alternating direction, pouches shrinking and fading
the farther out they go (opacity 1 → 0.16), 60 in total. The outer rings drift
behind the headline and are clipped by the card's rounded edge. Radius and
pouch width are written in pixels by `main.js`, because a percentage inside
`translateY()` resolves against the zero-height slot.

Pouches are **tangential**: `.orbit__slot`'s `rotate(--a)` already turns its
local frame to the tangent, so the image adds no rotation of its own — flat at
the top of the circle, on its side at the left and right, angle changing
continuously as it travels. This is also why there are only three nesting
levels and **one animation per ring instead of one per pouch** (5 rather than
~41), which is what buys the headroom for 60 pouches at Lighthouse 100.

Below 640px only the inner three rings are built; the outer two are illegible
at that size and would cost 33 nodes for nothing.

**Marquee.** The authored markup is one group of words; `main.js` measures it
and clones it until the track is wider than two viewports, then the keyframe
translates by that measured `--group` width. Translating by `-50%` instead left
a **~430px empty run** on screen at the end of every cycle at 1440 (one group
is ~1965px, the card ~1412px) — the words visibly ran out. Duration is derived
from the width, so the speed is the same at any viewport.

**Loader.** The Strike turns exactly one revolution, lands where it started,
and the overlay fades. Plays on **every** page load.

Under `prefers-reduced-motion`: no loader, cards un-stick, the orbit and
marquee pause into a still arrangement, the timeline sits resolved at 25:00,
and neither the rAF loop nor the scroll listener is ever registered.

## Content notes

Two figures differ from takezelyte.com and were resolved toward the packaging:

| | Live site | Here | Why |
|---|---|---|---|
| Duration | 20–40 min | **25:00** | printed on the tin; drives The Split |
| Launch | Summer 2026 | **Fall 2026** | brand board says Fall; Summer has passed |

The live comparison table lists *Nicotine Pouches* as a competitor column.
**That column is deliberately not ported** — competitors are Energy Drinks,
Sports Drinks and Electrolyte Powders.

## Still to do

- Checkout. All buy buttons route to the launch-list form; no payment is wired.
- Real social and legal URLs (currently `#`).
- A Black Cherry tin render — only Crispy Mint exists.
