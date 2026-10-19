/* The "10% off for joining our texts" popup on jtees.net (owner, 2026-10-18:
 * "yeah lets add it", after asking whether the site had one like the Design
 * Studio's cart popup).
 *
 * It is a small copy of the /texts sign-up form and posts to /texts itself, so
 * the page that records the consent, makes the single-use code, texts it and
 * shows it is the one already in use (server.js, tools/lib/reintro.js). This
 * file only decides WHEN to ask:
 *
 *   - desktop: when the pointer leaves through the top of the window (heading
 *     for the tabs or the address bar), after a few seconds on the page;
 *   - phones (no hover, so no exit to see): once they have read a while,
 *     30 seconds on the page and some way down it;
 *   - once a fortnight at most, never again after a sign-up (the /texts
 *     thank-you page sets jt_tx_joined, so only a sign-up the server accepted
 *     counts, whichever way they joined), never while
 *     someone is typing in the quote form, never on a page that has no
 *     marker for it (tools/site-nav.js adds the script, not to the contact,
 *     SMS or legal pages).
 *
 * The consent wording must match TRANSACTIONAL_TEXT and MARKETING_TEXT in
 * tools/lib/sms-consent.js: the server records that text as what was agreed
 * to (tests/texts-popup.test.js holds them together). Static markup only:
 * nothing the visitor types is written into the page.
 */
