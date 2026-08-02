# ZELYTE — marketing site

Static, single page. No framework, no build step, no dependencies.
Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8080
```

## Files

```
index.html                 all 10 sections; the Strike <symbol> is defined once here
styles.css                 commented by section, in page order
main.js                    reveals, scroll progress, timeline, mark, menu, form
assets/fonts/*.woff2       6 faces, subsetted locally (925KB TTF -> 58KB)
assets/img/mint-tin.webp   Crispy Mint tin, background removed
sql/launch_signups.sql     run this before wiring the email form
```

## The email form is stubbed

`main.js` section 8. The previous app wrote to a Supabase table called
`launch_signups`, but that repo's `.env` holds literal placeholders
(`https://placeholder.supabase.co` / `placeholder-anon-key`) and no
`CREATE TABLE` for it exists in any of its `.sql` files.

To go live:

1. Run `sql/launch_signups.sql` in the Supabase SQL editor. It includes an
   **insert-only RLS policy** — this is required, not optional. The anon key
   ships in `main.js` and is public by design, so without that policy the key
   would expose the whole signup list.
2. Fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` at the top of section 8.

Nothing else changes. Until then the form validates, shows its success state,
and logs the captured address to the console.

No existing Stripe, Supabase, or checkout code was modified.

## Brand system

Eight colors, defined in `:root`, and nothing else. Two derived hairline
tokens carry `--iron` and `--frost` at alpha — same colors, not new ones.
No gradients, shadows, glows, or blur anywhere.

- **Display** — Archivo Black, headlines only, all caps, `-0.03em`, `0.95`
- **Body** — Barlow 400/500/600, sentence case, `1.5`, max `68ch`
- **Data** — JetBrains Mono, uppercase, `+0.05em` — labels, doses, nav, buttons

### The Strike

Traced from `NEWZELYTEICON-1.png` to a 31-point path, verified at **IoU 0.992**
against the source. `viewBox="0 0 552 754"`, aspect `0.7321`.

Note: `ZELYTE INC./Z LOGO/zelyte-3d-logo.html` describes the mark as four
separate pieces with gaps between them. That is an **older stylization** — the
current PNG is one solid connected shape. The traced path is the correct one.

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
overshoot is the brand — do not "fix" it.** Never letter-space the wordmark
apart; it is set at `-0.035em`.

To resize a lockup, change `--cap` and nothing else.

### The Split

`.split` is instrumentation, not decoration. Built from elements only — no
gradient functions, so the no-gradients rule stays unambiguous.

- `.split` — every section divider (there are no `<hr>` elements)
- `.split--dark` — on asphalt
- `.split--progress` — pinned scroll progress at the top of the viewport
- `.split--track` — the fill in "how it works"

## Motion

`IntersectionObserver` for reveals (16px + opacity, 240ms, 60ms sibling
stagger, each element once). One shared `requestAnimationFrame` loop drives the
scroll progress, the timeline, the parallax, and the mark. Transform and
opacity only.

The hero mark is a dependency-free port of the old Three.js logo: same spin
(`0.012` rad/frame), same drag sensitivity (`0.005`), same inertia decay
(`0.95`), same 2s auto-spin resume. WebGL is replaced by stacked SVG layers in
a `preserve-3d` scene, so there is no CDN dependency and no surface shading.
It is draggable.

Under `prefers-reduced-motion` the rAF loop never starts, the scroll listener
is never registered, the mark layers are never built, and everything renders
in its resting state.

## Still to do

- `/shop` — a separate page, not built. All SHOP links point at `#flavors`.
- Real photography for the two `BUILT FOR` slots (`index.html`, marked with
  shot descriptions). Space is already reserved so there is no layout shift.
- Real social and legal URLs in the footer (currently `#`).
- A Black Cherry tin render — only Crispy Mint exists today.
