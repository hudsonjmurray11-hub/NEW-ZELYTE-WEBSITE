/* ==========================================================================
   ZELYTE — main.js (v2)
   Shared by all thirteen pages. No libraries. One IntersectionObserver for
   reveals, one requestAnimationFrame loop for everything scroll-linked.
   Every page-specific block is gated on its elements existing.

   Accounts live in auth.js, which the six account pages load alongside this.
   Credentials for both come from config.js.

     1. Helpers + reduced motion      8. Scroll: timeline, the pan, the tin
     2. Nav height                    9. Counters
     3. Loader                       10. Magnetic buttons
     4. Reveals                      11. Mono scramble
     5. Mobile menu                  12. The rAF loop
     6. The orbit                    12b. One time / Subscribe & save
     7. Card stack                   13. Email capture
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


  /* 2. NAV HEIGHT --------------------------------------------------------- */
  var nav = $('#nav');
  function measureNav() {
    if (nav) root.style.setProperty('--nav-h', nav.offsetHeight + 'px');
  }
  measureNav();
  if (window.ResizeObserver && nav) new ResizeObserver(measureNav).observe(nav);


  /* 3. LOADER -------------------------------------------------------------
     Blank asphalt, the Strike turns exactly one revolution and lands where
     it started, then the page fades up. Plays on EVERY page load.
     ---------------------------------------------------------------------- */
  var loader = $('#loader');
  var loaderMark = $('#loader-mark');

  function revealPage() {
    root.classList.add('is-ready');
    if (loader) loader.classList.add('is-done');
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

  function saveEmail(email) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.warn('[ZELYTE] Email capture is stubbed — no Supabase credentials set. Captured:', email);
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
      body: JSON.stringify({ email: email })
    }).then(function (res) {
      if (res.ok || res.status === 409) return { ok: true };
      return res.json().catch(function () { return {}; }).then(function (b) {
        if (b && b.code === '23505') return { ok: true };   // already on the list
        throw new Error(b && b.message ? b.message : 'Request failed');
      });
    });
  }

  $$('form[data-signup]').forEach(function (form) {
    var input = $('input[type="email"]', form);
    var btn = $('button[type="submit"]', form);
    var status = document.getElementById(form.dataset.signup);
    var micro = status ? status.textContent : '';

    function say(msg, kind) {
      if (!status) return;
      status.textContent = msg;
      status.classList.toggle('is-error', kind === 'error');
      status.classList.toggle('is-ok', kind === 'ok');
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = input.value.trim().toLowerCase();
      if (!email || !input.checkValidity()) {
        input.setAttribute('aria-invalid', 'true');
        say('Enter a valid email address.', 'error');
        input.focus();
        return;
      }
      input.removeAttribute('aria-invalid');
      btn.disabled = true;
      say('Submitting…');
      saveEmail(email).then(function () {
        form.hidden = true;
        say('You are on the list. We will email you once when the first batch ships.', 'ok');
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
  });
})();
