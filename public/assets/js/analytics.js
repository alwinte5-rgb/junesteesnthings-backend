/*
 * June's Tees — centralized site analytics (GA4 + Meta Pixel).
 *
 * ┌─ ACTIVATION ────────────────────────────────────────────────────────────┐
 * │ Replace the two placeholder IDs below with the real ones. Until then     │
 * │ this file is a safe no-op: nothing loads and nothing is tracked, so it   │
 * │ is safe to ship as-is.                                                    │
 * │                                                                          │
 * │   GA4_ID         Google Analytics → Admin → Data Streams → Web →         │
 * │                  "Measurement ID"  (looks like  G-XXXXXXXXXX)            │
 * │   META_PIXEL_ID  Meta Events Manager → Data Sources → your Pixel →       │
 * │                  "Pixel ID"  (a long number)                            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * CROSS-DOMAIN (important): the Design Studio at design.jtees.net is a
 * separate app/repo (lumise-designer). For a visitor who moves from
 * jtees.net → design.jtees.net to count as ONE session / ONE funnel, the
 * SAME GA4 Measurement ID must also be installed on design.jtees.net, and
 * both domains listed under GA4 Admin → Data Streams → Configure tag
 * settings → Configure your domains. The `linker` config below is the
 * jtees.net half of that; it is harmless until the other half is in place.
 */
(function () {
  'use strict';

  var GA4_ID = 'G-E65381594C';           // June's Tees & Things — ONE GA4 property across both domains (cross-domain funnel)
  var META_PIXEL_ID = '348199180594218'; // June's Tees Meta Pixel (same on both domains)

  var gaOn = GA4_ID && GA4_ID.indexOf('XXXX') === -1;
  var fbOn = META_PIXEL_ID && META_PIXEL_ID.indexOf('XXXX') === -1;

  // ── Google Analytics 4 ────────────────────────────────────────────────
  if (gaOn) {
    var g = document.createElement('script');
    g.async = true;
    g.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA4_ID;
    document.head.appendChild(g);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA4_ID, {
      linker: { domains: ['jtees.net', 'design.jtees.net'] }
    });
  }

  // ── Meta (Facebook) Pixel ─────────────────────────────────────────────
  if (fbOn) {
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  // ── Microsoft Clarity (heatmaps + session recordings) ─────────────────
  var CLARITY_ID = 'xs2ulr5z6y';
  if (CLARITY_ID && CLARITY_ID.indexOf('XXXX') === -1) {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  // ── Unified event helper ──────────────────────────────────────────────
  // Usage anywhere:  window.jtTrack('lead_captured', { source: 'quote-form' });
  // Money events go to Meta as its STANDARD events (fbq 'track'), which is
  // what ad optimisation reads; the designer's analytics.php maps the same.
  // Never put an email, phone or name in params — ids and amounts only.
  var META_STANDARD = { purchase: 'Purchase', add_to_cart: 'AddToCart', begin_checkout: 'InitiateCheckout' };
  window.jtTrack = function (name, params) {
    params = params || {};
    if (gaOn && window.gtag) window.gtag('event', name, params);
    if (fbOn && window.fbq) {
      var std = META_STANDARD[name];
      if (std) {
        var fb = {};
        if (params.value !== undefined) fb.value = params.value;
        if (params.currency) fb.currency = params.currency;
        window.fbq('track', std, fb, params.transaction_id ? { eventID: String(params.transaction_id) } : undefined);
      } else {
        window.fbq('trackCustom', name, params);
      }
    }
  };

  // ── Auto-instrument clicks (zero per-link markup, covers every page) ───
  //   design.jtees.net links -> designer_open {href, from}  (designer discovery)
  //   a[data-card]           -> shop_card_click {kind, name, from}
  //   tel: links             -> phone_click + Meta 'Contact'
  //   sms: links             -> text_click  + Meta 'Contact'
  // One listener on the document rather than one per link, so cards a script
  // adds after load (the homepage's live Shop cards) are counted too.
  // `from` is the link's data-from, else the id of the section it sits in,
  // which is what tells a hero click from a Shop-card click.
  function whereFrom(a) {
    if (a.getAttribute('data-from')) return a.getAttribute('data-from');
    var sec = a.closest('section[id], header, footer, nav');
    return sec ? (sec.id || sec.tagName.toLowerCase()) : 'page';
  }
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (a.hasAttribute('data-card')) {
      var nm = a.querySelector('.nm');
      window.jtTrack('shop_card_click', {
        kind: a.getAttribute('data-card'),
        name: nm ? nm.textContent.trim().slice(0, 100) : '',
        from: whereFrom(a)
      });
    }
    if (href.indexOf('design.jtees.net') !== -1) {
      window.jtTrack('designer_open', { href: href, from: whereFrom(a) });
    } else if (href.indexOf('tel:') === 0) {
      window.jtTrack('phone_click', { number: href.replace('tel:', '') });
      if (fbOn && window.fbq) window.fbq('track', 'Contact');
    } else if (href.indexOf('sms:') === 0) {
      window.jtTrack('text_click', {});
      if (fbOn && window.fbq) window.fbq('track', 'Contact');
    }
  });
})();

/* First touch (plan Phase 1c): how this visitor FIRST found us, kept for 90
   days on .jtees.net so jtees.net and the Design Studio share it, and never
   overwritten. A quote request or order sends it along, and the owner's lead
   card shows "Came from: Google Ads / Instagram / …". Marketing tags only —
   no name, email or phone. Same block in lumise-designer/analytics.php;
   the server cleans it (tools/lib/first-touch.js). */
(function () {
  try {
    if (/(?:^|;\s*)jt_ft=/.test(document.cookie)) return;
    var q = new URLSearchParams(location.search), ft = {};
    var put = function (k, v, cap) { if (v) ft[k] = String(v).slice(0, cap); };
    put('src', q.get('utm_source'), 100); put('med', q.get('utm_medium'), 100); put('cmp', q.get('utm_campaign'), 120);
    put('gclid', q.get('gclid'), 300); put('fbclid', q.get('fbclid'), 300); put('msclkid', q.get('msclkid'), 300);
    var r = document.referrer || '';
    if (r && !/^https?:\/\/([a-z0-9-]+\.)*jtees\.net(\/|$)/i.test(r)) put('ref', r.split('?')[0], 200);
    put('land', location.hostname.replace(/^www\./, '') + location.pathname, 200);
    put('at', new Date().toISOString().slice(0, 10), 30);
    var dom = /(^|\.)jtees\.net$/.test(location.hostname) ? '; domain=.jtees.net' : '';
    document.cookie = 'jt_ft=' + encodeURIComponent(JSON.stringify(ft)) + '; max-age=' + (90 * 86400) +
      '; path=/' + dom + '; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
  } catch (e) { /* never break the page for analytics */ }
})();
