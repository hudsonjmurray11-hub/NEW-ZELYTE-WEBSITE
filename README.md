# ZELYTE — marketing site

Nineteen static pages. No framework, no build step, no dependencies — accounts
included. Supabase is called with hand-written `fetch`; `supabase-js` is not
loaded, here or anywhere.

```bash
python3 -m http.server 8080
```

`file://` will not do. Both Supabase hosts answer CORS with `*`, but an
`Origin: null` is rejected, so the account pages need a real server.

## Files

```
index.html          Home — hero + orbit, new category, 25:00 timeline,
                    formula, flavors, built for, bundles, launch list
shop.html           Flavors, pricing, what's in the tin
crispy-mint.html    Product — hero, the pan, taste, bundles, launch list
black-cherry.html   Product — same structure, different flavor
science.html        Buccal delivery, the 25:00 window, full formula, safety
about.html          Founder story, milestones, competitor comparison
faq.html            14 questions in three groups

founder.html        Long-form founder story
privacy.html        Privacy policy
terms.html          Terms of service (accessibility statement is section 13)
shipping.html       Shipping and returns
404.html            Not found — noindex, served by Vercel automatically
waitlist-confirmed.html  Landing after a launch-list signup — noindex

signin.html         Sign in
signup.html         Create an account
account.html        Protected — early access no., launch code, flavor,
                    name, password, sign out
forgot.html         Request a password reset link
reset.html          Landing for the reset link, then set a new password
welcome.html        Landing for the confirmation link

styles.css    shared, commented by section
main.js       shared; every page-specific block is gated on its elements
auth.js       accounts; loaded on the six account pages only
config.js     the only file with credentials
formula.js    the only file with formula numbers
reviews.js    seeded reviews behind one LIVE flag; dark until October
assets/fonts/ 6 WOFF2 faces, subsetted locally (925KB TTF -> 58KB)
assets/img/   two tins, pouch, two athlete photos
sql/          run these before filling in config.js:
              launch_signups.sql, profiles.sql, and — on a project whose
              launch_signups table predates it — launch_signups_flavor.sql
```

Nav and footer are duplicated into each page rather than injected by JS — no
build step, and LCP and SEO stay intact without JavaScript. A footer change is
therefore a **nineteen**-file change, and a nav change is nineteen files times
two, because `.nav__links` and `.menu__links` are separate lists.

The footer has exactly **two variants**, differing in one href: the Launch list
link is `#capture` on the five pages that have their own capture section
(`about`, `black-cherry`, `crispy-mint`, `faq`, `shop`) and `index.html#capture`
on the other fourteen. Batch footer edits against those two strings rather than
going file by file — and remember that a new page generated from an `#capture`
page inherits a link to an anchor it does not have.

The **Account** link in the nav is static and is never rewritten by JS. It
always reads "Account"; `account.html` bounces a signed-out visitor to
`signin.html` before the page paints. Swapping the label on auth state would
mean injecting nav from JS, which is the one thing this site does not do.

### The nav is two boxes, on purpose

`.nav` is a transparent, constant **54px** shell. `.nav__inner` is the chalk
pill, and it is the only thing that shrinks on scroll (54 → 46, via the
`.is-stuck` class `main.js` already toggles). They are separate because
`main.js` measures `nav.offsetHeight` into `--nav-h`, and `--nav-h` drives
every card's top padding and every `[id]`'s `scroll-margin-top` — so a shell
that resized would relayout the entire card stack the moment you started
scrolling. 54 and not 52: the resting pill is 9+9 padding, a 34px CTA, **and
its own 1px borders**.

## Lighthouse

The seven original marketing pages, desktop: **performance 100, accessibility
100, best practices 100, SEO 100.** CLS ≤ 0.006, LCP 0.4–0.5s. The four new
indexable pages (`founder`, `privacy`, `terms`, `shipping`) are held to the same
bar and have not yet been measured.

`account.html`, `reset.html`, `welcome.html`, `404.html` and
`waitlist-confirmed.html` are `noindex` by design, so their SEO score reads ~90.
That is the correct result, not a regression.

One trap worth knowing: the loader must **not** set `opacity: 0` on the body's
children. Elements at zero opacity are never LCP candidates, and doing so
produced `NO_LCP` and an unscoreable page. The overlay alone hides the page;
content paints behind it and is revealed when the overlay fades.

## Accounts and the email list

Both run on one Supabase project. Until `config.js` is filled in, the launch
form validates, shows its success state and logs to the console, and the
account pages say plainly that accounts are not connected yet.

