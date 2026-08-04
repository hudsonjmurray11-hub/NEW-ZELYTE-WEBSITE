/* ==========================================================================
   ZELYTE — auth.js
   Accounts, on a site with no build step and no dependencies. Every call is a
   hand-written fetch against Supabase's REST endpoints; supabase-js is not
   loaded, here or anywhere.

   Same shape as main.js: one IIFE, var and function, Promise chains, and
   every page-specific block gated on its elements existing. Loaded on the six
   account pages only — the seven marketing pages never see it.

     1. Config + req()               6. Error copy
     2. Session store                7. Public API (window.ZAuth)
     3. Refresh + authed()           8. Page wiring: forms
     4. Auth + profile calls         9. Page wiring: account, welcome, reset
     5. Email link landings

   Credentials come from config.js. Read the comment at the top of that file
   before touching anything to do with keys.
   ========================================================================== */
(function () {
  'use strict';

  /* 1. CONFIG + REQ -------------------------------------------------------- */
  var CFG  = window.ZELYTE_CONFIG || {};
  var BASE = String(CFG.SUPABASE_URL || '').replace(/\/+$/, '');
  var ANON = String(CFG.SUPABASE_ANON_KEY || '');
  var LIVE = !!(BASE && ANON);

  var root = document.documentElement;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  function fail(status, code, msg) {
    var e = new Error(msg || code);
    e.status = status;
    e.body = { error_code: code };
    return e;
  }

  /* One fetch wrapper for GoTrue and PostgREST alike.

     The body is read as text and then parsed, because GoTrue answers 204 with
     an empty body and a gateway in front of it can answer with HTML — both of
     which res.json() turns into an unhelpful SyntaxError. Errors carry .status
     and the parsed .body so section 6 can map them to copy. */
  function req(path, opts) {
    opts = opts || {};
    if (!LIVE) return Promise.reject(fail(0, 'not_configured'));

    var headers = {
      'apikey': ANON,
      'Authorization': 'Bearer ' + (opts.token || ANON)
    };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (opts.headers) {
      for (var k in opts.headers) {
        if (Object.prototype.hasOwnProperty.call(opts.headers, k)) headers[k] = opts.headers[k];
      }
    }

    return fetch(BASE + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
    }).then(function (res) {
      return res.text().then(function (txt) {
        var body = {};
        if (txt) {
          try { body = JSON.parse(txt); } catch (e) { body = { message: txt }; }
        }
        if (!res.ok) {
          var e2 = new Error(body.msg || body.message || body.error_description || body.error || ('HTTP ' + res.status));
          e2.status = res.status;
          e2.body = body;
          throw e2;
        }
        return body;
      });
    });
  }


  /* 2. SESSION -------------------------------------------------------------
     One JSON blob under one key. expires_at is EPOCH SECONDS and is computed
     here rather than trusted, because some GoTrue builds send expires_in only.

     localStorage and not a cookie: there is no server on this site to read a
     cookie, and the session has to survive a tab close. The XSS trade-off is
     acceptable only because this site loads no third-party script and renders
     no user-generated content anywhere. If either ever changes, revisit this.
     ---------------------------------------------------------------------- */
  var KEY  = 'zelyte.auth';
  var SKEW = 60;                 // refresh this many seconds before expiry
  var session = null;
  var subs = [];

  function now() { return Math.floor(Date.now() / 1000); }

  function person(u) {
    u = u || {};
    return {
      id:        u.id || '',
      email:     u.email || '',
      confirmed: !!(u.email_confirmed_at || u.confirmed_at),
      name:      (u.user_metadata && u.user_metadata.full_name) || ''
    };
  }

  function shape(body) {
    if (!body || !body.access_token) return null;
    return {
      access_token:  body.access_token,
      refresh_token: body.refresh_token || '',
      expires_at:    body.expires_at || (now() + (parseInt(body.expires_in, 10) || 3600)),
      user:          person(body.user)
    };
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      return (s && s.access_token) ? s : null;
    } catch (e) { return null; }
  }

  /* Safari in private mode throws on setItem, so every touch is wrapped. */
  function save(next) {
    session = next || null;
    try {
      if (session) localStorage.setItem(KEY, JSON.stringify(session));
      else localStorage.removeItem(KEY);
    } catch (e) {}
    announce();
    return session;
  }

  function announce() {
    root.classList.toggle('is-auth', !!session);
    root.classList.toggle('is-anon', !session);
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](session); } catch (e) {}
    }
    try {
      document.dispatchEvent(new CustomEvent('zauth:change', { detail: { session: session } }));
    } catch (e) {}
  }

  /* Signing out in one tab must not leave another tab believing it is in. */
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    session = read();
    announce();
  });


  /* 3. REFRESH + AUTHED ----------------------------------------------------
     A failed refresh is a sign-out, not an error: the token was revoked or
     has expired, and there is nothing the caller can do about it.
     ---------------------------------------------------------------------- */
  var refreshing = null;

  function refresh() {
    if (refreshing) return refreshing;                    // never two at once
    if (!session || !session.refresh_token) return Promise.resolve(null);
    refreshing = req('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: { refresh_token: session.refresh_token }
    }).then(function (b) {
      return save(shape(b));
    }).catch(function () {
      return save(null);
    }).then(function (s) {
      refreshing = null;
      return s;
    });
    return refreshing;
  }

  function fresh() {
    if (!session) return Promise.resolve(null);
    if (session.expires_at - now() > SKEW) return Promise.resolve(session);
    return refresh();
  }

  /* Every authenticated request goes through here: refresh if stale, and on a
     401 refresh once and retry once. If that retry cannot be made the session
     is genuinely gone and the caller is signed out — never a loop. */
  function authed(path, opts) {
    return fresh().then(function (s) {
      if (!s) throw fail(401, 'session_expired');
      opts = opts || {};
      opts.token = s.access_token;
      return req(path, opts).catch(function (err) {
        if (err.status !== 401) throw err;
        return refresh().then(function (s2) {
          if (!s2) throw err;
          opts.token = s2.access_token;
          return req(path, opts);
        });
      });
    });
  }


  /* 4. AUTH + PROFILE CALLS ----------------------------------------------- */

  function signUp(email, password, name, optIn) {
    return req('/auth/v1/signup', {
      method: 'POST',
      body: {
        email: email,
        password: password,
        data: { full_name: name || '', marketing_opt_in: !!optIn }
      }
    }).then(function (b) {
      /* Not an error. With confirmations on, a signup for an address that is
         already registered comes back 200 with an EMPTY identities array
         rather than leaking that the account exists. Both branches show the
         same copy, and signup.html always offers "Sign in instead", so nobody
         hits a dead end and nobody learns anything. */
      var known = !!(b && b.user && b.user.identities && b.user.identities.length === 0);
      var s = shape(b);                 // null whenever confirmation is required
      if (s) save(s);
      return { known: known, session: s };
    });
  }

  function signIn(email, password) {
    return req('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: { email: email, password: password }
    }).then(function (b) { return save(shape(b)); });
  }

  /* The local session is cleared on both paths. A network failure on the way
     out must never leave somebody looking signed in on a shared machine. */
  function signOut() {
    var clear = function () { return save(null); };
    if (!session) return Promise.resolve(clear());
    return authed('/auth/v1/logout?scope=global', { method: 'POST' }).then(clear, clear);
  }

  /* Resolves the same way whether or not the address has an account — the one
     exception is a rate limit, which is worth telling somebody about. */
  function requestReset(email) {
    return req('/auth/v1/recover', { method: 'POST', body: { email: email } })
      .catch(function (err) {
        if (err.status === 429) throw err;
        return {};
      });
  }

  function updatePassword(password) {
    return authed('/auth/v1/user', { method: 'PUT', body: { password: password } });
  }

  function resendConfirm(email) {
    return req('/auth/v1/resend', { method: 'POST', body: { type: 'signup', email: email } });
  }

  function me() {
    return authed('/auth/v1/user', { method: 'GET' }).then(function (u) {
      if (session && u && u.id) {
        session.user = person(u);
        save(session);
      }
      return u;
    });
  }

  /* The pgrst.object Accept header makes PostgREST return the row itself
     rather than a one-element array. */
  var OBJECT = 'application/vnd.pgrst.object+json';

  function getProfile() {
    if (!session || !session.user.id) return Promise.reject(fail(401, 'session_expired'));
    return authed('/rest/v1/profiles?select=*&id=eq.' + encodeURIComponent(session.user.id), {
      headers: { 'Accept': OBJECT }
    });
  }

  /* Only ever sends the three columns the database grants an update on. The
     server would reject the rest with a 403 anyway; not sending them keeps
     the failure impossible rather than merely handled. */
  var WRITABLE = ['full_name', 'flavor', 'marketing_opt_in'];

  function updateProfile(patch) {
    if (!session || !session.user.id) return Promise.reject(fail(401, 'session_expired'));
    var body = {};
    for (var i = 0; i < WRITABLE.length; i++) {
      if (patch && Object.prototype.hasOwnProperty.call(patch, WRITABLE[i])) {
        body[WRITABLE[i]] = patch[WRITABLE[i]];
      }
    }
    return authed('/rest/v1/profiles?id=eq.' + encodeURIComponent(session.user.id), {
      method: 'PATCH',
      body: body,
      headers: { 'Accept': OBJECT, 'Prefer': 'return=representation' }
    });
  }


  /* 5. EMAIL LINK LANDINGS -------------------------------------------------
     The email templates point at welcome.html / reset.html carrying
     ?token_hash=…&type=signup|recovery, and this exchanges that for a session
     with POST /auth/v1/verify. That is the PRIMARY path, deliberately:

       - it does not depend on whether the project issues implicit or PKCE
         links. A PKCE ?code= is useless without the code_verifier that
         supabase-js writes at sign-up time, and we do not ship supabase-js;
       - a token_hash is only consumed by a POST, so an Outlook or Gmail link
         scanner that GETs the URL cannot burn the link before the human
         clicks it — the most common cause of "my link says it expired";
       - a failure arrives as a JSON body we can put through message(),
         instead of an error_description crammed into a URL fragment.

     The #access_token=… fragment an UNEDITED {{ .ConfirmationURL }} produces
     is handled too, so the pages still work if the templates are never
     customised. Both paths call replaceState the moment they are done, so the
     token never sits in the address bar, the history, or a bookmark.
     ---------------------------------------------------------------------- */
  function param(source, k) {
    var m = new RegExp('[?#&]' + k + '=([^&]*)').exec(source || '');
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
  }
  function query(k) { return param(location.search, k); }
  function hash(k)  { return param(location.hash, k); }
  function scrub()  { try { history.replaceState(null, '', location.pathname); } catch (e) {} }

  function consumeLink(type) {
    var th = query('token_hash') || hash('token_hash');
    if (th) {
      return req('/auth/v1/verify', { method: 'POST', body: { type: type, token_hash: th } })
        .then(function (b) { scrub(); return save(shape(b)); })
        .catch(function (e) { scrub(); throw e; });
    }

    if (hash('access_token')) {
      save(shape({
        access_token:  hash('access_token'),
        refresh_token: hash('refresh_token'),
        expires_in:    parseInt(hash('expires_in'), 10) || 3600
      }));
      scrub();
      return me().then(function () { return session; });
    }

    var code = hash('error_code') || query('error_code') || hash('error') || query('error');
    if (code) scrub();
    return Promise.reject(fail(400, code || 'no_link'));
  }


  /* 6. ERROR COPY ----------------------------------------------------------
     GoTrue answers in two shapes depending on version — {error,
     error_description} on older builds and {code, error_code, msg, message}
     on current ones. Read the code first, then fall back to matching the
     text. House voice: sentence case, full stops, no contractions, no
     exclamation marks. The last resort is main.js's own sentence, verbatim.
     ---------------------------------------------------------------------- */
  var FALLBACK = 'Something went wrong. Please try again.';

  var COPY = {
    not_configured:             'Accounts are not connected yet. Add your Supabase keys to config.js.',
    offline:                    'No connection. Check your network and try again.',
    invalid_credentials:        'That email and password do not match.',
    invalid_grant:              'That email and password do not match.',
    email_not_confirmed:        'Confirm your email first. The link is in your inbox.',
    user_already_exists:        'That email already has an account. Sign in instead.',
    email_exists:               'That email already has an account. Sign in instead.',
    weak_password:              'Use a password of at least 8 characters.',
    same_password:              'That is already your password.',
    over_email_send_rate_limit: 'Too many emails. Wait a minute and try again.',
    over_request_rate_limit:    'Too many attempts. Wait a minute and try again.',
    otp_expired:                'That link has expired. Request a new one.',
    access_denied:              'That link has expired. Request a new one.',
    no_link:                    'That link is incomplete. Request a new one.',
    session_expired:            'Your session ended. Sign in again.',
    signup_disabled:            'New accounts are closed right now.',
    validation_failed:          'Check the form and try again.'
  };

  var MATCH = [
    ['invalid login credentials',   'invalid_credentials'],
    ['email not confirmed',         'email_not_confirmed'],
    ['already registered',          'user_already_exists'],
    ['already been registered',     'user_already_exists'],
    ['password should be at least', 'weak_password'],
    ['should be different',         'same_password'],
    ['token has expired',           'otp_expired'],
    ['is invalid or has expired',   'otp_expired'],
    ['security purposes',           'over_request_rate_limit'],
    ['rate limit',                  'over_email_send_rate_limit'],
    ['email rate limit',            'over_email_send_rate_limit']
  ];

  function message(err) {
    if (!err) return FALLBACK;
    if (err.status === 0) return COPY.not_configured;
    if (err.status === undefined) return COPY.offline;     // fetch itself rejected

    var b = err.body || {};
    var code = b.error_code || b.code || (typeof b.error === 'string' ? b.error : '');
    if (COPY[code]) return COPY[code];

    var text = String(b.msg || b.message || b.error_description || err.message || '').toLowerCase();
    for (var i = 0; i < MATCH.length; i++) {
      if (text.indexOf(MATCH[i][0]) !== -1) return COPY[MATCH[i][1]];
    }
    if (err.status === 429) return COPY.over_request_rate_limit;
    return FALLBACK;
  }


  /* 7. PUBLIC API ---------------------------------------------------------- */
  session = read();
  announce();

  /* Resolves once the stored session has been proven — refreshed if it was
     stale, cleared if the refresh token was dead. Everything below waits on
     it rather than trusting what was in localStorage. */
  var ready = fresh().catch(function () { return save(null); });

  /* Only a bare page name is an acceptable ?next=, which closes the open
     redirect an attacker would otherwise get for free. */
  var PAGE = /^[a-z0-9-]+\.html$/;

  function here() {
    var p = location.pathname.split('/').pop();
    return PAGE.test(p) ? p : 'account.html';
  }

  function nextPage(fallback) {
    var n = query('next');
    return PAGE.test(n) ? n : fallback;
  }

  function requireAuth() {
    return ready.then(function (s) {
      if (!s) location.replace('signin.html?next=' + encodeURIComponent(here()));
      return s;
    });
  }

  window.ZAuth = {
    ready:          ready,
    onReady:        function (fn) { return ready.then(fn); },
    onChange:       function (fn) { subs.push(fn); },
    session:        function () { return session; },
    user:           function () { return session ? session.user : null; },
    isSignedIn:     function () { return !!session; },
    live:           LIVE,
    signUp:         signUp,
    signIn:         signIn,
    signOut:        signOut,
    requestReset:   requestReset,
    updatePassword: updatePassword,
    resendConfirm:  resendConfirm,
    me:             me,
    getProfile:     getProfile,
    updateProfile:  updateProfile,
    consumeLink:    consumeLink,
    requireAuth:    requireAuth,
    message:        message
  };


  /* 8. PAGE WIRING: FORMS --------------------------------------------------
     Same contract as main.js section 13: data-auth names the kind of form,
     data-status names the id of its aria-live region, and say(msg, kind)
     drives .is-error / .is-ok on .capture__micro — classes that already
     exist. Every block is gated on its form being present, so this file is
     inert on a page that does not use it.
     ---------------------------------------------------------------------- */
  function statusOf(form) {
    var el = document.getElementById(form.dataset.status || '');
    var micro = el ? el.textContent : '';
    return {
      say: function (msg, kind) {
        if (!el) return;
        el.textContent = msg;
        el.classList.toggle('is-error', kind === 'error');
        el.classList.toggle('is-ok', kind === 'ok');
      },
      reset: function () { this.say(micro); }
    };
  }

  /* Native validity first, exactly as the launch-list form does, so the
     browser's own email and minlength rules are the ones that speak. */
  function invalid(form) {
    var fields = $$('input[required]', form);
    for (var i = 0; i < fields.length; i++) {
      if (!fields[i].checkValidity()) {
        fields[i].setAttribute('aria-invalid', 'true');
        fields[i].focus();
        return fields[i];
      }
      fields[i].removeAttribute('aria-invalid');
    }
    return null;
  }

  function clearOnInput(form, status) {
    $$('input', form).forEach(function (input) {
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') === 'true') {
          input.removeAttribute('aria-invalid');
          status.reset();
        }
      });
    });
  }

  function submitter(form, run) {
    var status = statusOf(form);
    var btn = $('button[type="submit"]', form);
    var label = btn ? btn.textContent : '';
    clearOnInput(form, status);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = invalid(form);
      if (bad) {
        status.say(bad.validationMessage || 'Check that field and try again.', 'error');
        return;
      }
      if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
      status.say('Working…');

      run(status, function done() {
        if (btn) { btn.disabled = false; btn.textContent = label; }
      });
    });
    return status;
  }

  function val(form, name) {
    var el = form.elements[name];
    return el ? el.value.trim() : '';
  }


  /* SIGN IN ---------------------------------------------------------------- */
  (function () {
    var form = $('form[data-auth="signin"]');
    if (!form) return;

    var resend = $('#signin-resend');
    var status = submitter(form, function (status, done) {
      var email = val(form, 'email').toLowerCase();
      signIn(email, form.elements.password.value).then(function () {
        location.replace(nextPage('account.html'));
      }).catch(function (err) {
        done();
        status.say(message(err), 'error');
        /* The only place we know the address of somebody who never confirmed,
           so it is the only sensible home for the resend button. */
        if (resend && message(err) === COPY.email_not_confirmed) {
          resend.hidden = false;
          resend.onclick = function () {
            resend.disabled = true;
            resendConfirm(email).then(function () {
              status.say('Confirmation sent. Check your inbox.', 'ok');
            }).catch(function (e2) {
              resend.disabled = false;
              status.say(message(e2), 'error');
            });
          };
        }
      });
    });

    if (query('reset')) status.say('Password updated. Sign in with your new password.', 'ok');
    if (query('confirmed')) status.say('Email confirmed. Sign in to see your account.', 'ok');
  })();


  /* CREATE ACCOUNT ---------------------------------------------------------- */
  (function () {
    var form = $('form[data-auth="signup"]');
    if (!form) return;

    submitter(form, function (status, done) {
      var email = val(form, 'email').toLowerCase();
      var optIn = form.elements.marketing ? form.elements.marketing.checked : true;

      signUp(email, form.elements.password.value, val(form, 'name'), optIn)
        .then(function (out) {
          /* Identical copy whether or not the address was already taken. */
          if (out.session) { location.replace('account.html'); return; }
          form.hidden = true;
          status.say('Check your inbox. Open the link to confirm your account.', 'ok');
        })
        .catch(function (err) {
          done();
          status.say(message(err), 'error');
        });
    });
  })();


  /* FORGOT PASSWORD --------------------------------------------------------- */
  (function () {
    var form = $('form[data-auth="forgot"]');
    if (!form) return;

    submitter(form, function (status, done) {
      requestReset(val(form, 'email').toLowerCase()).then(function () {
        form.hidden = true;
        status.say('If that address has an account, a reset link is on its way.', 'ok');
      }).catch(function (err) {
        done();
        status.say(message(err), 'error');
      });
    });
  })();


  /* 9. PAGE WIRING: ACCOUNT, WELCOME, RESET -------------------------------- */

  /* SET A NEW PASSWORD ------------------------------------------------------
     The form stays hidden until the link has been exchanged, so there is
     never a password field on screen that could not possibly work. */
  (function () {
    var form = $('form[data-auth="reset"]');
    if (!form) return;

    var status = statusOf(form);
    var intro = $('#reset-intro');

    consumeLink('recovery').then(function () {
      form.hidden = false;
      status.reset();
    }).catch(function (err) {
      status.say(message(err), 'error');
      if (intro) intro.hidden = false;
    });

    submitter(form, function (status, done) {
      var pw = form.elements.password.value;
      if (pw !== form.elements.confirm.value) {
        done();
        form.elements.confirm.setAttribute('aria-invalid', 'true');
        form.elements.confirm.focus();
        status.say('Those passwords do not match.', 'error');
        return;
      }
      updatePassword(pw).then(function () {
        /* Sign out on purpose. That session was minted by a link sitting in an
           inbox; one real sign-in proves the new password actually works. */
        return signOut();
      }).then(function () {
        location.replace('signin.html?reset=1');
      }).catch(function (err) {
        done();
        status.say(message(err), 'error');
      });
    });
  })();


  /* WELCOME ----------------------------------------------------------------- */
  (function () {
    var page = $('#welcome');
    if (!page) return;

    var ok   = $('#welcome-ok');
    var bad  = $('#welcome-bad');
    var note = $('#welcome-note');

    consumeLink('signup').catch(function (err) {
      /* Already confirmed and came back to a bookmarked page: not a failure. */
      if (session) return session;
      throw err;
    }).then(function () {
      if (ok) ok.hidden = false;
      return getProfile();
    }).then(function (p) {
      fill('#welcome-no', p && p.signup_no ? pad(p.signup_no) : '—');
      fill('#welcome-code', (p && p.launch_code) || '—');
    }).catch(function (err) {
      if (ok) ok.hidden = true;
      if (bad) bad.hidden = false;
      if (note) note.textContent = message(err);
    });
  })();


  /* ACCOUNT ----------------------------------------------------------------- */
  (function () {
    var page = $('#account');
    if (!page) return;

    requireAuth().then(function (s) {
      if (!s) return null;
      fill('#account-email', s.user.email);
      return getProfile();
    }).then(function (p) {
      if (!p) return;

      fill('#acct-no', pad(p.signup_no));
      fill('#acct-code', p.launch_code);

      var form = $('form[data-auth="profile"]');
      if (!form) return;
      if (form.elements.name) form.elements.name.value = p.full_name || '';
      if (form.elements.marketing) form.elements.marketing.checked = !!p.marketing_opt_in;
      if (p.flavor) {
        var radio = $('input[name="flavor"][value="' + p.flavor + '"]', form);
        if (radio) { radio.checked = true; }
      }
      paintPicks(form);
    }).catch(function (err) {
      /* A 401 here means the stored token was revoked rather than merely
         stale — the refresh in authed() has already run and failed. That is a
         sign-out, not something to print on the page. */
      if (err.status === 401) {
        location.replace('signin.html?next=account.html');
        return;
      }
      var status = $('#prefs-status');
      if (status) {
        status.textContent = message(err);
        status.classList.add('is-error');
      }
    });

    /* The selected card is a class, toggled the same way .mode__btn does it,
       rather than :has() — which this stylesheet uses nowhere. */
    function paintPicks(form) {
      $$('input[name="flavor"]', form).forEach(function (radio) {
        var card = radio.closest('.pick');
        if (card) card.classList.toggle('is-on', radio.checked);
      });
    }

    var prefs = $('form[data-auth="profile"]');
    if (prefs) {
      prefs.addEventListener('change', function (e) {
        if (e.target.name === 'flavor') paintPicks(prefs);
      });

      submitter(prefs, function (status, done) {
        var flavor = prefs.elements.flavor ? prefs.elements.flavor.value : '';
        updateProfile({
          full_name: val(prefs, 'name'),
          flavor: flavor || null,
          marketing_opt_in: prefs.elements.marketing ? prefs.elements.marketing.checked : true
        }).then(function () {
          done();
          status.say('Saved.', 'ok');
        }).catch(function (err) {
          done();
          status.say(message(err), 'error');
        });
      });
    }

    var pwForm = $('form[data-auth="password"]');
    if (pwForm) {
      submitter(pwForm, function (status, done) {
        var pw = pwForm.elements.password.value;
        if (pw !== pwForm.elements.confirm.value) {
          done();
          pwForm.elements.confirm.setAttribute('aria-invalid', 'true');
          pwForm.elements.confirm.focus();
          status.say('Those passwords do not match.', 'error');
          return;
        }
        updatePassword(pw).then(function () {
          done();
          pwForm.reset();
          status.say('Password updated.', 'ok');
        }).catch(function (err) {
          done();
          status.say(message(err), 'error');
        });
      });
    }
  })();


  /* SIGN OUT — anywhere on any page ---------------------------------------- */
  $$('[data-auth-action="signout"]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      btn.disabled = true;
      signOut().then(function () { location.replace('index.html'); });
    });
  });


  /* Small shared helpers, kept at the bottom because only section 9 uses them.
     Four digits so "no. 0007" reads as a reserved place in a queue rather
     than as a thin number. */
  function pad(n) {
    var s = String(n == null ? '' : n);
    while (s.length < 4) s = '0' + s;
    return s;
  }

  /* The account email is a readonly <input>, everything else is a <span>. */
  function fill(sel, text) {
    var el = $(sel);
    if (!el) return;
    if (el.tagName === 'INPUT') el.value = text;
    else el.textContent = text;
    el.classList.remove('is-busy');
  }
})();
