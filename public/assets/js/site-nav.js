/* The one site menu (tools/site-nav.js): dropdowns that also open on tap, and
   the phone drawer. Hover and keyboard focus are handled in CSS. */
(function () {
  'use strict';
  /* The cart's count (owner, 2026-10-20: "the cart says its empty in the
     menu"). The Design Studio keeps the cart in its own browser storage, which
     this site cannot read; it publishes only the number of lines, in the
     cookie jt_cart_n on .jtees.net (lumise-designer jt-cart-sync.php). Drawn
     with textContent, from a whole number only. */
  window.jtCartBadge = function () {
    var m = /(?:^|;\s*)jt_cart_n=(\d{1,4})(?:;|$)/.exec(document.cookie || '');
    var n = m ? parseInt(m[1], 10) : 0, label = n > 99 ? '99+' : String(n);
    Array.prototype.forEach.call(document.querySelectorAll('.jtn-ico-cart, .jtn-drawer-me a[href$="/cart.php"]'), function (a) {
      var b = a.querySelector('.jtn-cart-n');
      if (!n) { if (b) b.remove(); a.setAttribute('aria-label', 'Cart'); return; }
      if (!b) { b = document.createElement('span'); b.className = 'jtn-cart-n'; a.appendChild(b); }
      b.textContent = label;
      a.setAttribute('aria-label', 'Cart, ' + n + (n === 1 ? ' item' : ' items'));
    });
  };
  window.jtCartBadge();
  var dds = document.querySelectorAll('.jtn-dd');
  function closeAll(except) {
    Array.prototype.forEach.call(dds, function (d) {
      if (d !== except) {
        d.classList.remove('open'); d.querySelector('.jtn-dd-t').setAttribute('aria-expanded', 'false');
        // Its submenus close with it, so it opens fresh next time.
        Array.prototype.forEach.call(d.querySelectorAll('.jtn-sub.open'), function (s) { s.classList.remove('open'); s.querySelector('.jtn-sub-t').setAttribute('aria-expanded', 'false'); });
      }
    });
  }
  Array.prototype.forEach.call(dds, function (d) {
    var t = d.querySelector('.jtn-dd-t');
    t.addEventListener('click', function () {
      var open = !d.classList.contains('open');
      closeAll(d);
      d.classList.toggle('open', open);
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.jtn-dd')) closeAll(); });
  /* Submenus inside a dropdown open on tap (and stay open while the
     dropdown is), and do not close the dropdown they sit in. */
  Array.prototype.forEach.call(document.querySelectorAll('.jtn-sub'), function (s) {
    var t = s.querySelector('.jtn-sub-t');
    t.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !s.classList.contains('open');
      s.classList.toggle('open', open);
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });

  /* Every "Text us" link opens the Tawk messenger, on phones too (owner,
     2026-10-02): conversations there are tracked, a text from the phone's
     Messages app is not. If Tawk has not loaded (blocked, slow, or a page
     without it) the sms: link works as before, so the button never goes dead.
     Calls (tel:) are never touched. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="sms:"]');
    if (!a || e.defaultPrevented) return;
    if (typeof window.jtOpenChat === 'function') { e.preventDefault(); window.jtOpenChat(); return; }
    var tawk = window.Tawk_API;
    if (!tawk || typeof tawk.maximize !== 'function') return;
    e.preventDefault();
    try { tawk.maximize(); } catch (err) { window.location.href = a.getAttribute('href'); }
  });

  /* Search icon: opens the search field under the menu (the link itself goes
     to the product list, which is where a press lands if this script fails). */
  var sIcon = document.querySelector('.jtn-ico-search');
  var sForm = document.getElementById('jtn-search');
  if (sIcon && sForm) {
    sIcon.addEventListener('click', function (e) {
      e.preventDefault();
      var open = sForm.hidden;
      sForm.hidden = !open;
      sIcon.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) sForm.querySelector('input').focus();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !sForm.hidden) { sForm.hidden = true; sIcon.setAttribute('aria-expanded', 'false'); sIcon.focus(); }
    });
  }

  var burger = document.querySelector('.jtn-burger');
  var drawer = document.getElementById('jtn-drawer');
  var shade = document.querySelector('.jtn-shade');
  if (!burger || !drawer || !shade) return;
  function setOpen(open) {
    drawer.hidden = !open; shade.hidden = !open;
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) drawer.querySelector('.jtn-close').focus();
  }
  burger.addEventListener('click', function () { setOpen(true); });
  shade.addEventListener('click', function () { setOpen(false); });
  drawer.querySelector('.jtn-close').addEventListener('click', function () { setOpen(false); burger.focus(); });
  drawer.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeAll(); if (!drawer.hidden) { setOpen(false); burger.focus(); } }
  });
})();