### Keys

`config.js` is the only file with credentials, and they are **committed on
purpose** — there is no build step, so there are no environment variables.

The **anon** key is safe to commit. It is a signed JWT asserting nothing but
`role: anon`; the two SQL files decide what that role may actually do. RLS is
the boundary, not the key.

The **service_role** key bypasses RLS entirely and must never appear in this
repository. Read the signup list with it from a terminal, never a browser.

### Setup, in order

1. **Settings → API** — copy the Project URL and the anon key into `config.js`.
2. **SQL Editor** — run `sql/launch_signups.sql`, then `sql/profiles.sql`.
   On a project where `launch_signups` already exists, also run
   `sql/launch_signups_flavor.sql` — `create table if not exists` will not add
   a column to a table that is already there, so the `flavor` column arrives
   only via that migration. Run it **before** deploying a `main.js` that sends
   `flavor`: PostgREST rejects the whole insert when the body names a column
   the table does not have, which takes the launch list down rather than
   degrading it.
3. **Auth → Providers → Email** — confirmations **on**, minimum password
   length **8** (every password input carries `minlength="8"` to match).
4. **Auth → URL Configuration** — Site URL is the production domain; add
   `http://localhost:8080/**` and the Vercel domains to Redirect URLs.
5. **Auth → Emails → Templates** — rewrite two templates to use
   `{{ .TokenHash }}`:

   ```html
   <a href="{{ .SiteURL }}/welcome.html?token_hash={{ .TokenHash }}&type=signup">Confirm your email</a>
   <a href="{{ .SiteURL }}/reset.html?token_hash={{ .TokenHash }}&type=recovery">Set a new password</a>
   ```

   Not cosmetic. The default `{{ .ConfirmationURL }}` is redeemed by a **GET**,
   so any corporate link scanner burns it before the human clicks — the usual
   cause of "my link says it expired". A `token_hash` is only redeemable by a
   POST. It also sidesteps PKCE entirely: a `?code=` link needs the
   `code_verifier` that `supabase-js` stores at sign-up, and we do not ship
   `supabase-js`.
6. **Custom SMTP.** The built-in sender is capped near two emails an hour.
   Without this, signups look like they worked and no mail ever arrives.

`{{ .SiteURL }}` always points at production, so test emails do too. Do not
flip Site URL back and forth — the token does not encode a host, so just edit
the emailed link's origin to `localhost:8080`.

### The waitlist popup

`main.js` section 13b. The same launch-list ask as `#capture`, for the visitor
who leaves before scrolling that far. It is built in JS rather than authored
into eight files, so the copy lives in one place — and with JS off nothing
appears, which is right, because the form could not submit either.

**Which pages pop is decided by one attribute**: `data-waitlist-popup` on
`<body>`. Eight marketing pages carry it — `index`, `shop`, `science`, `about`,
`founder`, `faq`, `crispy-mint`, `black-cherry`. Nothing else does, and that is
deliberate: the account pages (`signin`, `signup`, `forgot`, `reset`, `welcome`,
`account`) must never interrupt someone mid password reset, the legal pages and
`404` have no reason to sell, and `waitlist-confirmed` is for people already on
the list. Adding or removing a page is a one-attribute edit **in that page**,
not a hidden array in `main.js`.

**Triggers, first to fire wins** — the rest then detach, so it opens at most
once per page load:

| Trigger | Where |
|---|---|
| 5s timer | everywhere, started when the loader finishes |
| Cursor leaves through the top edge | `(pointer: fine)` only |
| Hard upward scroll flick | coarse pointers — the thumb going for "back" |

The timer starts from `revealPage()`, not from script parse, via the
`onPageReady` queue in section 3. The loader owns the first ~1.5s, and counting
through it would put the popup up almost as the page arrives.

**It will not open** if the visitor already answered (a `zelyte.waitlist.popup`
key of `dismissed` or `signed` in `localStorage`), if the mobile menu is open,
or if `#capture` is already on screen — no stacking an ask on an ask. The
`signed` flag is written by **every** successful signup, inline or popup, so
someone who joined from `#capture` is never popped at afterwards. Every
`localStorage` touch is wrapped in `try/catch`: Safari in private mode throws,
and storage must not take the form down with it.

To see it again while working: `localStorage.removeItem('zelyte.waitlist.popup')`.

### Flavor preference

