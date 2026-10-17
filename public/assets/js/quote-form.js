/* The shop's quote form: one copy for every page that has one.
 *
 *   - jtees.net homepage: wires the form already in the page (#quote-form).
 *   - /contact, and every occasion page on design.jtees.net: draws the form
 *     into each element marked data-jt-quote-form, then wires it.
 *
 * It always talks to the site it was loaded from (this script's own origin),
 * so a copy loaded by design.jtees.net still sends to www.jtees.net, which
 * allows that origin (SITE_ORIGINS in server.js). /submit keeps an enquiry
 * whose human check could not run (allowMissingTurnstile), so a page where
 * Turnstile is not set up for the hostname still gets its enquiries through.
 *
 * Moved here from inline code in public/index.html on 2026-10-17 so the
 * contact page and the designer did not get copies that drift. The fixes the
 * inline code carried are kept: the Turnstile widget is rendered explicitly and
 * renewed after every attempt (the owner's retry, 2026-09-26), the form token
 * is fetched fresh at send time, and the 4-an-hour limit says how to reach us.
 */
(function () {
  'use strict';
  if (window.JTQuoteForm) return;

  var me = document.currentScript;
  var API = '';
  try { API = me && me.src ? new URL(me.src, location.href).origin : ''; } catch (e) { API = ''; }
  if (API === location.origin) API = '';          // same site: keep paths relative

  var getJSON = function (p) {
    return fetch(API + p).then(function (r) { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); });
  };
  /* Shared by the widget and the upload button. A failed fetch is not kept:
     the next caller asks again, so one dropped request does not switch the
     human check and photo upload off until a reload. */
  var config = null;
  var getConfig = function () {
    return config || (config = getJSON('/api/config').catch(function () { config = null; return {}; }));
  };

  /* Every way the form can fail, counted (plan 1d): GA4 quote_form_error
     {reason}. Reasons are fixed words, never what was typed. */
  var formError = function (reason) {
    try { if (window.jtTrack) window.jtTrack('quote_form_error', { reason: reason }); } catch (e) { /* never block the form */ }
  };

  // ============================
  // Turnstile — the site key comes from /api/config. If it is missing the
  // widget never mounts and the form keeps working; the server only enforces
  // it when configured.
  //
  // Rendered explicitly so the form keeps hold of the widget. A token is
  // single-use and lasts five minutes, and the server spends it on every
  // attempt, including one that then fails. Rendered implicitly, the widget
  // was never renewed, so anyone pressing Send again on the same page was told
  // to "complete the human check" with nothing on screen to complete.
  // ============================
  var pendingMounts = [];
  var tsLoading = false;
  window.jtTurnstileReady = function () {
    var list = pendingMounts; pendingMounts = [];
    list.forEach(function (fn) { fn(); });
  };
  function turnstile(mount) {
    var tsWidget = null;
    var tsFailed = false;          // the check errored here; Turnstile may still recover
    var render = function () {
      if (!mount || !window.jtTurnstileKey || !window.turnstile) return;
      // interaction-only: invisible to real visitors, challenges only when suspicious
      tsWidget = window.turnstile.render(mount, {
        sitekey: window.jtTurnstileKey, appearance: 'interaction-only',
        'error-callback': function () { tsFailed = true; },
        callback: function () { tsFailed = false; },
      });
      if (tsWidget === undefined) tsWidget = null;
    };
    if (mount) {
      getConfig().then(function (cfg) {
        if (!cfg || !cfg.turnstileSiteKey) return;
        window.jtTurnstileKey = cfg.turnstileSiteKey;
        if (window.turnstile && window.turnstile.render) return render();
        pendingMounts.push(render);
        if (tsLoading) return;
        tsLoading = true;
        /* The page may already be loading Turnstile itself: wait for that copy
           rather than add a second, which Cloudflare refuses to run twice. */
        if (document.querySelector && document.querySelector('script[src*="challenges.cloudflare.com/turnstile/v0/api.js"]')) {
          var tries = 0;
          (function wait() {
            if (window.turnstile && window.turnstile.render) return window.jtTurnstileReady();
            if (++tries < 80) setTimeout(wait, 250);
          })();
          return;
        }
        var s = document.createElement('script');
        s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=jtTurnstileReady';
        s.async = true; s.defer = true;
        document.head.appendChild(s);
      });
    }
    var token = function () {
      try { return tsWidget === null ? '' : (window.turnstile.getResponse(tsWidget) || ''); } catch (e) { return ''; }
    };
    // A fresh token for the next attempt — the last one is spent or stale.
    var renew = function () {
      try { if (tsWidget !== null) window.turnstile.reset(tsWidget); } catch (e) { /* widget gone */ }
    };
    // The invisible check can take a moment, longer on a slow phone: give it
    // that moment. True when a token is ready; false when it did not come in
    // time or the check errored (no point waiting on a widget that failed).
    var ready = function (ms) {
      if (tsWidget === null) return Promise.resolve(true);     // no widget, nothing to wait for
      try { if (window.turnstile.isExpired(tsWidget)) renew(); } catch (e) { /* older api */ }
      var end = Date.now() + ms;
      return new Promise(function (resolve) {
        (function poll() {
          if (token()) return resolve(true);
          if (tsFailed || Date.now() >= end) return resolve(!!token());
          setTimeout(poll, 250);
        })();
      });
    };
    return {
      token: token, renew: renew, ready: ready,
      has: function () { return tsWidget !== null; },
      failed: function () { return tsFailed; },
      // for tests
      _mount: function (id) { tsWidget = id; }, _fail: function () { tsFailed = true; },
    };
  }

  // ============================
  // Photo upload (Cloudinary widget, signed by /api/cloudinary-signature).
  // The widget's script is loaded on first use when the page lacks it.
  // ============================
  var cldScript = null;
  function loadCloudinary() {
    if (window.cloudinary) return Promise.resolve();
    if (cldScript) return cldScript;
    cldScript = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://upload-widget.cloudinary.com/global/all.js';
      s.onload = function () { resolve(); };
      s.onerror = function () { cldScript = null; reject(new Error('widget script')); };
      document.head.appendChild(s);
    });
    return cldScript;
  }
  function uploads(form) {
    var trigger = form.querySelector('.upload-area');
    var preview = form.querySelector('.upload-preview');
    var field = form.elements.photo_url;
    if (!trigger || !preview || !field) return { clear: function () {} };
    var img = preview.querySelector('img');
    var widget = null;
    var clear = function () {
      field.value = '';
      if (img) img.removeAttribute('src');
      preview.style.display = 'none';
      trigger.style.display = 'block';
    };
    var make = function () {
      return Promise.all([loadCloudinary(), getConfig()]).then(function (r) {
        var cfg = r[1] || {};
        if (!window.cloudinary || !cfg.cloudinaryCloudName || !cfg.cloudinaryApiKey) throw new Error('not configured');
        return window.cloudinary.createUploadWidget({
          cloudName: cfg.cloudinaryCloudName,
          apiKey: cfg.cloudinaryApiKey,
          uploadSignature: function (callback, paramsToSign) {
            fetch(API + '/api/cloudinary-signature', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(paramsToSign),
            }).then(function (res) { return res.json(); })
              .then(function (d) { callback(d.signature, d.timestamp); })
              .catch(function () { /* the widget reports the failed upload */ });
          },
          folder: 'quote_requests',
          sources: ['local', 'camera', 'url'],
          multiple: false,
          resourceType: 'image',
          maxFileSize: 10000000,
          styles: {
            palette: {
              window: '#0B1F4B', windowBorder: '#162a5e', tabIcon: '#F0275A',
              menuIcons: '#aab4c8', textDark: '#000000', textLight: '#ffffff',
              link: '#F0275A', action: '#F0275A', inactiveTabIcon: '#6B7280',
              error: '#f87171', inProgress: '#F0275A', complete: '#4ade80', sourceBg: '#162a5e',
            },
          },
        }, function (error, result) {
          if (error || !result || result.event !== 'success') return;
          var url = String(result.info.secure_url || '');
          if (url.indexOf('https://res.cloudinary.com/') !== 0) return;   // the server refuses anything else
          field.value = url;
          if (img) img.src = url;
          preview.style.display = 'block';
          trigger.style.display = 'none';
        });
      });
    };
    trigger.addEventListener('click', function () {
      (widget ? Promise.resolve(widget) : make().then(function (w) { widget = w; return w; }))
        .then(function (w) { w.open(); })
        .catch(function () {
          var st = form.querySelector('.form-status');
          if (st) { st.className = st.className.replace(/\b(success|error)\b/g, '').trim() + ' error'; st.textContent = 'Photo upload is not available right now. You can describe your design in the text box.'; }
        });
    });
    trigger.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); } });
    var rm = preview.querySelector('.remove-upload');
    if (rm) rm.addEventListener('click', clear);
    return { clear: clear };
  }

  // ============================
  // Wire one form
  // ============================
  function wire(form) {
    if (!form || form.jtQuoteWired) return;
    form.jtQuoteWired = true;
    var submitBtn = form.querySelector('button[type="submit"]');
    var formStatus = form.querySelector('.form-status');
    var phoneField = form.elements.phone;
    var emailField = form.elements.email;
    var ts = turnstile(form.querySelector('.cf-turnstile-mount'));
    var up = uploads(form);
    var btnLabel = submitBtn ? submitBtn.textContent : 'Send Request';
    var status = function (cls, text) {
      if (!formStatus) return;
      formStatus.className = formStatus.className.replace(/\b(success|error)\b/g, '').trim() + (cls ? ' ' + cls : '');
      formStatus.textContent = text;
    };

    var formToken = '';
    getJSON('/api/form-token').then(function (d) { formToken = d.token || ''; }).catch(function () {});

    // Live phone formatting: keep it to 10 digits as (xxx) xxx-xxxx
    if (phoneField) phoneField.addEventListener('input', function () {
      var d = phoneField.value.replace(/\D/g, '');
      if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
      d = d.slice(0, 10);
      if (d.length > 6)      phoneField.value = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
      else if (d.length > 3) phoneField.value = '(' + d.slice(0, 3) + ') ' + d.slice(3);
      else                   phoneField.value = d;
    });

    /* "A June's Tees salesperson" asks for their name; any other answer hides
       and clears it, so a name is never sent with the wrong answer. */
    var heard = form.elements.heard_from, rep = form.elements.heard_rep;
    if (heard && rep) {
      var wrap = rep.closest('.form-group') || rep;
      var sync = function () {
        var isRep = heard.value === 'rep';
        wrap.hidden = !isRep;
        if (!isRep) rep.value = '';
      };
      heard.addEventListener('change', sync);
      sync();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.jtSending) return;

      /* The page's own required fields first, the way the browser would. */
      var nameField = form.elements.name, descField = form.elements.description;
      if (nameField && !nameField.value.trim()) {
        status('error', 'Please enter your name.');
        formError('name');
        nameField.focus();
        return;
      }
      var phoneDigits = phoneField ? phoneField.value.replace(/\D/g, '') : '';
      if (phoneDigits.length !== 10) {
        status('error', 'Please enter a valid 10-digit phone number.');
        formError('phone');
        if (phoneField) phoneField.focus();
        return;
      }
      if (!emailField || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailField.value.trim())) {
        status('error', 'Please enter a valid email address.');
        formError('email');
        if (emailField) emailField.focus();
        return;
      }
      if (descField && descField.required && !descField.value.trim()) {
        status('error', 'Please tell us about your order.');
        formError('description');
        descField.focus();
        return;
      }

      form.jtSending = true;
      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Sending...'; }
      status('', '');

      /* The human check. Its token has usually been ready since the page
         loaded; if not, give it a few seconds. If it still has not come, the
         enquiry is sent anyway: the server keeps a token-less enquiry and flags
         it to the shop rather than lose a customer to the check. */
      if (!ts.token() && ts.has() && !ts.failed()) status('', "One moment, confirming you're not a robot…");

      ts.ready(10000).then(function () {
        status('', '');
        /* A fresh form token as well. The one fetched at page load lasts 30 to
           60 minutes, so a customer who filled the form in slowly was refused
           with a bare "Bad request". */
        return getJSON('/api/form-token').then(function (d) { return d.token || formToken; }, function () { return formToken; });
      }).then(function (tok) {
        formToken = tok;
        var data = {};
        new FormData(form).forEach(function (v, k) { data[k] = v; });
        data._token = formToken;
        if (ts.has()) data['cf-turnstile-response'] = ts.token();
        return fetch(API + '/submit', {
          method: 'POST',
          body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        });
      }).then(function (res) {
        if (res.ok) {
          status('success', "We got it! We'll be in touch soon.");
          /* Conversion tracking — fires only on a confirmed save. Meta's Lead
             comes from jtTrack('quote_submitted') alone, under the id the
             server sent it with. No id = a resubmit or an enquiry without the
             human check: the server sent Meta nothing, and neither does the page. */
          return res.json().catch(function () { return {}; }).then(function (saved) {
            if (window.gtag) window.gtag('event', 'generate_lead');
            if (window.jtTrack && saved.lead_event_id) window.jtTrack('quote_submitted', { meta_event_id: saved.lead_event_id });
            form.reset();
            up.clear();
            if (heard && rep) heard.dispatchEvent(new Event('change'));
          });
        }
        if (res.status === 400) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            status('error', body.error || 'Please refresh the page and try again.');
            formError(/human check/i.test(body.error || '') ? 'human_check' : body.error === 'Bad request' ? 'bot_filter' : 'server_refused');
          });
        }
        if (res.status === 429) {
          /* The 4-an-hour limit. Usually someone retrying a form that seemed
             stuck: tell them how to reach us now rather than "went wrong". */
          status('error', "We've received several requests from you in the last hour. Please call or text us at (773) 900-4592 and we'll help right away.");
          formError('rate_limit');
          return;
        }
        throw new Error('Server error');
      }).catch(function () {
        formError('network_or_server');
        status('error', 'Something went wrong. Please call or text us at (773) 900-4592.');
      }).then(function () {
        // The token is spent either way: the server used it on this attempt.
        ts.renew();
        form.jtSending = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = btnLabel; }
      });
    });
  }

  // ============================
  // Draw the form into a mount (contact page, designer occasion pages)
  // ============================
  var STYLE = '' +
    '.jtqf{font-family:inherit;color:#1f2937;text-align:left}' +
    '.jtqf h3{font-size:1.15rem;font-weight:800;color:#0B1F4B;margin:0 0 1.1rem}' +
    '.jtqf .form-group{margin-bottom:1rem}' +
    '.jtqf .form-row{display:grid;grid-template-columns:1fr 1fr;gap:1rem}' +
    '.jtqf label.l{display:block;font-size:.78rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#4B5563;margin-bottom:.4rem}' +
    '.jtqf input[type=text],.jtqf input[type=tel],.jtqf input[type=email],.jtqf select,.jtqf textarea{width:100%;box-sizing:border-box;border:1px solid #D1D5DB;border-radius:8px;padding:.7rem .9rem;font:inherit;font-size:.95rem;background:#fff;color:#111827}' +
    '.jtqf textarea{min-height:110px;resize:vertical}' +
    '.jtqf input:focus,.jtqf select:focus,.jtqf textarea:focus{outline:2px solid #F4A623;border-color:#F4A623}' +
    '.jtqf .opt{font-weight:400;text-transform:none;letter-spacing:0}' +
    '.jtqf .sms{font-size:12.5px;line-height:1.45;margin:0 0 14px}' +
    '.jtqf .sms label{display:flex;gap:8px;align-items:flex-start;margin:6px 0}' +
    '.jtqf .sms input{width:auto;margin-top:3px;flex:none}' +
    '.jtqf .sms p{font-size:11.5px;margin:4px 0 0;opacity:.85}' +
    '.jtqf .upload-area{border:2px dashed #D1D5DB;border-radius:8px;padding:1.1rem;text-align:center;cursor:pointer}' +
    '.jtqf .upload-area:hover{border-color:#F4A623;background:#fff8ec}' +
    '.jtqf .upload-area p{font-size:.82rem;color:#6B7280;margin:.3rem 0 0}' +
    '.jtqf .upload-preview{display:none;margin-top:.8rem;position:relative}' +
    '.jtqf .upload-preview img{width:100%;max-height:160px;object-fit:contain;border-radius:8px;background:#f3f4f6}' +
    '.jtqf .remove-upload{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.7);border:0;color:#fff;border-radius:50%;width:26px;height:26px;cursor:pointer}' +
    '.jtqf .row-end{display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-top:.4rem}' +
    '.jtqf button[type=submit]{background:#F4A623;color:#0B1F4B;font-weight:800;border:0;border-radius:10px;padding:.85rem 1.8rem;font-size:1rem;cursor:pointer}' +
    '.jtqf button[type=submit]:disabled{opacity:.6;cursor:wait}' +
    '.jtqf .form-status{font-size:.9rem;font-weight:600}' +
    '.jtqf .form-status.success{color:#15803d}.jtqf .form-status.error{color:#b91c1c}' +
    '@media(max-width:560px){.jtqf .form-row{grid-template-columns:1fr}}';

  var n = 0;
  /* Static markup only: nothing from the page or the visitor goes into it.
     Field names match /submit; SMS wording must match tools/lib/sms-consent.js;
     heard_from keys must match HEARD_FROM in tools/lib/sales-credit.js. */
  function markup(p) {
    var site = API || '';
    return '' +
      '<form class="jtqf" action="' + site + '/submit" method="POST">' +
      '<h3>Request a Free Quote</h3>' +
      '<input type="hidden" name="photo_url">' +
      '<input type="text" name="website" value="" autocomplete="off" tabindex="-1" aria-hidden="true" style="display:none !important">' +
      '<div class="form-group"><label class="l" for="' + p + 'name">Full Name</label>' +
      '<input id="' + p + 'name" type="text" name="name" required maxlength="200" autocomplete="name" placeholder="Jane Smith"></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="l" for="' + p + 'phone">Phone</label>' +
      '<input id="' + p + 'phone" type="tel" name="phone" required placeholder="(000) 000-0000" inputmode="tel" maxlength="14" autocomplete="tel"></div>' +
      '<div class="form-group"><label class="l" for="' + p + 'email">Email</label>' +
      '<input id="' + p + 'email" type="email" name="email" required maxlength="254" autocomplete="email" placeholder="you@email.com"></div>' +
      '</div>' +
      '<div class="form-group"><label class="l" for="' + p + 'heard">How did you hear about us? <span class="opt">(optional)</span></label>' +
      '<select id="' + p + 'heard" name="heard_from"><option value="">Choose one</option>' +
      '<option value="google">Google search</option><option value="google_ad">Google ad</option>' +
      '<option value="social">Facebook, Instagram or TikTok</option><option value="friend">A friend or family member</option>' +
      '<option value="repeat">I\'ve ordered before</option><option value="saw_work">Saw your work or met you at an event</option>' +
      '<option value="rep">A June\'s Tees salesperson</option><option value="other">Somewhere else</option></select></div>' +
      '<div class="form-group" hidden><label class="l" for="' + p + 'rep">Their name</label>' +
      '<input id="' + p + 'rep" type="text" name="heard_rep" maxlength="80" placeholder="Who did you speak to?" autocomplete="off"></div>' +
      '<div class="sms">' +
      '<label><input type="checkbox" name="sms_transactional" value="1"><span>Text me about my order (quotes, order status, pickup and delivery updates) from June\'s Tees &amp; Things. Msg frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.</span></label>' +
      '<label><input type="checkbox" name="sms_marketing" value="1"><span>Also text me deals and promotions from June\'s Tees &amp; Things (up to 4 msgs/month). Consent is not a condition of purchase. Msg &amp; data rates may apply. Reply STOP to opt out.</span></label>' +
      '<p>See our <a href="https://www.jtees.net/sms-terms" target="_blank" rel="noopener">SMS Terms</a> and <a href="https://design.jtees.net/privacy.php" target="_blank" rel="noopener">Privacy Policy</a>.</p>' +
      '</div>' +
      '<div class="form-group"><label class="l" for="' + p + 'desc">Tell Us About Your Order</label>' +
      '<textarea id="' + p + 'desc" name="description" required maxlength="2000" placeholder="What do you need? Item type, quantities, colors, event date, any special requests..."></textarea></div>' +
      '<div class="form-group"><span class="l" style="display:block;font-size:.78rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#4B5563;margin-bottom:.4rem">Reference Photo <span class="opt">(optional)</span></span>' +
      '<div class="upload-area" role="button" tabindex="0"><div aria-hidden="true">&#128444;&#65039;</div><strong>Click to upload a photo</strong><p>Logo, design idea, or inspiration image</p></div>' +
      '<div class="upload-preview"><img alt="Uploaded preview"><button type="button" class="remove-upload" aria-label="Remove photo">&#10005;</button></div></div>' +
      '<div class="cf-turnstile-mount" style="margin:12px 0"></div>' +
      '<div class="row-end"><button type="submit">Send Request</button><span class="form-status" role="status" aria-live="polite"></span></div>' +
      '</form>';
  }
  function build(mount) {
    if (!mount || mount.jtQuoteBuilt) return;
    mount.jtQuoteBuilt = true;
    if (!document.getElementById('jtqf-style')) {
      var st = document.createElement('style');
      st.id = 'jtqf-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    n += 1;
    mount.innerHTML = markup('jtqf' + n + '-');
    wire(mount.querySelector('form'));
  }

  function init() {
    var home = document.getElementById('quote-form');
    if (home) wire(home);
    /* A mount is drawn when it comes near the screen, not on load: the form
       sits at the foot of most pages, and drawing it costs two calls against
       the 60-an-hour limit /api/config and /api/form-token share with the
       shop feed and uploads, plus Cloudflare's Turnstile script. Someone
       reading 30 pages would otherwise use the limit up and then be unable
       to send. Without IntersectionObserver every mount is drawn at once. */
    var mounts = document.querySelectorAll('[data-jt-quote-form]');
    if (!('IntersectionObserver' in window)) { Array.prototype.forEach.call(mounts, build); return; }
    var io = new IntersectionObserver(function (seen) {
      seen.forEach(function (s) { if (s.isIntersecting) { io.unobserve(s.target); build(s.target); } });
    }, { rootMargin: '800px 0px' });
    Array.prototype.forEach.call(mounts, function (m) { io.observe(m); });
  }

  window.JTQuoteForm = { wire: wire, build: build, _turnstile: turnstile };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
