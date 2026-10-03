/*
 * Review strip at the bottom of every site page (placed by tools/site-nav.js
 * into <div id="jt-reviews">). Someone who lands on a service, area or blog
 * page from a search sees nothing about the shop's reputation otherwise.
 * Same reviews and same strip as the quote page: assets/data/reviews.json and
 * assets/css/review-strip.css.
 *
 * Built with DOM calls and textContent. No review structured data on purpose:
 * Google ignores self-published review stars for a LocalBusiness and can treat
 * them as spam.
 */
(function () {
  'use strict';
  var box = document.getElementById('jt-reviews');
  if (!box || !window.fetch) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  fetch('/assets/data/reviews.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.reviews || !d.reviews.length) return;
    function set() {
      var s = el('div', 'rv-set');
      d.reviews.forEach(function (r) {
        var c = el('div', 'rv');
        if (r.photo && /^\/assets\/images\//.test(r.photo)) {
          var img = el('img');
          img.src = r.photo; img.alt = 'Customer photo from this Google review'; img.loading = 'lazy';
          c.appendChild(img);
        }
        c.appendChild(el('div', 'stars', '★★★★★'));
        c.appendChild(el('div', 'rv-t', r.title));
        c.appendChild(el('div', 'rv-x', r.text));
        c.appendChild(el('div', 'rv-w', r.who));
        s.appendChild(c);
      });
      return s;
    }
    var sec = el('section', 'jtr');
    sec.setAttribute('aria-label', 'Customer reviews');
    var inner = el('div', 'jtr-in');
    var head = el('div', 'jtr-h');
    head.appendChild(el('b', '', 'What customers say'));
    var badge = el('span', 'jtr-badge');
    var star = el('span', '', '★ ');
    badge.appendChild(star);
    badge.appendChild(document.createTextNode(d.rating + ' on Google · ' + d.count_on_google + ' reviews'));
    head.appendChild(badge);
    var all = el('a', 'jtr-all', 'See all reviews →');
    all.href = '/#reviews';
    all.addEventListener('click', function () { if (window.jtTrack) window.jtTrack('review_strip_click', {}); });
    head.appendChild(all);
    var wrap = el('div', 'rv-wrap');
    var track = el('div', 'rv-track');
    // Two copies so the marquee loops without a visible jump; the second is
    // hidden from screen readers.
    track.appendChild(set());
    var dup = set(); dup.setAttribute('aria-hidden', 'true');
    track.appendChild(dup);
    wrap.appendChild(track);
    inner.appendChild(head);
    inner.appendChild(wrap);
    sec.appendChild(inner);
    box.appendChild(sec);
  }).catch(function () { /* no strip is better than a broken one */ });
})();