Both the popup and all six `#capture` forms ask Crispy Mint or Black Cherry,
using the same `.pick__grid` / `.buy__card.pick` markup as the account page.

The picker sits **inside** `<form class="capture__form">`, not above it. Two
reasons, and both bite if it moves: `wireSignup` scopes its flavor lookup to
the form, so a sibling picker would look fine and silently record no preference
on every signup; and radios sharing `name="flavor"` are grouped per-form, which
is what keeps the popup's pair independent of the inline pair on a page showing
both.

`crispy-mint.html` and `black-cherry.html` preselect their own flavor — someone
who read a whole product page has stated a preference by being there. The other
four preselect nothing, and **`flavor` is nullable** so that "did not say" stays
distinguishable from a choice. A default here would invent demand and skew what
the first batch packs.

`source` separates the two paths: `popup` or `marketing-site`. That is how you
find out whether the popup is worth its interruption.

### What the schema guarantees

`sql/profiles.sql` gives every account a `signup_no` from a sequence and a
unique `ZLT15-XXXXXX` launch code, both created by a trigger on `auth.users`
that also mirrors the address into `launch_signups` — one marketing list.

RLS restricts a signed-in user to their own row. RLS is row-level and **cannot
protect columns**, so the fence on `signup_no` and `launch_code` is a column
`GRANT`: only `full_name`, `flavor` and `marketing_opt_in` are writable. Never
run `grant all on all tables in schema public to authenticated` on this
project — it is a common copy-paste and it would let anyone mint their own
launch code.

Read `sql/profiles.sql` before editing `handle_new_user()`. If that function
raises, GoTrue rolls the whole signup back and the user sees "Database error
saving new user" with no account created.

### Verifying RLS

```bash
curl -s "$URL/rest/v1/launch_signups?select=email" -H "apikey: $ANON" -H "Authorization: Bearer $ANON"
```

Passes on `[]` — and only proves anything once the table has rows, because an
empty table returns `[]` too. `anon` keeps the table-level SELECT grant, so
this is a 200 with zero rows surviving RLS, not a 403. `profiles` fails
differently: `42501 permission denied`, because the grant itself was revoked.

No existing Stripe or checkout code was modified; there still is none.

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

**The pan** (product pages). `#pan-item` takes `.stack__item--pan` for 220svh
of scroll; `main.js` converts that vertical travel into a sideways
`translate3d` on `#pan-track`, using the same `-rect.top / span` progress the
25:00 timeline uses. The translate is by the **measured** remaining width
(`scrollWidth - clientWidth`), not a percentage — that is what makes the last
panel land flush at p=1 instead of trailing a dead run, the mistake the
marquee used to make.

**`.pan__panel`'s width is the speed control, and it is the whole ballgame.**
What decides whether this reads as an animation is *travel ÷ scroll distance*.
At 340px wide, 3.1 of the 5 panels were already on screen, so the row had only
656px to cover across 1800px of scroll — **0.36×**, slow enough that it read as
broken. At 460px only 2.4 fit, travel is 1256px, and the shorter `--pan` span
brings it to **1.16×**, so the row moves marginally faster than the finger.
Measured across six viewports: 0.91–1.31×, gap 0 at both ends. Do not shrink
the panels or lengthen `--pan` without re-checking that ratio.

Note the two tall classes are deliberately separate — `.stack__item--tall`
(300svh) for the 25:00 clock, which wants a long slow scrub, and
`.stack__item--pan` (220svh) for the pan, which wants to keep up.

Tall heights are a **class**, never an inline `style="height:…"`. Section 22
flattens the stack with `.stack__item{height:auto}`, and a stylesheet rule can
never override an inline height — while `#how-item` carried one, reduced motion
left it 2700px tall with an un-stuck card inside it.

**The product tin.** Rotates 90°, rises 60px and scales to 0.88 across the
hero's own exit, so it resolves rather than drifting. Composited transform only.

**Loader.** The Strike turns exactly one revolution, lands where it started,
and the overlay fades. Plays on **every** page load.

Under `prefers-reduced-motion`: no loader, cards un-stick, the orbit and
marquee pause into a still arrangement, the timeline sits resolved at 25:00,
and neither the rAF loop nor the scroll listener is ever registered.

The pan does **not** become a sideways scroller here. It used to, and that left
the row clipped with two panels off the edge under a progress rule that could
never fill — indistinguishable from an unfinished section. The panels wrap into
a `3+2` grid instead: all five visible, `.pan` horizontal overflow exactly 0,
`.pan__foot` hidden. If someone reports "the animation doesn't work," check
this setting first — the marquee standing still is the one-look tell.

