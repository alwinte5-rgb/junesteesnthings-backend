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
     link, takes the feed's photo and price ("Priced as you design" when the
     product has no set price). A product card missing from the list is hidden
     (switched off in the Design Studio), but only when the feed says the list
     is the whole catalogue, so an outage or partial answer never empties a
     shelf. */
  function refresh(d) {
    var byLink = {};
    var products = d.products || [];
    (d.categories || []).concat(d.best || [], products).forEach(function (it) {
      /* A later list wins, but never with an emptier colour list. */
      var had = byLink[it.link];
      if (had && had.colors && had.colors.length && !(it.colors && it.colors.length)) {
        it = Object.assign({}, it, { colors: had.colors, color_count: had.color_count });
      }
      byLink[it.link] = it;
    });
    Array.prototype.forEach.call(pageCards, function (a) {
      var it = byLink[a.href];
      if (!it) {
        if (d.products_complete === true && /\/product\.php\?product_id=\d+$/.test(a.href)) a.hidden = true;
        return;
      }
      /* A card with its own photo and line (data-own) keeps them: the feed's
         photo for Big Head Cutouts is only a drawing, and one "From" price
         undersells a pack. */
      if (a.getAttribute('data-own') === '1') return;
      /* An all-in card (mugs, pillows) keeps its photo, the feed's being the
         bare designer drawing, and its price unless the feed sends a real
         all-in one: an older or failing feed never turns a right price into
         "Priced as you design". */
      var allIn = a.getAttribute('data-all-in') === '1';
      var img = a.querySelector('.pb-im img');
      if (img && it.image && !allIn) img.src = it.image;
      var pr = a.querySelector('.pb-pr');
      if (pr && allIn) { if (it.all_in && typeof it.from_price === 'number') pr.textContent = 'From $' + it.from_price.toFixed(2) + ' each, printing included'; }
      else if (pr) pr.textContent = typeof it.from_price !== 'number' ? 'Priced as you design'
        : 'From $' + it.from_price.toFixed(2) + (it.all_in ? ' each, printing included' : ' + printing');
      if (pr) dots(pr, it.colors, it.color_count);
    });
  }

  /* Up to 8 colour dots under the price, then "+N more" (the designer's own
     cards do the same), drawn into the empty row the page already holds so
     the card does not grow when the feed lands. The hex was checked by the
     server (tools/lib/shop-feed.js HEX — a test keeps the two the same); it is
     checked again here because it is written into a style. */
  var HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  var PHOTO = /^https:\/\/(?:res\.cloudinary\.com|cdn\.ssactivewear\.com)\/[^\s"'<>()\\]{1,300}$/;

  /* A dot shows its colour on the card (owner, 2026-10-19): pointing swaps the
     card photo, leaving the row puts it back, and a tap (a phone has no hover)
     keeps that colour instead of opening the product. */
  function cardImg(d) { var a = d.closest('a.pb-card'); return a && a.querySelector('.pb-im img'); }
  function mark(row, src) {
    Array.prototype.forEach.call(row.querySelectorAll('.pb-dot'), function (x) { x.classList.toggle('is-on', !!src && x.getAttribute('data-photo') === src); });
  }
  function showDot(d, pin) {
    var img = cardImg(d); if (!img) return;
    if (!img.getAttribute('data-orig')) img.setAttribute('data-orig', img.currentSrc || img.src);
    /* A colour photo that fails to load puts the card's own photo back. */
    img.onerror = function () { img.onerror = null; img.removeAttribute('data-pin'); img.src = img.getAttribute('data-orig'); mark(d.parentNode, null); };
    img.src = d.getAttribute('data-photo');
    if (pin) img.setAttribute('data-pin', img.src);
    mark(d.parentNode, img.src);
  }
  document.addEventListener('mouseover', function (e) {
    var d = e.target.closest && e.target.closest('.pb-dot[data-photo]'); if (d) showDot(d, false);
  });
  document.addEventListener('mouseout', function (e) {
    var row = e.target.closest && e.target.closest('.pb-dots');
    if (!row || (e.relatedTarget && row.contains(e.relatedTarget))) return;
    var first = row.querySelector('.pb-dot'), img = first && cardImg(first);
    if (!img || !img.getAttribute('data-orig')) return;
    img.src = img.getAttribute('data-pin') || img.getAttribute('data-orig');
    mark(row, img.getAttribute('data-pin'));
  });
  document.addEventListener('click', function (e) {
    var d = e.target.closest && e.target.closest('.pb-dot[data-photo]'); if (!d) return;
    e.preventDefault(); e.stopPropagation(); showDot(d, true);
  }, true);
  function dots(after, list, count) {
    if (!after.parentNode) return;
    var row = after.parentNode.querySelector('.pb-dots');
    if (!row) {
      row = document.createElement('div');
      row.className = 'pb-dots';
      after.parentNode.insertBefore(row, after.nextSibling);
    }
    while (row.firstChild) row.removeChild(row.firstChild);
    var cs = (list || []).filter(function (c) { return c && HEX.test(c.hex) && typeof c.name === 'string'; }).slice(0, 8);
    var total = Math.max(cs.length, typeof count === 'number' ? count : 0);
    if (total < 2 || !cs.length) { row.setAttribute('aria-hidden', 'true'); return; }
    row.removeAttribute('aria-hidden');
    row.setAttribute('role', 'img');
    /* The names, for a screen reader: a dot's title reaches a mouse only. */
    row.setAttribute('aria-label', 'Colors: ' + cs.map(function (c) { return c.name; }).join(', ') +
      (total > cs.length ? ' and ' + (total - cs.length) + ' more' : ''));
    cs.forEach(function (c) {
      var d = document.createElement('span');
      d.className = 'pb-dot';
      d.style.background = c.hex;
      d.title = c.name;
      /* Its colour's photo (checked by the server, again here: it becomes an img src). */
      if (typeof c.photo === 'string' && PHOTO.test(c.photo)) d.setAttribute('data-photo', c.photo);
      row.appendChild(d);
    });
    if (total > cs.length) {
      var more = document.createElement('span');
      more.className = 'pb-dots-more';
      more.textContent = '+' + (total - cs.length) + ' more';
      row.appendChild(more);
    }
  }

  /* The landing pages share /api/shop-feed's per-visitor limit with the quote
     form's token and photo uploads, so one answer is kept per tab for 10
     minutes: browsing twenty service pages asks once, not twenty times. */
  var KEY = 'jt_shop_feed6', TTL = 10 * 60 * 1000;
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
