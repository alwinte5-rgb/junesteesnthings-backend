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
  if (!window.fetch || !document.getElementById('shop-categories')) return;

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

  fetch('/api/shop-feed', { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.status === 200 ? r.json() : null; })
    .then(function (d) {
      if (!d) return;
      /* Every category, signs included (the feed caps it at 16). Showing the
         first 8 left the banner and sign categories off the homepage. */
      fill('shop-categories', (d.categories || []).slice(0, 16), 'home_shop', 'category', false);
      fill('shop-best', (d.best || []).slice(0, 4), 'home_best', 'product', true);
    })
    .catch(function () { /* keep the built-in cards */ });
})();