### The flavor accent is a fill, never ink

The two flavor colors are legible on **opposite** surfaces, so no single
"headline is the flavor color" rule can serve both product pages. Measured:

| | on `--chalk` | on `--asphalt` |
|---|---|---|
| `--mint` | 2.82:1 — fails even large-text 3:1 | 5.73:1 — passes |
| `--cherry` | 9.43:1 — passes | 1.71:1 — fails |

Inverted it is symmetric. `--sku` is a **background** and `--sku-ink` is the
palette color that passes on it — asphalt-on-mint **5.73:1**, chalk-on-cherry
**9.43:1**. Headlines stay chalk/asphalt; interactive elements stay voltage.

## The formula

`formula.js` is the single source of truth. It is loaded ahead of `main.js` on
the seven pages that show formula values, and `main.js` section 1b hydrates
every `[data-formula]` element from it.

**Elemental values only, everywhere.** The build declares what the pouch
delivers — 55 mg sodium — never the weight of the salt it comes from. The
compound spec lives in `formula.js` beside each value so the two can never
drift apart, but nothing renders it: the `data-formula` token grammar resolves
against `mg` and computed `dv` only, and there is no path to `.compound`.

Note that sodium and chloride share one compound entry. 140 mg of sodium
chloride is one input yielding two declared elementals, so summing a compound
column would double-count it. The two totals do not reconcile in any case — the
actives add to 235 mg as compounds and 205 mg as elementals — which is the other
reason no such column exists.

`%DV` is computed, never stored: `round(mg / dv * 100)` against the standard
FDA Daily Values in `formula.js`. Caffeine has no established DV, so it renders
a dagger and the standard footnote.

**Numbers are authored twice on purpose**, the same bargain the bundle prices
make below: the markup carries the correct value so the page is right with
JavaScript off, and `formula.js` overrides it whenever JS runs. On localhost,
section 1b warns in the console about four things — an authored fallback that
disagrees with `formula.js`, a compound weight that has leaked into the page, a
retired compound name still sitting in the copy, and JSON-LD that has drifted.
That warning is what keeps "authored twice" from decaying into "wrong in one of
seven files".

Potassium and magnesium are listed as present and never headlined. At 13 mg and
12 mg they will not support a "full electrolyte blend" claim, so the site does
not make one — `lead` and `quiet` in `formula.js` record which is which. That is
a copy strategy rather than a magnitude ranking: magnesium's 3% DV now runs ahead
of sodium's 2%, and sodium still leads because sweat loss is what the product is
for.

## The sticky mobile CTA

Below 820 the stylesheet hides `.nav__cta`, so from that width down there was no
call to action in the chrome at all. `.cta-bar` is what stands in for it, and it
exists **only** in that range: the base rule is `display:none` and the 820 query
is what turns it on. Those two halves are one decision — change the breakpoint
and you must change both, or the page has two CTAs or none.

It is deliberately **not** part of `.nav`. `main.js` measures `nav.offsetHeight`
into `--nav-h`, and that drives every card's top padding and every `[id]`'s
`scroll-margin-top`, so anything added inside the nav shell would relayout the
entire card stack.

Visibility is a class set from `updateScroll()` inside the existing rAF loop —
no second scroll listener. Under `prefers-reduced-motion` that loop is never
started, which is why section 22 renders the bar visible outright rather than
waiting for an `.is-on` that would never arrive.

The bar goes off the moment `#capture` arrives **and stays off**. Testing
`bottom > 0` as well would switch it back on for the last sliver of the page,
once capture has scrolled past and only the footer is left — a bar that vanishes
and then reappears at the bottom, over a footer that already carries every link.

## Reviews

`reviews.js` holds seeded reviews behind one `LIVE` flag, and `main.js` section
15 renders them only when it is true. The whole slot — heading included — ships
`hidden`; revealing it is part of the render. An authored-visible heading over an
empty grid is a worse first impression than no section at all.

**The `AggregateRating` is injected, never authored.** Section 15 adds it to the
page's existing `Product` block at render time, so it exists only when `LIVE` is
true and only over reviews actually on the page. Writing it into the static
`<head>` would leave a review-snippet claim with no reviews behind it whenever
the flag is off — a manipulative structured-data signal and grounds for a manual
action — and it would trip the section 1b JSON-LD drift check.

