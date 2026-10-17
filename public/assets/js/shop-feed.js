/*
 * Product cards on the homepage and the service, area and blog pages (all
 * written by tools/page-blocks.js): every card the designer's live feed
 * (/api/shop-feed) lists, by the same link, takes the feed's photo and price,
 * and a product switched off there is hidden. Anything short of a good answer
 * leaves the built-in cards alone.
 *
 * Cards are built with DOM calls and textContent, never innerHTML: the names
 * and links come from another service.
 */
(function () {
  'use strict';
  var pageCards = document.querySelectorAll('a.pb-card');
  if (!window.fetch || !pageCards.length) return;

  /* Page cards keep their place and name. A card the feed lists, by the same
     link, takes the feed's photo and price. A product card the feed no longer
     lists (switched off in the Design Studio) is hidden, but only when the
     feed carries a full product list, so an outage never empties a shelf. */
  function refresh(d) {
    var byLink = {};
    var products = d.products || [];
    (d.categories || []).concat(d.best || [], products).forEach(function (it) { byLink[it.link] = it; });
    Array.prototype.forEach.call(pageCards, function (a) {
      var it = byLink[a.href];
      if (!it) {
        if (products.length >= 20 && /\/product\.php\?product_id=\d+$/.test(a.href)) a.hidden = true;
        return;
      }
      var img = a.querySelector('.pb-im img');
      if (img && it.image) img.src = it.image;
      var pr = a.querySelector('.pb-pr');
      if (pr && typeof it.from_price === 'number') pr.textContent = 'From $' + it.from_price.toFixed(2) + ' + printing';
    });
  }

  /* The landing pages share /api/shop-feed's per-visitor limit with the quote
     form's token and photo uploads, so one answer is kept per tab for 10
     minutes: browsing twenty service pages asks once, not twenty times. */
  var KEY = 'jt_shop_feed2', TTL = 10 * 60 * 1000;
  function cached() {
    try {
      var c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      return c && Date.now() - c.at < TTL ? c.d : null;
    } catch (e) { return null; }
  }
  function remember(d) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), d: d })); } catch (e) { /* private mode */ }
  }

  var hit = cached();
  if (hit) { refresh(hit); return; }

  fetch('/api/shop-feed', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.status === 200 ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      remember(d);
      refresh(d);
    })
    .catch(function () { /* keep the built-in cards */ });
})();
