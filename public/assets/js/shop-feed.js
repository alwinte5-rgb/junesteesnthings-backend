/*
 * Homepage Shop cards: swap the cards built into the page for the designer's
 * live ones (/api/shop-feed), so a product switched off in the Design Studio
 * disappears here too. Anything short of a good answer leaves the built-in
 * cards alone — the shop is never shown empty.
 *
 * Cards are built with DOM calls and textContent, never innerHTML: the names
 * and links come from another service.
 */
(function () {
  'use strict';
  /* The homepage's grids, or the product cards tools/page-blocks.js writes
     into the service, area and blog pages. */
  var pageCards = document.querySelectorAll('a.pb-card');
  if (!window.fetch || (!document.getElementById('shop-categories') && !pageCards.length)) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function card(item, from, kind, showBlurb) {
    var a = el('a', 'jt-card');
    a.href = item.link;
    a.setAttribute('data-from', from);
    a.setAttribute('data-card', kind);
    var im = el('div', 'im');
    var img = el('img');
    img.src = item.image;
    img.alt = 'Custom ' + item.name + " by June's Tees";
    img.loading = 'lazy';
    im.appendChild(img);
    var bd = el('div', 'bd');
    bd.appendChild(el('div', 'nm', item.name));
    /* Every card carries a price line, so the two grids read the same. */
    if (showBlurb && item.blurb) bd.appendChild(el('div', 'bl', item.blurb));
    bd.appendChild(el('div', 'pr', typeof item.from_price === 'number'
      ? 'From $' + item.from_price.toFixed(2) + ' + printing' : 'Priced as you design'));
    bd.appendChild(el('span', 'go', 'Design This →'));
    a.appendChild(im);
    a.appendChild(bd);
    return a;
  }

  function fill(id, items, from, kind, showBlurb) {
    var box = document.getElementById(id);
    if (!box || !items || !items.length) return;
    var frag = document.createDocumentFragment();
    items.forEach(function (it) { frag.appendChild(card(it, from, kind, showBlurb)); });
    while (box.firstChild) box.removeChild(box.firstChild);
    box.appendChild(frag);
  }

  /* Page cards keep their place and name; only a card the feed still lists,
     by the same link, gets the feed's photo and price. A card the feed no
     longer lists keeps its built-in photo, so a page never loses a card. */
  function refresh(d) {
    var byLink = {};
    (d.categories || []).concat(d.best || []).forEach(function (it) { byLink[it.link] = it; });
    Array.prototype.forEach.call(pageCards, function (a) {
      var it = byLink[a.href];
      if (!it) return;
      var img = a.querySelector('.pb-im img');
      if (img && it.image) img.src = it.image;
      var pr = a.querySelector('.pb-pr');
      if (pr && typeof it.from_price === 'number') pr.textContent = 'From $' + it.from_price.toFixed(2) + ' + printing';
    });
  }

  /* The landing pages share /api/shop-feed's per-visitor limit with the quote
     form's token and photo uploads, so one answer is kept per tab for 10
     minutes: browsing twenty service pages asks once, not twenty times. */
  var KEY = 'jt_shop_feed', TTL = 10 * 60 * 1000;
  function cached() {
    try {
      var c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      return c && Date.now() - c.at < TTL ? c.d : null;
    } catch (e) { return null; }
  }
  function remember(d) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), d: d })); } catch (e) { /* private mode */ }
  }

  var hit = pageCards.length ? cached() : null;
  if (hit) { refresh(hit); return; }

  fetch('/api/shop-feed', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.status === 200 ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      remember(d);
      if (pageCards.length) { refresh(d); return; }
      /* Every category, signs included (the feed caps it at 16). Showing the
         first 8 left the banner and sign categories off the homepage. */
      fill('shop-categories', (d.categories || []).slice(0, 16), 'home_shop', 'category', false);
      fill('shop-best', (d.best || []).slice(0, 4), 'home_best', 'product', true);
    })
    .catch(function () { /* keep the built-in cards */ });
})();
