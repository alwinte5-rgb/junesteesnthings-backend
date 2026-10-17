/*
 * The reviews block on the service, area and blog pages (tools/page-blocks.js
 * writes every review into the page, three of them showing). On each visit
 * this shows three at random instead, so a returning visitor, or one reading
 * several pages, does not see the same three every time (owner, 2026-10-17:
 * "can the reviews shuffle? it's the same 3 images on all the pages").
 *
 * Only toggles the hidden attribute on cards already in the page; no fetch,
 * no HTML built from data.
 */
(function () {
  'use strict';
  var box = document.querySelector('.pb-rvs');
  if (!box) return;
  var cards = Array.prototype.slice.call(box.querySelectorAll('.pb-rv'));
  if (cards.length <= 3) return;
  for (var i = cards.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = cards[i]; cards[i] = cards[j]; cards[j] = t;
  }
  cards.forEach(function (c, k) {
    if (k < 3) { c.hidden = false; box.appendChild(c); } else { c.hidden = true; }
  });
})();