Review text is built with `createElement` and `textContent`, never `innerHTML`.
It is the one string on this site that will eventually come from a member of the
public, and the path it takes should already be safe on the day it stops being a
constant in a file we control.

Do **not** ship the seed copy as real reviews. Fabricated testimony is illegal
under the FTC's rule on fake reviews (16 CFR Part 465), not merely unwise.

## Supplement Facts

`.facts` is a regulated panel and deliberately not `.spec`. Section 13 styles
`.spec` as an editorial table; a Facts panel is a different object, with tight
leading and a rule hierarchy that carries meaning — 7px heavy bar under the
heading, 3px under the column head, 1px between rows. It is sized in px rather
than `clamp()` because it is the one thing on the site that should look the same
everywhere: a reader may be holding it against another tin.

Every number carries a `data-formula` token. `dose.dailyCaffeine` is **computed**
(`caffeine.mg × dose.dailyMax`), never stored — the same bargain `%DV` makes — so
the 6-pouch ceiling and the 240 mg total can never drift apart.

## The prose-link trap

`styles.css` line 140 styles links through a **whitelist of parents**, not a bare
`a{}`. A plain `<p>` inside a `.wrap` on a new page gets the browser default
blue — a ninth color, straight through the eight-color rule. Any new prose
container has to be added to that selector list *and* its `.is-dark` twin on the
line below. This is the easiest way to silently break the brand system.

## Content notes

Pricing mirrors the `PACK_PRICES` object on the live
`takezelyte.com/crispy-mint.html`.

**Shipping is not free**, and the site must never say it is. The claim was
mirrored from the live site and was wrong there too; it was removed from 9
files in one pass. Shipping is calculated at checkout from weight and
destination, and the customer pays return postage on a change-of-mind return.
Prices are quoted ex-shipping everywhere.

| Pack | One Time | Subscribe & Save |
|---|---|---|
| **Pro Pack** — 3 tins | **$33** · $11.00 / tin | **$30** · $10.00 / tin · was $33 · save $3 |
| **Elite Pack** — 5 tins | **$50** · $10.00 / tin · was $55 | **$45** · $9.00 / tin · was $55 · save $10 |

There is no 1-tin SKU; $11.00/tin is simply the one-time base rate.

**Both price sets are authored into the markup and CSS shows one of them** —
`.is-mode-sub` / `.is-mode-one` on the `#bundles` card, `.m-sub` / `.m-one` on
the spans. JS only swaps that one class, so with JavaScript off the authored
subscribe prices still render and the page is never priceless. The toggle is on
all four `#bundles` sections; quoting $30/$45 without it would present a
subscribe-only price as the plain price.

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
- Redeeming the launch codes. They are issued and reserved; nothing spends
  them yet. Both Shopify and Stripe import unique promotion codes in bulk.
- Custom SMTP, before any real volume — see above.
- No `vercel.json`, deliberately. Every internal link is written `shop.html`,
  which Vercel serves directly; `cleanUrls` would 308-redirect all of them,
  including `welcome.html?token_hash=…`. Clean URLs are a site-wide link
  rewrite, not a config flag.
- Real **social** URLs (currently `#`). The legal URLs are now real.
- Confirm the business facts in the legal pages — state of incorporation,
  registered address, governing law, and the two contact inboxes. They are
  plausible placeholders, marked in an HTML comment at the top of each page,
  and a lawyer should read the documents before launch.
- The tin renders still show the **old** formula on the label
  (`NA 45 / K 21 / MG 3.75 / CAF 50`). The site says 55 / 13 / 12 / 40, so the
  artwork and the copy disagree. New renders are needed before launch.
- **Short-viewport card fit.** A pinned `.stack__item` supplies exactly one
  screen of scroll, but `.stack__card` can be taller than that, and then the
  next card clips it. Cards that can never fit take `.stack__item--flow`
  (flavors, athletes, bundles, founder, the FAQ list, the wide tables). What
  is left is height-dependent and unfixed:

  | | overflow |
  |---|---|
  | 1440×900, 1440×800, 393×852 | none |
  | 1280×720 | `shop #whats-in` +13 |
  | 1024×768 | `index` +57/+98, `shop` +79, `science` +24 |
  | 375×667 | `index #cat-h` +128, `science #buccal` +145, `#capture` +7 on every page |

  All of these predate the product pages and every one is far smaller than it
  was — at 375×667 `index` alone used to overflow five cards, the worst by
  670px. The real fix is making `--sec` height-aware, which changes vertical
  rhythm on every section site-wide.
