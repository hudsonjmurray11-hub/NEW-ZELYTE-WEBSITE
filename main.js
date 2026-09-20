/* ==========================================================================
   ZELYTE — main.js (v2)
   Shared by all thirteen pages. No libraries. One IntersectionObserver for
   reveals, one requestAnimationFrame loop for everything scroll-linked.
   Every page-specific block is gated on its elements existing.

   Accounts live in auth.js, which the six account pages load alongside this.
   Credentials for both come from config.js.

     1. Helpers + reduced motion      8. Scroll: timeline, the pan, the tin
     1b. Formula: hydrate + drift     9. Counters
     2. Nav height                   10. Magnetic buttons
     2b. Sticky mobile CTA           11. Mono scramble
     3. Loader                       12. The rAF loop
     4. Reveals                      12b. One time / Subscribe & save
     5. Mobile menu                  13. Email capture
     6. The orbit                    13b. Waitlist popup
     7. Card stack                   14. Pouch stacking
                                     15. Reviews (reviews.js, flag-gated)
   ========================================================================== */
(function () {
  'use strict';

  /* 1. HELPERS ------------------------------------------------------------ */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var STRIKE = 'M207.5,754.0 L35.0,753.5 L139.0,632.5 L248.0,508.5 L263.0,489.5 L0.5,489.0 L0.0,487.5 L214.0,267.5 L323.0,152.5 L342.0,130.5 L129.5,130.0 L1.0,0.5 L495.5,0.0 L509.5,3.0 L519.5,8.0 L530.5,16.0 L542.0,29.5 L548.0,40.5 L550.0,51.5 L552.0,54.5 L552.0,75.5 L550.0,79.5 L548.0,90.5 L543.0,100.5 L527.0,122.5 L484.0,171.5 L371.0,292.5 L308.0,357.5 L320.5,359.0 L546.5,358.0 L550.0,359.5 Z';

  function strikeSvg(cls, z) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 552 754');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.setAttribute('class', cls);
    if (z !== undefined) s.style.transform = 'translateZ(' + z.toFixed(2) + 'px)';
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', STRIKE);
    s.appendChild(p);
    return s;
  }


  /* 1b. FORMULA — HYDRATE + DRIFT CHECK ------------------------------------
     formula.js is the single source of truth. Every formula number in the
     markup is authored as the correct value AND carries a data-formula token;
     this block overwrites the authored text from formula.js on load.

     Why author it twice. The same reason both price sets are in the markup at
     section 12b: with JavaScript off the page still has to be right. Empty
     spans would leave the spec tables blank. So the markup carries the value
     as a fallback and this block makes formula.js authoritative whenever JS
     runs — and, on localhost, warns about any fallback that has drifted out of
     agreement with it. That warning is the thing that keeps "authored twice"
     from decaying into "wrong in one of fourteen files".

     Compound weights are unreachable from here on purpose. The token grammar
     resolves against `mg` and computed `dv` only; there is no path to
     `.compound`. checkDrift additionally scans the rendered page for a
     compound weight and complains if one has leaked in by hand.

     Runs before section 9, which zeroes every [data-count] and animates it to
     its data-count target — so the targets have to be correct before it does.
     ---------------------------------------------------------------------- */
  var F = window.ZELYTE_FORMULA || null;

  /* Elemental milligrams for `key` at `n` pouches. Always an integer: every
     per-pouch value is an integer and n is 1..6. */
  function mgOf(key, n) {
    var item = F.perPouch[key];
    return item ? item.mg * (n || 1) : null;
  }

  /* %DV computed from the Daily Value basis, never stored. Caffeine has no
     established DV, so it gets the dagger and the standard footnote. */
  function dvPct(key, n) {
    var item = F.perPouch[key];
    if (!item || item.dv == null) return '†';
    return Math.round(mgOf(key, n) / item.dv * 100) + '%';
  }

  /* "70 mg" everywhere prose and tables read; "70mg" where the site's own
     typographic habit is tight, as in the marquee and the pan panels. */
  function mgText(key, n, compact) {
    return mgOf(key, n) + (compact ? 'mg' : ' mg');
  }

  /* data-formula token grammar. Nothing here reaches .compound. */
  function resolveToken(token, compact) {
    var bits = token.split('.');
    var key = bits[0], field = bits[1];
    if (key === 'dose') {
      if (field === 'range') return F.dose.min + '–' + F.dose.max;
      if (field === 'daily') return String(F.dose.dailyMax);
      /* DERIVED, never stored — the same bargain %DV makes. The Facts panel
         has to state the caffeine a reader hits at the daily ceiling, and
         storing that number would let it drift from the two it comes from.
         Computed, it cannot: change dailyMax or caffeine.mg and this follows. */
      if (field === 'dailyCaffeine') return String(F.perPouch.caffeine.mg * F.dose.dailyMax);
      return null;
    }
    if (key === 'perTin') return String(F.perTin);
    if (!F.perPouch[key]) return null;
    if (field === 'mg') return mgText(key, 1, compact);
    if (field === 'dv') return dvPct(key, 1);
    if (field === 'label') return F.perPouch[key].label;
    if (field === 'role') return F.perPouch[key].role;
    return null;
  }

  var DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) ||
            location.protocol === 'file:';

  function warn(msg) { if (DEV && window.console) console.warn('[ZELYTE formula] ' + msg); }

  /* The three ways this can go wrong, all dev-only, all noisy on purpose. */
  function checkDrift(drifted) {
    var i;

    /* 1. An authored fallback disagrees with formula.js. */
    for (i = 0; i < drifted.length; i++) {
      warn('markup says "' + drifted[i].was + '" but formula.js says "' +
           drifted[i].now + '" for ' + drifted[i].token + '. Fix the markup.');
    }

    var text = document.body ? (document.body.innerText || document.body.textContent || '') : '';

    /* 2. A compound weight has been hand-typed into the page. Elemental only,
          everywhere — the compound spec is internal. */
    F.order.forEach(function (key) {
      var c = F.perPouch[key].compound;
      if (!c) return;
      var n = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var near = '[^.]{0,24}';
      if (new RegExp(c.mg + '\\s*mg' + near + n, 'i').test(text) ||
          new RegExp(n + near + c.mg + '\\s*mg', 'i').test(text)) {
        warn('a compound weight is rendering: "' + c.mg + ' mg ' + c.name +
             '". The site declares elemental values only.');
      }
    });

    /* 3. A retired compound is still named somewhere. Caffeine anhydrous used
          to be on this list; it is a current ingredient again, and check 2
          above now guards it automatically because caffeine has a compound
          entry. These two are the ones the formula genuinely left behind. */
    ['potassium chloride', 'magnesium malate'].forEach(function (old) {
      if (text.toLowerCase().indexOf(old) > -1) {
        warn('"' + old + '" is still on this page. It is not in build ' + F.build + '.');
      }
    });

    /* 4. The JSON-LD disagrees with formula.js. It is authored statically —
          crawlers should not have to run JS to see it — which means it can
          drift exactly like the markup can, so it gets checked the same way. */
    $$('script[type="application/ld+json"]').forEach(function (node) {
      var doc;
      try { doc = JSON.parse(node.textContent); }
      catch (e) { warn('JSON-LD does not parse: ' + e.message); return; }
      var props = doc.additionalProperty;
      if (!props || !props.length) return;
      props.forEach(function (p) {
        var key = null;
        F.order.forEach(function (k) { if (F.perPouch[k].label === p.name) key = k; });
        if (!key) return;
        if (p.value !== mgOf(key, 1)) {
          warn('JSON-LD says ' + p.name + ' is ' + p.value + ' mg but formula.js says ' +
               mgOf(key, 1) + ' mg.');
        }
        var pct = p.valueReference && p.valueReference.value;
        if (pct != null && pct + '%' !== dvPct(key, 1)) {
          warn('JSON-LD says ' + p.name + ' is ' + pct + '% DV but formula.js computes ' +
               dvPct(key, 1) + '.');
        }
      });
    });
  }

  if (F) {
    var drift = [];

    $$('[data-formula]').forEach(function (el) {
      var token = el.dataset.formula;
      var value = resolveToken(token, el.dataset.fmt === 'compact');
      if (value === null) { warn('unknown data-formula token "' + token + '"'); return; }
      var authored = el.textContent.trim();
      if (authored && authored !== value) drift.push({ token: token, was: authored, now: value });
      el.textContent = value;
    });

    /* The stacking table's cells belong to section 14, which renders them from
       formula.js. Their authored text is the no-JS fallback, so it still has to
       agree — and it is checked here rather than there because at this point
       section 14 has not run and the authored text is still in the DOM. */
    $$('[data-dose]').forEach(function (cell) {
      var key = cell.dataset.dose;
      if (!F.perPouch[key]) { warn('unknown data-dose key "' + key + '"'); return; }
      var value = cell.dataset.doseField === 'dv' ? dvPct(key, 1) : mgText(key, 1);
      var authored = cell.textContent.trim();
      if (authored && authored !== value) {
        drift.push({ token: key + ' (dose table)', was: authored, now: value });
      }
    });

    /* Counter targets, set before section 9 reads them. The visible text is
       left alone here — section 9 owns it from this point. */
    $$('[data-formula-count]').forEach(function (el) {
      var key = el.dataset.formulaCount;
      if (!F.perPouch[key]) { warn('unknown data-formula-count key "' + key + '"'); return; }
      var mg = String(mgOf(key, 1));
      if (el.dataset.count && el.dataset.count !== mg) {
        drift.push({ token: key + '.mg (data-count)', was: el.dataset.count, now: mg });
      }
      el.dataset.count = mg;
      el.dataset.suffix = 'mg';
    });

    if (DEV) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { checkDrift(drift); });
      } else {
        checkDrift(drift);
      }
    }
  }


  /* 2. NAV HEIGHT --------------------------------------------------------- */
  var nav = $('#nav');
  function measureNav() {
    if (nav) root.style.setProperty('--nav-h', nav.offsetHeight + 'px');
  }
  measureNav();
  if (window.ResizeObserver && nav) new ResizeObserver(measureNav).observe(nav);


  /* 2b. STICKY MOBILE CTA -------------------------------------------------
     Below 820 the stylesheet hides .nav__cta, so this bar is the only CTA in
     the chrome. It shows once the first card is behind you and hides again
     over the page's own #capture — a "join the list" bar floating on top of
     the actual signup form is noise, not a conversion.

     Visibility is a class, and the class is set from updateScroll() inside the
     existing rAF loop. No second scroll listener: section 12 is deliberately
     the only one on the page, and under reduced motion it is never registered
     at all — which is why CSS section 22 renders the bar visible outright
     rather than waiting for an .is-on that would never arrive.

     Nothing here reads window.innerWidth. The bar's existence is a CSS media
     query and JS does not duplicate that decision; toggling a class on a
     display:none element is free and cannot disagree with the breakpoint.
     ---------------------------------------------------------------------- */
  var ctaBar = $('#cta-bar');
  var ctaAnchor = $('#main .stack__item');       // the hero slot
  var ctaHide = $('#capture');

  function updateCtaBar() {
    if (!ctaBar) return;
    var on = true;

    /* Past the hero. offsetHeight (not innerHeight) so a --flow hero, which
       is shorter than a screen, still resolves at its own real bottom. */
    if (ctaAnchor) {
      var r = ctaAnchor.getBoundingClientRect();
      on = r.bottom < window.innerHeight * 0.6;
    }
    /* Off from the moment the capture card arrives, and it stays off. Testing
       `bottom > 0` as well would switch it back on for the last sliver of the
       page, once capture has scrolled past and only the footer is left — a bar
       that vanishes and then reappears at the very bottom, over a footer that
       already carries every link. Reaching the signup form is the end of the
       bar's job. */
    if (on && ctaHide && ctaHide.getBoundingClientRect().top < window.innerHeight) {
      on = false;
    }
    ctaBar.classList.toggle('is-on', on);
    /* Inert to the keyboard and to AT while it is off screen, so tabbing does
       not land on an invisible button. visibility:hidden already handles this
       in browsers that support inert; this covers the rest. */
    ctaBar.setAttribute('aria-hidden', on ? 'false' : 'true');
    var btn = $('a,button', ctaBar);
    if (btn) btn.tabIndex = on ? 0 : -1;
  }


  /* 3. LOADER -------------------------------------------------------------
     Blank asphalt, the Strike turns exactly one revolution and lands where
     it started, then the page fades up. Plays on EVERY page load.
     ---------------------------------------------------------------------- */
  var loader = $('#loader');
  var loaderMark = $('#loader-mark');

  /* Callbacks that must not start counting until the page is actually visible.
     Section 13b's five-second timer is the reason this exists: started at parse
     it would spend most of its wait behind a black overlay. */
  var onPageReady = [];

  function revealPage() {
    root.classList.add('is-ready');
    if (loader) loader.classList.add('is-done');
    onPageReady.forEach(function (fn) { fn(); });
    onPageReady.length = 0;
  }

  function buildExtrusion(host, layers, depthRatio) {
    var h = host.clientHeight || host.parentNode.clientHeight;
    if (!h) return;
    var depth = h * depthRatio;
    host.textContent = '';
    for (var i = 0; i < layers; i++) {
      var z = -depth / 2 + depth * (i / (layers - 1));
      host.appendChild(strikeSvg(
        'mark3d__l' + (i === 0 || i === layers - 1 ? ' mark3d__l--face' : ''), z));
    }
  }

  if (!loader || reduced) {
    if (loader) loader.parentNode.removeChild(loader);
    revealPage();
  } else {
    buildExtrusion(loaderMark, 12, 0.18);
    var LOAD_MS = 1100;
    var start = null;
    // easeInOutCubic-ish: decisive, settles cleanly on the start angle.
    var ease = function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
    (function spin(now) {
      if (start === null) start = now;
      var t = clamp((now - start) / LOAD_MS, 0, 1);
      loaderMark.style.setProperty('--ry', (ease(t) * 360).toFixed(2) + 'deg');
      if (t < 1) { requestAnimationFrame(spin); return; }
      loaderMark.style.setProperty('--ry', '0deg');   // land exactly where it began
      revealPage();
      setTimeout(function () {
        if (loader && loader.parentNode) loader.parentNode.removeChild(loader);
      }, 400);
    })(performance.now());
  }


  /* 4. REVEALS ------------------------------------------------------------ */
  var reveals = $$('.reveal');
  var seen = new Map();
  reveals.forEach(function (el) {
    var p = el.parentNode, i = seen.get(p) || 0;
    el.style.setProperty('--i', i);
    seen.set(p, i + 1);
  });

  var onReveal = [];        // callbacks keyed to an element entering view
  if (reduced || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        onReveal.forEach(function (fn) { fn(e.target); });
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px', threshold: 0.01 });
    reveals.forEach(function (el) { io.observe(el); });
  }


  /* 5. MOBILE MENU -------------------------------------------------------- */
  var toggle = $('#menu-toggle');
  var menu = $('#menu');
  var lastFocus = null;
  function focusables() {
    return $$('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', menu);
  }
  function openMenu() {
    lastFocus = document.activeElement;
    menu.hidden = false;
    document.body.classList.add('menu-open');
    toggle.setAttribute('aria-expanded', 'true');
    toggle.setAttribute('aria-label', 'Close menu');
    var f = focusables(); if (f.length) f[0].focus();
  }
  function closeMenu() {
    menu.hidden = true;
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    if (lastFocus) lastFocus.focus();
  }
  if (toggle && menu) {
    toggle.addEventListener('click', function () { menu.hidden ? openMenu() : closeMenu(); });
    menu.addEventListener('click', function (e) { if (e.target.tagName === 'A') closeMenu(); });
    document.addEventListener('keydown', function (e) {
      if (menu.hidden) return;
      if (e.key === 'Escape') { closeMenu(); return; }
      if (e.key !== 'Tab') return;
      var f = focusables(); if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }


  /* 5b. MARQUEE -----------------------------------------------------------
     The authored markup held two groups of six and the animation shifted by
     -50%, i.e. exactly one group. One group measures ~982px but the card is
     ~1412px at 1440, so ~430px of empty track was on screen at the end of
     every cycle — the words visibly ran out. That was the "stopping".

     Clone the authored group until the track is wider than two viewports and
     translate by one group's MEASURED width instead of a percentage, so the
     loop is seamless at any window size and the speed no longer depends on it.
     ---------------------------------------------------------------------- */
  var SPEED = 60;   // px per second, viewport-independent
  $$('.marquee').forEach(function (wrap) {
    var track = $('.marquee__track', wrap);
    if (!track) return;
    var group = track.dataset.group || track.innerHTML;
    track.dataset.group = group;

    function build() {
      track.innerHTML = group;
      var gw = track.scrollWidth;                 // one group, measured
      if (!gw) return;
      var copies = Math.ceil((wrap.clientWidth * 2) / gw) + 1;
      track.innerHTML = new Array(copies + 1).join(group);
      track.style.setProperty('--group', gw + 'px');
      track.style.animationDuration = (gw / SPEED).toFixed(2) + 's';
    }
    build();

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(build, 220);
    }, { passive: true });
  });


  /* 6. THE ORBIT ----------------------------------------------------------
     Five rings around the tin, alternating direction, pouches shrinking and
     fading the farther out they travel.

     Radius and pouch width are written in PIXELS because a percentage inside
     translateY() resolves against the zero-height slot, not the container.

     Pouches are TANGENTIAL: the slot's rotate(--a) already turns its local
     frame to the tangent, so an image with no counter-rotation lies flat at
     the top of the circle and stands on its side at the left and right, its
     angle changing continuously as it travels. Dropping the old counter-spin
     wrapper also cut the animation count from ~41 to one per ring.

       ring (spins) > slot (rotate + push out) > img
     ---------------------------------------------------------------------- */
  /* w is a fraction of the orbit box, so the pouches scale with the layout.
     Radii and counts are unchanged, so shrinking w also widens the visible arc
     gap between neighbours. */
  var RINGS = [
    { r: 0.200, n: 6,  w: 0.040, dur: 44,  rev: false, o: 1    },
    { r: 0.275, n: 9,  w: 0.033, dur: 62,  rev: true,  o: 0.62 },
    { r: 0.350, n: 12, w: 0.028, dur: 84,  rev: false, o: 0.40 },
    { r: 0.425, n: 15, w: 0.024, dur: 110, rev: true,  o: 0.26 },
    { r: 0.495, n: 18, w: 0.020, dur: 140, rev: false, o: 0.16 }
  ];
  var orbit = $('#orbit');

  function buildOrbit() {
    if (!orbit) return;
    var W = orbit.clientWidth;
    if (!W) return;
    $$('.orbit__ring', orbit).forEach(function (n) { n.parentNode.removeChild(n); });
    var tin = $('.orbit__tin', orbit);

    // The two outermost rings are illegible on a phone and would cost 33
    // nodes for nothing, so they are simply not built there.
    var rings = window.innerWidth < 640 ? RINGS.slice(0, 3) : RINGS;

    rings.forEach(function (cfg) {
      var ring = document.createElement('div');
      ring.className = 'orbit__ring' + (cfg.rev ? ' orbit__ring--rev' : '');
      ring.setAttribute('aria-hidden', 'true');
      ring.style.setProperty('--dur', cfg.dur + 's');
      ring.style.opacity = cfg.o;

      var w = (W * cfg.w).toFixed(1) + 'px';
      var r = (W * cfg.r).toFixed(1) + 'px';

      for (var i = 0; i < cfg.n; i++) {
        var slot = document.createElement('div');
        slot.className = 'orbit__slot';
        slot.style.setProperty('--a', ((360 / cfg.n) * i).toFixed(2) + 'deg');
        slot.style.setProperty('--r', r);

        var img = document.createElement('img');
        img.src = 'assets/img/pouch.webp';
        img.alt = '';
        img.width = 260; img.height = 100;
        img.decoding = 'async';
        img.style.setProperty('--w', w);

        slot.appendChild(img);
        ring.appendChild(slot);
      }
      orbit.insertBefore(ring, tin);
    });
  }

  if (orbit) {
    buildOrbit();
    var reOrbit;
    window.addEventListener('resize', function () {
      clearTimeout(reOrbit);
      reOrbit = setTimeout(buildOrbit, 220);
    }, { passive: true });
  }


  /* 7. CARD STACK ---------------------------------------------------------- */
  var stackItems = $$('.stack__item').filter(function (el) {
    return !el.classList.contains('stack__item--flow');
  });

  function updateStack() {
    for (var i = 0; i < stackItems.length; i++) {
      var card = $('.stack__card', stackItems[i]);
      if (!card) continue;
      var next = stackItems[i].nextElementSibling;
      if (!next) { card.style.transform = ''; card.style.opacity = ''; continue; }
      // How much of the viewport the incoming section has claimed.
      var cover = clamp((window.innerHeight - next.getBoundingClientRect().top) / window.innerHeight, 0, 1);
      card.style.transform = 'scale(' + (1 - 0.06 * cover).toFixed(4) + ')';
      card.style.opacity = (1 - 0.5 * cover).toFixed(3);
    }
  }


  /* 8. SCROLL — PAGE PROGRESS, 25:00 TIMELINE, THE PAN, THE PRODUCT TIN ---- */
  var progressFill = $('#scroll-progress .split__fill');
  var progressEl = $('#scroll-progress');
  var how = $('#how-item') || $('#how-it-works');
  var howFill = $('#how-fill');
  var howClock = $('#how-clock');
  var stages = $$('#how-stages .stage');
  var tin = $('.orbit__tin');
  var lastPct = -1;

  // Product pages only. Every one of these is null elsewhere, and each block
  // below is gated on that, so the other five pages run exactly as before.
  var panItem = $('#pan-item');
  var panTrack = $('#pan-track');
  var panFill = $('#pan-fill');
  var panStep = $('#pan-step');
  var pdpHero = $('#pdp-hero');
  var pdpTin = $('#pdp-tin');
  var lastStep = -1;

  function mmss(sec) {
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateScroll() {
    var y = window.pageYOffset;
    if (nav) nav.classList.toggle('is-stuck', y > 8);

    var max = root.scrollHeight - window.innerHeight;
    var p = max > 0 ? clamp(y / max, 0, 1) : 0;
    if (progressFill) progressFill.style.setProperty('--p', p.toFixed(4));
    var pct = Math.round(p * 100);
    if (pct !== lastPct && progressEl) { progressEl.setAttribute('aria-valuenow', pct); lastPct = pct; }

    if (how && howFill) {
      var r = how.getBoundingClientRect();
      var span = how.offsetHeight - window.innerHeight;
      var hp = span > 0 ? clamp(-r.top / span, 0, 1) : 0;
      howFill.style.setProperty('--p', hp.toFixed(4));
      if (howClock) howClock.textContent = mmss(hp * 25 * 60);
      for (var i = 0; i < stages.length; i++) {
        stages[i].classList.toggle('is-on', hp >= parseFloat(stages[i].dataset.at));
      }
    }

    // The tin turns slowly with the page — the orbit's only scroll-linked part.
    if (tin) tin.style.setProperty('--tin-rot', (y * 0.02).toFixed(2) + 'deg');

    /* THE PAN — scrolling down drives the panel row sideways. Same progress
       math as the 25:00 timeline above: how far the pinned item has travelled
       through its own extra height. Translating by the MEASURED remaining
       width rather than a percentage is what guarantees the last panel lands
       flush at p=1 with no dead run — the mistake the marquee used to make. */
    if (panItem && panTrack) {
      var pr = panItem.getBoundingClientRect();
      var pspan = panItem.offsetHeight - window.innerHeight;
      var pp = pspan > 0 ? clamp(-pr.top / pspan, 0, 1) : 0;
      var travel = Math.max(panTrack.scrollWidth - panTrack.parentNode.clientWidth, 0);
      panTrack.style.transform = 'translate3d(' + (-travel * pp).toFixed(1) + 'px,0,0)';
      if (panFill) panFill.style.setProperty('--p', pp.toFixed(4));
      if (panStep) {
        var step = clamp(Math.floor(pp * panTrack.children.length) + 1, 1, panTrack.children.length);
        if (step !== lastStep) {
          panStep.textContent = (step < 10 ? '0' : '') + step;
          lastStep = step;
        }
      }
    }

    /* The product hero's tin, scoped to the hero's OWN exit rather than the
       whole page, so it reads as one deliberate quarter-turn instead of a
       drift that never resolves. */
    if (pdpHero && pdpTin) {
      var hp = clamp(-pdpHero.getBoundingClientRect().top / window.innerHeight, 0, 1);
      pdpTin.style.setProperty('--tin-rot', (hp * 90).toFixed(2) + 'deg');
      pdpTin.style.setProperty('--tin-y', (hp * -60).toFixed(1) + 'px');
      pdpTin.style.setProperty('--tin-s', (1 - hp * 0.12).toFixed(4));
    }

    updateCtaBar();
    updateStack();
  }


  /* 9. COUNTERS ------------------------------------------------------------ */
  function runCounter(el) {
    var to = parseFloat(el.dataset.count);
    if (isNaN(to)) return;
    var isTime = el.dataset.format === 'time';
    var dur = 900, t0 = null;
    (function step(now) {
      if (t0 === null) t0 = now;
      var t = clamp((now - t0) / dur, 0, 1);
      var v = to * (1 - Math.pow(1 - t, 3));
      el.textContent = isTime ? mmss(v) : Math.round(v) + (el.dataset.suffix || '');
      if (t < 1) requestAnimationFrame(step);
    })(performance.now());
  }
  var counters = $$('[data-count]');
  if (reduced) {
    counters.forEach(function (el) {
      el.textContent = el.dataset.format === 'time'
        ? mmss(parseFloat(el.dataset.count))
        : el.dataset.count + (el.dataset.suffix || '');
    });
  } else {
    counters.forEach(function (el) { el.textContent = el.dataset.format === 'time' ? '00:00' : '0'; });
    onReveal.push(function (target) {
      $$('[data-count]', target).forEach(runCounter);
      if (target.hasAttribute('data-count')) runCounter(target);
    });
  }


  /* 10. MAGNETIC BUTTONS --------------------------------------------------- */
  if (!reduced && window.matchMedia('(hover: hover)').matches) {
    $$('.btn').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        var dx = clamp((e.clientX - (r.left + r.width / 2)) / r.width, -0.5, 0.5) * 12;
        var dy = clamp((e.clientY - (r.top + r.height / 2)) / r.height, -0.5, 0.5) * 8;
        b.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      });
      b.addEventListener('pointerleave', function () { b.style.transform = ''; });
    });
  }


  /* 11. MONO SCRAMBLE ------------------------------------------------------ */
  if (!reduced) {
    var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/·';
    onReveal.push(function (target) {
      if (!target.classList.contains('scramble')) return;
      var final = target.dataset.text || target.textContent;
      target.dataset.text = final;
      var dur = 420, t0 = null;
      (function step(now) {
        if (t0 === null) t0 = now;
        var t = clamp((now - t0) / dur, 0, 1);
        var keep = Math.floor(final.length * t);
        var out = final.slice(0, keep);
        for (var i = keep; i < final.length; i++) {
          out += final[i] === ' ' ? ' ' : CHARS[(Math.random() * CHARS.length) | 0];
        }
        target.textContent = out;
        if (t < 1) requestAnimationFrame(step); else target.textContent = final;
      })(performance.now());
    });
  }


  /* 12. THE rAF LOOP ------------------------------------------------------- */
  if (reduced) {
    if (progressFill) progressFill.style.setProperty('--p', 0);
    if (howFill) howFill.style.setProperty('--p', 1);
    if (howClock) howClock.textContent = '25:00';
    stages.forEach(function (s) { s.classList.add('is-on'); });
  } else {
    var dirty = true;
    var soil = function () { dirty = true; };
    window.addEventListener('scroll', soil, { passive: true });
    window.addEventListener('resize', soil, { passive: true });
    // updateScroll only runs while dirty, and the pan's travel distance is
    // measured inside it — so a measurement taken before layout settled would
    // stick until the next scroll. Re-dirty on load and whenever the pan's box
    // changes, the same way buildOrbit re-measures.
    window.addEventListener('load', soil);
    if (window.ResizeObserver) {
      var pan = $('#pan');
      if (pan) new ResizeObserver(soil).observe(pan);
    }
    (function frame() {
      requestAnimationFrame(frame);
      if (!dirty) return;
      dirty = false;
      updateScroll();
    })();
    updateScroll();
  }


  /* 14. POUCH STACKING -----------------------------------------------------
     A pouch is not a fixed dose. The control scales the session to the effort:
     press 2 and every elemental value recomputes, live.

     ELEMENTAL ONLY. mgOf multiplies what the pouch delivers. Compound weights
     are never multiplied and never shown — three pouches is 165 mg of sodium,
     not "420 mg of sodium chloride", and the second number would be both
     meaningless to a reader and wrong to print.

     No animation frame. This is click- and key-driven, and it writes
     textContent directly. The one persistent rAF loop is section 12's and it
     stays that way.

     Values are authored into the markup at n=1, so with JS off the table is a
     correct per-pouch panel and the directions still read. The control simply
     is not there to press.
     ---------------------------------------------------------------------- */
  $$('.dose').forEach(function (dose) {
    if (!F) return;
    var tiles = $$('.plus__tile', dose);
    var cells = $$('[data-dose]', dose);
    var live = $('[data-dose-live]', dose);
    var countEl = $('[data-dose-n]', dose);
    var unitEl = $('[data-dose-unit]', dose);
    if (!tiles.length || !cells.length) return;

    function render(n, announce) {
      cells.forEach(function (cell) {
        var key = cell.dataset.dose;
        if (!F.perPouch[key]) return;
        cell.textContent = cell.dataset.doseField === 'dv'
          ? dvPct(key, n)
          : mgText(key, n);
      });
      if (countEl) countEl.textContent = String(n);
      if (unitEl) unitEl.textContent = n === 1 ? 'pouch' : 'pouches';

      /* One sentence, not the whole table. An aria-live region wrapped around
         five rows re-reads every label and header on each press, which
         punishes the reader for using the control. The two values the copy
         leads with are the two worth hearing.

         Silent on the initial render: the reader has not pressed anything yet,
         and a live region that speaks on page load is a bug, not a feature. */
      if (live && announce) {
        live.textContent = n + (n === 1 ? ' pouch' : ' pouches') + ' per session. ' +
          F.perPouch.sodium.label + ' ' + mgText('sodium', n) + ', ' +
          F.perPouch.caffeine.label + ' ' + mgText('caffeine', n) + '.';
      }
    }

    /* Render once from formula.js rather than trusting the authored markup, so
       the table matches every other number on the page. Section 1b has already
       compared that markup against formula.js and reported any disagreement. */
    var start = tiles.filter(function (t) { return t.getAttribute('aria-pressed') === 'true'; })[0];
    render(parseInt((start || tiles[0]).dataset.pouches, 10) || 1, false);

    function select(tile) {
      tiles.forEach(function (t) {
        var on = t === tile;
        t.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      render(parseInt(tile.dataset.pouches, 10) || 1, true);
    }

    dose.addEventListener('click', function (e) {
      var hit = e.target.closest('.plus__tile');
      if (hit) select(hit);
    });

    /* Enter and Space come free with <button>. Arrow keys, Home and End do
       not, and a three-stop control is exactly where a reader expects them. */
    dose.addEventListener('keydown', function (e) {
      var i = tiles.indexOf(document.activeElement);
      if (i < 0) return;
      var to = -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (i + 1) % tiles.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (i - 1 + tiles.length) % tiles.length;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = tiles.length - 1;
      if (to < 0) return;
      e.preventDefault();
      tiles[to].focus();
      select(tiles[to]);
    });
  });


  /* 12b. ONE TIME / SUBSCRIBE & SAVE --------------------------------------
     Both price sets are in the markup; a class on the owning card decides
     which one CSS shows. With JS off the authored .is-mode-sub stands and the
     subscribe prices render, so the page is never priceless.
     ---------------------------------------------------------------------- */
  $$('.mode').forEach(function (group) {
    var card = group.closest('.stack__card');
    if (!card) return;
    var btns = $$('.mode__btn', group);
    group.addEventListener('click', function (e) {
      var hit = e.target.closest('.mode__btn');
      if (!hit) return;
      var sub = hit.dataset.mode === 'sub';
      card.classList.toggle('is-mode-sub', sub);
      card.classList.toggle('is-mode-one', !sub);
      btns.forEach(function (b) {
        var on = b === hit;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    });
  });


  /* 13. EMAIL CAPTURE =====================================================
     Anonymous launch-list capture. A duplicate submit (409, or Postgres
     23505) is a success, because being on the list twice is the same as
     being on it once.

     Credentials come from config.js, the one file that carries them, shared
     with auth.js so they are never written down twice. Until it is filled in
     this still validates, shows its success state and logs to the console.

     This stays here rather than moving into auth.js: the anonymous form has
     to keep working if auth.js fails to load, it needs no session, and it is
     wired to markup on six pages that auth.js never visits.
     ---------------------------------------------------------------------- */
  var CFG = window.ZELYTE_CONFIG || {};
  var SUPABASE_URL = String(CFG.SUPABASE_URL || '').replace(/\/+$/, '');
  var SUPABASE_ANON_KEY = String(CFG.SUPABASE_ANON_KEY || '');

  /* `flavor` is null whenever the form has no picker or nobody picked, and the
     column is nullable for exactly that reason — see sql/launch_signups_flavor.sql.
     `source` separates popup signups from the inline sections so the popup's
     value is measurable rather than assumed. */
  function saveEmail(email, flavor, source) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[ZELYTE] Email capture is stubbed — no Supabase credentials set. Captured:', email, flavor || '(no flavor)');
      return Promise.resolve({ stubbed: true });
    }
    return fetch(SUPABASE_URL + '/rest/v1/launch_signups', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        email: email,
        flavor: flavor || null,
        source: source || 'marketing-site'
      })
    }).then(function (res) {
      if (res.ok || res.status === 409) return { ok: true };
      return res.json().catch(function () { return {}; }).then(function (b) {
        if (b && b.code === '23505') return { ok: true };   // already on the list
        throw new Error(b && b.message ? b.message : 'Request failed');
      });
    });
  }

  /* The selected flavor card is a class, toggled the same way auth.js does it
     at its own paintPicks, rather than :has() — which this stylesheet uses
     nowhere. DUPLICATED from auth.js on purpose: auth.js loads only on the six
     account pages and never visits the eight marketing pages this runs on, so
     sharing it would mean loading an account bundle everywhere to paint a
     border. `.pick:focus-within` already covers the keyboard; this is what
     covers the pointer. */
  function paintPicks(form) {
    $$('input[name="flavor"]', form).forEach(function (radio) {
      var card = radio.closest('.pick');
      if (card) card.classList.toggle('is-on', radio.checked);
    });
  }

  /* Wiring lives in a named function rather than inside the forEach because
     the popup (13b) builds its form after this sweep has already run and needs
     the identical path — validation, duplicate handling, the stubbed branch and
     the redirect. Calling it explicitly there removes the ordering question
     instead of depending on when the DOM node happens to appear. */
  function wireSignup(form) {
    var input = $('input[type="email"]', form);
    var btn = $('button[type="submit"]', form);
    var status = document.getElementById(form.dataset.signup);
    var micro = status ? status.textContent : '';

    if (!input || !btn) return;

    function say(msg, kind) {
      if (!status) return;
      status.textContent = msg;
      status.classList.toggle('is-error', kind === 'error');
      status.classList.toggle('is-ok', kind === 'ok');
    }

    /* Product pages ship a `checked` radio, so the border has to be painted
       once up front — not only on the first change. */
    paintPicks(form);
    form.addEventListener('change', function (e) {
      if (e.target.name === 'flavor') paintPicks(form);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = input.value.trim().toLowerCase();
      if (!email || !input.checkValidity()) {
        input.setAttribute('aria-invalid', 'true');
        say('Enter a valid email address.', 'error');
        input.focus();
        return;
      }
      /* Absent picker or nothing picked both give null. Flavor is never
         required: an email with no preference is still a signup, and blocking
         on it would trade real addresses for a field nobody asked for. */
      var picked = $('input[name="flavor"]:checked', form);
      input.removeAttribute('aria-invalid');
      btn.disabled = true;
      say('Submitting…');
      saveEmail(email, picked ? picked.value : null, form.dataset.source).then(function (res) {
        /* A real save earns the confirmation page. The STUBBED path — no
           Supabase credentials in config.js — deliberately does not navigate:
           nothing was stored, and sending a developer to a page that says
           "you're on the list" would be a lie that looks like a working
           feature. It shows the inline success state instead, which is what
           the console warning above is already telling you about.

           A duplicate (409 / 23505) resolves as ok and lands here too. Being
           on the list twice is the same as being on it once, so it gets the
           same page — bouncing a returning visitor to an error would be
           telling them something false about their own signup. */
        if (res && res.stubbed) {
          form.hidden = true;
          say('You are on the list. We will email you once when the first batch ships.', 'ok');
          return;
        }
        /* Recorded BEFORE navigating: this is what stops the popup asking a
           second time on the next visit. Written on every successful signup,
           inline or popup, because someone who joined from #capture should not
           then be popped at either. */
        rememberPopup('signed');
        window.location.assign('waitlist-confirmed.html');
      }).catch(function (err) {
        console.error('[ZELYTE] signup failed:', err);
        btn.disabled = false;
        say('Something went wrong. Please try again.', 'error');
      });
    });

    input.addEventListener('input', function () {
      if (input.getAttribute('aria-invalid') === 'true') {
        input.removeAttribute('aria-invalid');
        say(micro);
      }
    });
  }

  $$('form[data-signup]').forEach(wireSignup);


  /* 13b. WAITLIST POPUP ===================================================
     The same launch-list ask as #capture, for the visitor who leaves before
     ever scrolling that far. One ask, dismissible, remembered — it does not
     come back once it has been answered either way.

     GATED ON `data-waitlist-popup` on <body>, which the eight marketing pages
     carry and nothing else does. An attribute rather than a list of filenames
     in here: adding or removing a page is then a one-attribute edit in that
     page, visible to whoever is editing it, instead of a hidden array in a
     shared file that nobody thinks to look at. It is the same "gated on its
     elements existing" rule every other block here follows.

     BUILT IN JS, like the reviews in section 15, rather than authored into
     eight files. One place to change the copy, and no eighth copy that drifts.
     With JS off nothing appears, which is correct — the form could not submit
     either, so a popup there would be a dead box over the page.
     ---------------------------------------------------------------------- */

  var POPUP_KEY = 'zelyte.waitlist.popup';

  /* Every touch wrapped: Safari in private mode throws on setItem, and a
     storage failure must not take the form down with it. Same bargain auth.js
     makes around its session. */
  function rememberPopup(v) {
    try { localStorage.setItem(POPUP_KEY, v); } catch (e) {}
  }
  function popupAnswered() {
    try {
      var v = localStorage.getItem(POPUP_KEY);
      return v === 'dismissed' || v === 'signed';
    } catch (e) { return false; }
  }

  if (document.body.hasAttribute('data-waitlist-popup') && !popupAnswered()) {
    (function () {
      var wlp = null, panel = null, lastPopupFocus = null, fired = false;
      var captureSection = $('#capture');

      function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text) n.textContent = text;
        return n;
      }

      /* Flavor cards. Ids are prefixed `popup-` because #capture already owns
         `email`/`signup-status` on all six of its pages and account.html owns
         `flavor-mint`/`flavor-cherry`. Duplicate ids break label association
         silently — the inline form's label would start focusing this input. */
      function flavorCard(id, value, name, desc) {
        var label = el('label', 'buy__card pick');
        label.setAttribute('for', id);
        var radio = el('input', 'visually-hidden');
        radio.type = 'radio';
        radio.name = 'flavor';
        radio.id = id;
        radio.value = value;
        label.appendChild(radio);
        label.appendChild(el('h3', 'buy__n', name));
        label.appendChild(el('p', 'pick__d', desc));
        return label;
      }

      function build() {
        wlp = el('div', 'wlp');
        wlp.id = 'waitlist-popup';
        wlp.hidden = true;

        panel = el('div', 'wlp__panel is-dark');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'wlp-h');
        /* Focus lands here, not on the first control. A screen reader then
           hears the dialog and its heading rather than the word "Close", and a
           phone does not throw up a keyboard for a box nobody asked for. */
        panel.setAttribute('tabindex', '-1');

        var close = el('button', 'wlp__x', '×');
        close.type = 'button';
        close.setAttribute('aria-label', 'Close');
        panel.appendChild(close);

        panel.appendChild(el('p', 'eyebrow', 'Launch list'));
        var h = el('h2', 'display wlp__h', 'First batch, fall 2026.');
        h.id = 'wlp-h';
        panel.appendChild(h);
        panel.appendChild(el('p', 'lede', 'Early access and launch details. One email, when it ships.'));

        var form = el('form', 'capture__form');
        form.setAttribute('data-signup', 'popup-status');
        form.setAttribute('data-source', 'popup');
        form.setAttribute('novalidate', '');

        /* INSIDE the form, exactly as the six inline captures have it. As a
           sibling of the form it would look identical and submit nothing:
           wireSignup scopes its flavor lookup to the form, so every popup
           signup would quietly record no preference. */
        var grid = el('div', 'pick__grid');
        grid.appendChild(flavorCard('popup-flavor-mint', 'crispy-mint', 'Crispy Mint',
          'Cool and clean. Stays sharp through a hard effort.'));
        grid.appendChild(flavorCard('popup-flavor-cherry', 'black-cherry', 'Black Cherry',
          'Dark and tart. Rounder, with less bite.'));
        form.appendChild(grid);

        var lab = el('label', 'visually-hidden', 'Email address');
        lab.setAttribute('for', 'popup-email');
        form.appendChild(lab);

        var input = el('input', 'capture__input');
        input.id = 'popup-email';
        input.name = 'email';
        input.type = 'email';
        input.setAttribute('inputmode', 'email');
        input.setAttribute('autocomplete', 'email');
        input.placeholder = 'you@example.com';
        input.required = true;
        form.appendChild(input);

        var submit = el('button', 'btn', 'Get early access');
        submit.type = 'submit';
        form.appendChild(submit);
        panel.appendChild(form);

        var status = el('p', 'capture__micro', 'No spam. One email when the first batch ships.');
        status.id = 'popup-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        panel.appendChild(status);

        wlp.appendChild(panel);
        document.body.appendChild(wlp);

        /* The form is younger than the sweep above, so it is wired by hand. */
        wireSignup(form);

        close.addEventListener('click', function () { closePopup(true); });
        wlp.addEventListener('mousedown', function (e) {
          if (e.target === wlp) closePopup(true);   // backdrop only, never the panel
        });
      }

      /* Same selector as the mobile menu's. The flavor radios are
         .visually-hidden, which is the clip pattern, not display:none — they
         are still focusable and still in the tab order, so leaving them out
         would compute the wrong last element and let Tab walk out of the
         dialog onto the page behind it. */
      function popupFocusables() {
        return $$('a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])', panel);
      }

      function openPopup() {
        if (fired) return;
        /* Re-checked at fire time, not only at setup: the menu can open and
           #capture can scroll into view during the five seconds we waited. */
        if (menu && !menu.hidden) return;
        if (captureSection && inView(captureSection)) return;
        fired = true;
        detach();

        build();
        wlp.hidden = false;
        lastPopupFocus = document.activeElement;
        // Next frame, so the transition has a hidden->shown edge to run on.
        requestAnimationFrame(function () { wlp.classList.add('is-on'); });
        document.body.classList.add('popup-open');
        panel.focus();
      }

      function closePopup(answered) {
        if (!wlp || wlp.hidden) return;
        if (answered) rememberPopup('dismissed');
        wlp.classList.remove('is-on');
        wlp.hidden = true;
        document.body.classList.remove('popup-open');
        if (lastPopupFocus && lastPopupFocus.focus) lastPopupFocus.focus();
      }

      function inView(node) {
        var r = node.getBoundingClientRect();
        return r.top < (window.innerHeight || 0) && r.bottom > 0;
      }

      /* Escape and the tab trap, mirroring the mobile menu in section 5. */
      document.addEventListener('keydown', function (e) {
        if (!wlp || wlp.hidden) return;
        if (e.key === 'Escape') { closePopup(true); return; }
        if (e.key !== 'Tab') return;
        var f = popupFocusables();
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      });

      /* --- Triggers. First to fire wins; the rest detach. --------------- */
      var timer = null;

      function onExitIntent(e) {
        if (e.clientY <= 0 && !e.relatedTarget) openPopup();
      }

      /* The coarse-pointer stand-in for exit intent: a hard flick upward is
         the thumb reaching for the back gesture. Sampled on scroll rather than
         added to the rAF loop — it unbinds after one fire, and a permanent
         frame cost for a one-shot check is the wrong trade. */
      var lastY = window.pageYOffset, lastT = 0;
      function onFlick() {
        var y = window.pageYOffset, t = Date.now(), dt = t - lastT;
        if (dt > 0 && y < lastY && (lastY - y) / dt > 1.6 && y > 200) openPopup();
        lastY = y; lastT = t;
      }

      function detach() {
        if (timer) clearTimeout(timer);
        document.removeEventListener('mouseout', onExitIntent);
        window.removeEventListener('scroll', onFlick);
      }

      /* Five seconds of VISIBLE page, not five seconds from parse. The loader
         owns the first ~1.5s (section 3) and counting through it would put the
         popup up almost as the page arrives. */
      function startTimer() {
        timer = setTimeout(openPopup, 5000);
      }

      if (root.classList.contains('is-ready')) startTimer();
      else onPageReady.push(startTimer);

      if (window.matchMedia('(pointer: fine)').matches) {
        document.addEventListener('mouseout', onExitIntent);
      } else {
        window.addEventListener('scroll', onFlick, { passive: true });
      }
    })();
  }


  /* 15. REVIEWS ===========================================================
     Renders reviews.js into #reviews on the product pages, and ONLY when that
     file's LIVE flag is true. Gated on the container existing, like every
     other page-specific block here.

     Everything is built with createElement and textContent — never innerHTML.
     Review text is the one string on this site that will eventually come from
     a member of the public, and the markup path it takes should already be
     safe on the day it stops being a constant in a file we control.

     The AggregateRating is injected into the page's existing Product JSON-LD
     rather than authored into it. See the header of reviews.js for why that
     distinction is load-bearing and not a style preference.
     ---------------------------------------------------------------------- */
  var reviewsHost = $('#reviews');
  var R = window.ZELYTE_REVIEWS;

  if (reviewsHost && R && R.LIVE) {
    var sku = reviewsHost.dataset.sku;
    var items = (R.items && R.items[sku]) || [];

    if (items.length) {
      /* The whole slot — heading included — ships `hidden` and is revealed
         here. Authoring the heading visible and only filling the list would
         leave a card reading "What people are saying" over empty space
         whenever the flag is off or JS fails, which is a worse first
         impression than no section at all. */
      var slot = reviewsHost.closest('.stack__item');
      if (slot) slot.hidden = false;

      var list = document.createElement('ul');
      list.className = 'reviews';

      items.forEach(function (rv) {
        var li = document.createElement('li');
        li.className = 'review';

        /* Stars carry the rating in text for AT; the glyphs themselves are
           decorative and hidden, so a screen reader hears "4 out of 5" once
           rather than five separate star characters. */
        var stars = document.createElement('p');
        stars.className = 'review__stars';
        var sr = document.createElement('span');
        sr.className = 'visually-hidden';
        sr.textContent = rv.stars + ' out of 5 stars';
        stars.appendChild(sr);
        var glyphs = document.createElement('span');
        glyphs.setAttribute('aria-hidden', 'true');
        for (var s = 1; s <= 5; s++) {
          if (s <= rv.stars) {
            glyphs.appendChild(document.createTextNode('★'));
          } else {
            var dim = document.createElement('i');
            dim.textContent = '★';
            glyphs.appendChild(dim);
          }
        }
        stars.appendChild(glyphs);
        li.appendChild(stars);

        var q = document.createElement('p');
        q.className = 'review__q';
        q.textContent = rv.text;
        li.appendChild(q);

        var by = document.createElement('p');
        by.className = 'review__by';
        var who = document.createElement('b');
        who.textContent = rv.name;
        by.appendChild(who);
        if (rv.title) by.appendChild(document.createTextNode(' · ' + rv.title));
        li.appendChild(by);

        list.appendChild(li);
      });

      reviewsHost.appendChild(list);

      /* Mean to one decimal, and only over what actually rendered. */
      var sum = items.reduce(function (a, rv) { return a + rv.stars; }, 0);
      var avg = Math.round((sum / items.length) * 10) / 10;

      var agg = document.createElement('p');
      agg.className = 'reviews__agg';
      agg.textContent = avg + ' out of 5 · ' + items.length +
                        (items.length === 1 ? ' review' : ' reviews');
      reviewsHost.appendChild(agg);

      /* Into the Product block, not a second block of our own. Two Product
         nodes for one page is what produces "duplicate field" in the Rich
         Results Test. */
      var ldNodes = $$('script[type="application/ld+json"]');
      for (var n = 0; n < ldNodes.length; n++) {
        var data;
        try { data = JSON.parse(ldNodes[n].textContent); } catch (e) { continue; }
        if (!data || data['@type'] !== 'Product') continue;
        data.aggregateRating = {
          '@type': 'AggregateRating',
          ratingValue: String(avg),
          reviewCount: items.length,
          bestRating: '5',
          worstRating: '1'
        };
        ldNodes[n].textContent = JSON.stringify(data, null, 2);
        break;
      }
    }
  }
})();
