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

  // ── Unified event helper ──────────────────────────────────────────────
  // Usage anywhere:  window.jtTrack('lead_captured', { source: 'quote-form' });
  window.jtTrack = function (name, params) {
    params = params || {};
    if (gaOn && window.gtag) window.gtag('event', name, params);
    if (fbOn && window.fbq) window.fbq('trackCustom', name, params);
  };

  // ── Auto-instrument clicks (zero per-link markup, covers every page) ───
  //   design.jtees.net links -> designer_open   (designer discovery)
  //   tel: links             -> phone_click + Meta 'Contact'
  //   sms: links             -> text_click  + Meta 'Contact'
  document.addEventListener('DOMContentLoaded', function () {
    function bind(sel, handler) {
      Array.prototype.forEach.call(document.querySelectorAll(sel), function (a) {
        a.addEventListener('click', function () { handler(a); });
      });
    }
    bind('a[href*="design.jtees.net"]', function (a) {
      window.jtTrack('designer_open', { href: a.getAttribute('href') });
    });
    bind('a[href^="tel:"]', function (a) {
      window.jtTrack('phone_click', { number: a.getAttribute('href').replace('tel:', '') });
      if (fbOn && window.fbq) window.fbq('track', 'Contact');
    });
    bind('a[href^="sms:"]', function () {
      window.jtTrack('text_click', {});
      if (fbOn && window.fbq) window.fbq('track', 'Contact');
    });
  });
})();