(function () {
  'use strict';
  if (window.JTTextsPopup) return;
  window.JTTextsPopup = true;

  var PCT = 10;
  var KEY_SEEN = 'jt_tx_pop_seen', KEY_JOINED = 'jt_tx_joined';
  // An 80px-tall copy of brand/logo-2026 (small, not the master), loaded while it waits.
  var LOGO = '/assets/images/brand/logo-popup.png';
  var AGAIN_MS = 14 * 86400000, ARM_MS = 6000, PHONE_MS = 30000, PHONE_DEPTH = 0.35;

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: ask again next visit */ } },
  };
  var track = function (name) {
    if (PREVIEW) return;
    try { if (window.jtTrack) window.jtTrack(name, { page: location.pathname }); } catch (e) { /* never block */ }
  };

  /* ?popup=preview opens it straight away, past every rule below, without
     marking it seen or counting it in analytics: for the owner to look at it
     (2026-10-18). A sign-up sent from it is still a real sign-up. */
  var PREVIEW = /[?&]popup=preview\b/.test(location.search);
  if (!PREVIEW) {
    if (store.get(KEY_JOINED)) return;
    var seen = parseInt(store.get(KEY_SEEN) || '0', 10) || 0;
    if (Date.now() - seen < AGAIN_MS) return;
    // Arrived from our texts, emails, shop sign or the sign-up page: they know.
    if (/[?&]src=(sms|texts|email|shop|receipt)\b/.test(location.search)) return;
  }

  var TRANSACTIONAL = "Text me about my order (quotes, order status, pickup and delivery updates) from June's Tees &amp; Things. " +
    'Msg frequency varies. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.';
  var MARKETING = "Also text me deals and promotions from June's Tees &amp; Things (up to 4 msgs/month). " +
    'Consent is not a condition of purchase. Msg &amp; data rates may apply. Reply STOP to opt out.';

  var STYLE = '' +
    '.jttx-bg{position:fixed;inset:0;z-index:2147483000;background:rgba(8,16,40,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif}' +
    '.jttx-w{position:relative;max-width:420px;width:100%}' +
    '.jttx{overscroll-behavior:contain;background:#fff;border-radius:18px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 20px 50px rgba(0,0,0,.3);color:#374151;text-align:left}' +
    '.jttx-logo{background:#fff;border-radius:18px 18px 0 0;border-bottom:4px solid #E0107A;text-align:center;padding:14px 44px 12px}' +
    '.jttx-logo img{max-height:40px;height:auto;width:auto;max-width:100%;display:inline-block}' +
    '.jttx-top{background:#0D0D12;color:#fff;padding:22px 24px 20px;text-align:center}' +
    '.jttx-top h2{margin:0 0 6px;font-size:1.65rem;line-height:1.15;font-weight:800;color:#fff}' +
    '.jttx-top h2 span{color:#E0107A}' +
    '.jttx-top p{margin:0;font-size:.95rem;line-height:1.5;color:#dbe2f1}' +
    '.jttx-x{position:absolute;z-index:1;top:8px;right:10px;border:0;background:none;color:#6B7280;font-size:26px;line-height:1;cursor:pointer;padding:6px;opacity:.8}' +
    '.jttx-x:hover,.jttx-x:focus-visible{opacity:1}' +
    // Short screens (small phones, landscape): a slimmer top so the button stays in view.
    '@media(max-height:700px){.jttx-logo{padding:8px 44px 7px}.jttx-logo img{max-height:28px}.jttx-top{padding:14px 20px 12px}.jttx-top h2{font-size:1.35rem}}' +
    '.jttx form{padding:18px 22px 20px;margin:0}' +
    '.jttx label.l{display:block;font-size:13px;font-weight:700;color:#0D0D12;margin:10px 0 4px}' +
    '.jttx input[type=tel],.jttx input[type=email]{width:100%;box-sizing:border-box;padding:12px 13px;font:inherit;font-size:16px;border:1.5px solid #E5E7EB;border-radius:10px;background:#fff;color:#111827}' +
    '.jttx input:focus{outline:none;border-color:#E0107A;box-shadow:0 0 0 3px rgba(224,16,122,.15)}' +
    '.jttx .c{display:flex;gap:8px;align-items:flex-start;font-size:12px;line-height:1.45;margin:9px 0 0;color:#4B5563}' +
    '.jttx .c input{width:auto;margin-top:2px;flex:none}' +
    '.jttx .t{font-size:11px;margin:6px 0 0;color:#6B7280}.jttx .t a{color:#0E78B8}' +
    '.jttx .e{display:none;color:#b91c1c;font-size:13px;font-weight:600;margin:10px 0 0}' +
    '.jttx button[type=submit]{display:block;width:100%;border:0;border-radius:100px;background:#E0107A;color:#fff;font:inherit;font-weight:800;font-size:16px;padding:14px;margin-top:14px;cursor:pointer}' +
    '.jttx button[type=submit]:hover{background:#B80D64}' +
    '.jttx button[type=submit]:disabled{opacity:.6;cursor:wait}' +
    '.jttx .no{display:block;margin:10px auto 0;border:0;background:none;color:#6B7280;font:inherit;font-size:13px;text-decoration:underline;cursor:pointer}';

  function markup() {
    return '' +
      // The close button sits outside the scrolling card, so it never scrolls away.
      '<div class="jttx-w" role="dialog" aria-modal="true" aria-labelledby="jttx-h">' +
      '<button type="button" class="jttx-x" aria-label="Close">&times;</button>' +
      '<div class="jttx">' +
      '<div class="jttx-logo"><img src="' + LOGO + '" alt="June\'s Tees &amp; Things" width="102" height="40"></div>' +
      '<div class="jttx-top"><h2 id="jttx-h">Get <span>' + PCT + '% off</span> your next order</h2>' +
      '<p>Join June\'s Tees texts for new products and seasonal deals. Your code comes right away.</p></div>' +
      '<form method="POST" action="/texts">' +
      '<input type="hidden" name="src" value="popup">' +
      '<label class="l" for="jttx-phone">Mobile number</label>' +
      '<input id="jttx-phone" name="phone" type="tel" required maxlength="20" autocomplete="tel" inputmode="tel" placeholder="(773) 555-0123">' +
      '<label class="l" for="jttx-email">Email</label>' +
      '<input id="jttx-email" name="email" type="email" required maxlength="254" autocomplete="email" placeholder="you@email.com">' +
      '<label class="c"><input type="checkbox" name="sms_transactional" value="1"><span>' + TRANSACTIONAL + '</span></label>' +
      '<label class="c"><input type="checkbox" name="sms_marketing" value="1"><span>' + MARKETING + '</span></label>' +
      '<p class="t">Your code comes with the second box, our deals texts. See our <a href="/sms-terms" target="_blank" rel="noopener">SMS Terms</a> and ' +
      '<a href="https://design.jtees.net/privacy.php" target="_blank" rel="noopener">Privacy Policy</a>.</p>' +
      '<p class="e" role="alert"></p>' +
      '<button type="submit">Get my ' + PCT + '% off</button>' +
      '<button type="button" class="no">No thanks</button>' +
      '</form></div></div>';
  }

  var shown = false, armed = false, opener = null;

  // Someone mid-way through the quote form is not interrupted.
  function busy() {
    var a = document.activeElement;
    if (a && a.closest && a.closest('#quote-form, .jtqf')) return true;
    var fields = document.querySelectorAll('#quote-form textarea, .jtqf textarea, #quote-form input[name=name], .jtqf input[name=name]');
    for (var i = 0; i < fields.length; i++) if (fields[i].value) return true;
    return false;
  }

  function show() {
    if (shown || !armed || (!PREVIEW && busy())) return;
    shown = true;
    if (!PREVIEW) store.set(KEY_SEEN, String(Date.now()));
    opener = document.activeElement;
    // The page behind stays put while the dialog is open (phones scroll-chain).
    var root = document.documentElement, overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    if (!document.getElementById('jttx-style')) {
      var st = document.createElement('style');
      st.id = 'jttx-style';
      st.textContent = STYLE;
      document.head.appendChild(st);
    }
    var bg = document.createElement('div');
    bg.className = 'jttx-bg';
    bg.innerHTML = markup();
    document.body.appendChild(bg);
    var form = bg.querySelector('form');
    var err = bg.querySelector('.e');
    var close = function () {
      if (!bg.parentNode) return;
      bg.parentNode.removeChild(bg);
      root.style.overflow = overflow;
      document.removeEventListener('keydown', onKey);
      if (opener && opener.focus) try { opener.focus(); } catch (e) { /* gone */ }
    };
    var onKey = function (e) {
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      // Keep Tab inside the dialog while it is open.
      var f = bg.querySelectorAll('button, input, a[href]');
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
      else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    };
    document.addEventListener('keydown', onKey);
    bg.querySelector('.jttx-x').addEventListener('click', close);
    bg.querySelector('.no').addEventListener('click', close);
    bg.addEventListener('click', function (e) { if (e.target === bg) close(); });
    form.addEventListener('submit', function (e) {
      // The server says the same, but saying it here keeps what they typed.
      if (!form.querySelector('input[name=sms_marketing]').checked) {
        e.preventDefault();
        err.textContent = 'The code comes with our deals texts, so please tick the second box.';
        err.style.display = 'block';
        return;
      }
      if (form.jtSending) { e.preventDefault(); return; }
      form.jtSending = true;
      form.querySelector('button[type=submit]').disabled = true;
      // A submit, not a sign-up: /texts may still refuse the number. Sign-ups
      // are counted from text_signups (source 'popup').
      track('texts_popup_submit');
    });
    // Back from the /texts page (bfcache): let them fix the number and resend.
    window.addEventListener('pageshow', function (e) {
      if (!e.persisted) return;
      form.jtSending = false;
      form.querySelector('button[type=submit]').disabled = false;
    });
    var phone = bg.querySelector('#jttx-phone');
    // On a computer the cursor goes to the number; on a phone that would open
    // the keyboard over the button before they have read the offer.
    var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (fine && phone && phone.focus) phone.focus();
    track('texts_popup_shown');
  }

  if (PREVIEW) {
    armed = true;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
    return;
  }
  setTimeout(function () {
    armed = true;
    if (window.Image) new window.Image().src = LOGO;
  }, ARM_MS);

  var hover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (hover) {
    /* Leaving through the top, toward the tabs or the address bar. Browsers
       report the last point they sampled INSIDE the page, and Safari's can be
       well below the edge on a quick flick, so the first version, which
       waited for clientY <= 0, never opened there (owner, 2026-10-18). A
       leave counts when it is near the top, or when the pointer was heading
       up through the top quarter; one that leaves by a side edge does not.
       mouseleave on the root only fires when the pointer leaves the page,
       not when it moves onto an embedded map or widget. */
    var lastY = null, rising = false;
    document.addEventListener('mousemove', function (e) {
      if (lastY !== null && e.clientY !== lastY) rising = e.clientY < lastY;
      lastY = e.clientY;
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', function (e) {
      var w = window.innerWidth || document.documentElement.clientWidth;
      if (e.clientX <= 0 || e.clientX >= w - 1) return;
      if (e.clientY < 50 || (rising && e.clientY < window.innerHeight / 4)) show();
    });
  } else {
    var start = Date.now();
    var check = function () {
      if (shown || Date.now() - start < PHONE_MS) return;
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var depth = max > 0 ? window.scrollY / max : 1;
      if (depth < PHONE_DEPTH) return;
      show();
      // Only stop listening once it has actually opened (busy() may defer it).
      if (shown) window.removeEventListener('scroll', check);
    };
    window.addEventListener('scroll', check, { passive: true });
    setTimeout(check, PHONE_MS);
  }
})();
