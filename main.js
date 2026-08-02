/* ==========================================================================
   ZELYTE — main.js
   No libraries. IntersectionObserver for reveals, one shared rAF loop for
   everything scroll-linked. Transform and opacity only.

   Contents:
     1. Reduced motion + helpers
     2. Nav height measurement
     3. Reveals (IntersectionObserver, once per element)
     4. Mobile menu (focus trap, Esc)
     5. The rotating Strike mark
     6. Scroll progress + "how it works" timeline
     7. The single rAF loop
     8. Email capture (STUBBED — see section 8)
   ========================================================================== */
(function () {
  'use strict';

  /* 1. REDUCED MOTION + HELPERS ------------------------------------------ */
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };


  /* 2. NAV HEIGHT --------------------------------------------------------- */
  /* Published as --nav-h so the sticky offsets in CSS stay correct even if the
     lockup or nav padding changes later. */
  var nav = $('#nav');
  function measureNav() {
    if (!nav) return;
    document.documentElement.style.setProperty('--nav-h', nav.offsetHeight + 'px');
  }
  measureNav();
  if (window.ResizeObserver && nav) new ResizeObserver(measureNav).observe(nav);


  /* 3. REVEALS ------------------------------------------------------------ */
  /* 16px + opacity, 240ms, siblings staggered 60ms, each element once. */
  var reveals = $$('.reveal');

  // Stagger index is per parent, so groups cascade and unrelated blocks don't.
  var seen = new Map();
  reveals.forEach(function (el) {
    var p = el.parentNode;
    var i = seen.get(p) || 0;
    el.style.setProperty('--i', i);
    seen.set(p, i + 1);
  });

  if (reduced) {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  } else if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);          // animate once, then stop watching
      });
      // rootMargin stays at 0: a negative bottom margin would leave
      // above-the-fold content (the hero CTA on a short viewport) unrevealed.
    }, { rootMargin: '0px', threshold: 0.01 });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }


  /* 4. MOBILE MENU -------------------------------------------------------- */
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
    var f = focusables();
    if (f.length) f[0].focus();
  }
  function closeMenu() {
    menu.hidden = true;
    document.body.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Open menu');
    if (lastFocus) lastFocus.focus();
  }
  if (toggle && menu) {
    toggle.addEventListener('click', function () {
      menu.hidden ? openMenu() : closeMenu();
    });
    menu.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (menu.hidden) return;
      if (e.key === 'Escape') { closeMenu(); return; }
      if (e.key !== 'Tab') return;
      // Trap focus inside the overlay.
      var f = focusables();
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }


  /* 5. THE ROTATING STRIKE MARK -------------------------------------------
     Ported from the original Three.js hero mark, dependency-free. Preserved
     exactly: auto-spin 0.012 rad/frame, drag sensitivity 0.005, inertia decay
     0.95, 2s auto-spin resume. Replaced: WebGL -> stacked SVG layers in a
     preserve-3d scene. Flat fills only, so no lighting and no gradients.
     ---------------------------------------------------------------------- */
  var markBox = $('#hero-mark');
  var mark = $('#mark3d');
  var LAYERS = 14;
  var DEPTH_RATIO = 0.18;      // matches the original extrude depth / mark height
  var ry = -0.35;              // start slightly turned so the form reads as solid
  var spin = 0.012;            // rad per 60fps frame, unchanged from the original
  var autoSpin = true, dragging = false, vel = 0, resumeAt = 0, lastX = 0;

  function buildMark() {
    if (!mark) return;
    var h = markBox.clientHeight;
    if (!h) return;
    var depth = h * DEPTH_RATIO;
    mark.textContent = '';
    for (var i = 0; i < LAYERS; i++) {
      var z = -depth / 2 + depth * (i / (LAYERS - 1));
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 552 754');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      // Front and back faces read asphalt; the stack between them reads iron.
      svg.setAttribute('class', 'mark3d__l' + (i === 0 || i === LAYERS - 1 ? ' mark3d__l--face' : ''));
      svg.style.transform = 'translateZ(' + z.toFixed(2) + 'px)';
      var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', '#strike');
      svg.appendChild(use);
      mark.appendChild(svg);
    }
  }

  if (mark && !reduced) {
    buildMark();
    var rebuild;
    window.addEventListener('resize', function () {
      clearTimeout(rebuild);
      rebuild = setTimeout(buildMark, 200);
    }, { passive: true });

    mark.addEventListener('pointerdown', function (e) {
      dragging = true; autoSpin = false; lastX = e.clientX;
      mark.setPointerCapture(e.pointerId);
    });
    mark.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      vel = (e.clientX - lastX) * 0.005;
      ry += vel;
      lastX = e.clientX;
    });
    function endDrag() {
      if (!dragging) return;
      dragging = false;
      resumeAt = performance.now() + 2000;   // same 2s pause as the original
    }
    mark.addEventListener('pointerup', endDrag);
    mark.addEventListener('pointercancel', endDrag);
  } else if (mark && reduced) {
    // Static mark: one flat layer, no rAF loop, no listeners.
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 552 754');
    s.setAttribute('class', 'mark3d__l mark3d__l--face');
    s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#strike');
    s.appendChild(u);
    mark.appendChild(s);
  }


  /* 6. SCROLL-DRIVEN STATE ------------------------------------------------ */
  var progress = $('#scroll-progress');
  var progressFill = progress && $('.split__fill', progress);
  var how = $('#how-it-works');
  var howFill = $('#how-fill');
  var howClock = $('#how-clock');
  var stages = $$('#how-stages .stage');
  var lastPct = -1;

  function mmss(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var s = Math.floor(totalSeconds % 60);
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateScroll() {
    var y = window.pageYOffset;

    // Nav hairline appears once the page has moved.
    if (nav) nav.classList.toggle('is-stuck', y > 8);

    // The Split as page progress.
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? clamp(y / max, 0, 1) : 0;
    if (progressFill) progressFill.style.setProperty('--p', p.toFixed(4));
    var pct = Math.round(p * 100);
    if (pct !== lastPct && progress) {
      progress.setAttribute('aria-valuenow', pct);   // only on whole-percent change
      lastPct = pct;
    }

    // "How it works" timeline: fill 00:00 -> 25:00 and resolve four stages.
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

    // Hero mark parallax, capped at 20px total travel.
    if (markBox && !reduced) {
      var t = clamp(y / (window.innerHeight || 1), 0, 1);
      markBox.style.transform = 'translateY(' + (t * -20).toFixed(2) + 'px)';
    }
  }


  /* 7. THE SINGLE rAF LOOP ------------------------------------------------ */
  if (reduced) {
    // No loop, no scroll listener. Paint the resting state once.
    if (progressFill) progressFill.style.setProperty('--p', 0);
    if (howFill) howFill.style.setProperty('--p', 1);
    if (howClock) howClock.textContent = '25:00';
    stages.forEach(function (s) { s.classList.add('is-on'); });
  } else {
    var dirty = true;
    var prevT = performance.now();

    window.addEventListener('scroll', function () { dirty = true; }, { passive: true });
    window.addEventListener('resize', function () { dirty = true; }, { passive: true });

    (function frame(now) {
      requestAnimationFrame(frame);

      // Normalise the original per-frame spin to real time so the mark turns
      // at the same rate on 120Hz displays as it did at 60fps.
      var dt = clamp((now - prevT) / 16.667, 0, 4);
      prevT = now;

      if (mark) {
        if (dragging) {
          // ry is driven directly by pointermove
        } else if (autoSpin) {
          ry += spin * dt;
        } else {
          ry += vel * dt;
          vel *= Math.pow(0.95, dt);
          if (now >= resumeAt) { autoSpin = true; vel = 0; }
        }
        mark.style.setProperty('--ry', ry.toFixed(4) + 'rad');
      }

      if (dirty) { dirty = false; updateScroll(); }
    })(prevT);

    updateScroll();
  }


  /* 8. EMAIL CAPTURE — STUBBED ============================================
     The previous app wrote to a Supabase table called `launch_signups`, but
     the credentials in that repo are placeholders and no such table exists in
     any of its .sql files, so there is nothing live to point at yet.

     TO GO LIVE: fill in the two constants below. Nothing else needs to change.
     Create the table first with sql/launch_signups.sql (it includes the
     insert-only RLS policy — required, because the anon key is public).
     ---------------------------------------------------------------------- */
  var SUPABASE_URL = '';        // e.g. 'https://xxxxxxxx.supabase.co'
  var SUPABASE_ANON_KEY = '';   // the project's public anon key

  var form = $('#signup-form');
  var input = $('#email');
  var status = $('#signup-status');
  var btn = $('#signup-btn');
  var DEFAULT_MICRO = status ? status.textContent : '';

  function say(msg, kind) {
    if (!status) return;
    status.textContent = msg;
    status.classList.toggle('is-error', kind === 'error');
    status.classList.toggle('is-ok', kind === 'ok');
  }

  function saveEmail(email) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      // Stub path. Resolves so the UI is fully exercisable before wiring.
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
      // 23505 is a unique violation, i.e. already on the list. The previous
      // app treated that as success, so this does too.
      if (res.ok || res.status === 409) return { ok: true };
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (body && body.code === '23505') return { ok: true };
        throw new Error(body && body.message ? body.message : 'Request failed');
      });
    });
  }

  if (form && input) {
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
        say(DEFAULT_MICRO);
      }
    });
  }
})();
