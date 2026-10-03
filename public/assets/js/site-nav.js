/* The one site menu (tools/site-nav.js): dropdowns that also open on tap, and
   the phone drawer. Hover and keyboard focus are handled in CSS. */
(function () {
  'use strict';
  var dds = document.querySelectorAll('.jtn-dd');
  function closeAll(except) {
    Array.prototype.forEach.call(dds, function (d) {
      if (d !== except) { d.classList.remove('open'); d.querySelector('.jtn-dd-t').setAttribute('aria-expanded', 'false'); }
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

  /* Every "Text us" link opens the Tawk messenger, on phones too (owner,
     2026-10-02): conversations there are tracked, a text from the phone's
     Messages app is not. If Tawk has not loaded (blocked, slow, or a page
     without it) the sms: link works as before, so the button never goes dead.
     Calls (tel:) are never touched. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href^="sms:"]');
    if (!a || e.defaultPrevented) return;
    var tawk = window.Tawk_API;
    if (!tawk || typeof tawk.maximize !== 'function') return;
    e.preventDefault();
    try { tawk.maximize(); } catch (err) { window.location.href = a.getAttribute('href'); }
  });

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
