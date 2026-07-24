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

  var GA4_ID = 'G-XXXXXXXXXX';           // <-- replace to activate GA4
  var META_PIXEL_ID = 'XXXXXXXXXXXXXXX'; // <-- replace to activate Meta Pixel

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

  // ── Auto-instrument Design Studio discovery ───────────────────────────
  // Fires `designer_open` on any click of a link to design.jtees.net, on
  // every page, with zero per-link markup — this is the metric that answers
  // "how many visitors actually reach the Design Studio."
  document.addEventListener('DOMContentLoaded', function () {
    var links = document.querySelectorAll('a[href*="design.jtees.net"]');
    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener('click', function () {
        window.jtTrack('designer_open', { href: a.getAttribute('href') });
      });
    });
  });
})();
