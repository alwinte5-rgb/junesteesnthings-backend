/* June's Tees — visitor quick-question chips for the Tawk.to chat.
   Shows tappable common questions above the chat bubble; tapping one opens
   the chat and reports the chosen question to the agent as a chat event
   (answer fast with the matching /shortcut). Shown once per session. */
(function () {
  'use strict';
  if (window.__jtChipsInit) return;
  window.__jtChipsInit = true;

  var QUESTIONS = [
    ['💲', 'How much does a custom shirt cost?'],
    ['⏱️', 'How fast can I get my order?'],
    ['👕', 'Do you do bulk or team orders?'],
    ['🎨', 'Can you help me with my design?']
  ];

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  }

  function openChat(question) {
    try {
      if (window.Tawk_API && Tawk_API.maximize) {
        if (question) {
          if (Tawk_API.addEvent) Tawk_API.addEvent('quick-question', { question: question }, function () {});
          if (Tawk_API.setAttributes) Tawk_API.setAttributes({ 'quick-question': question }, function () {});
        }
        Tawk_API.maximize();
      }
    } catch (e) { /* chat not ready — the bubble itself still works */ }
  }

  ready(function () {
    var KEY = 'jt_chips_seen';
    try { if (sessionStorage.getItem(KEY)) return; } catch (e) { return; }

    setTimeout(function () {
      if (!window.Tawk_API) return;
      var wrap = document.createElement('div');
      wrap.id = 'jt-chips';
      wrap.setAttribute('style',
        'position:fixed;bottom:96px;right:18px;z-index:2147482998;max-width:270px;' +
        'background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:14px;' +
        'box-shadow:0 10px 30px rgba(15,23,42,.18);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;');
      var title = document.createElement('div');
      title.setAttribute('style', 'display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;');
      title.innerHTML = '<strong style="font-size:14px;color:#111827;">Questions? Tap one 👇</strong>';
      var close = document.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close');
      close.setAttribute('style', 'border:0;background:none;color:#9ca3af;font-size:18px;line-height:1;cursor:pointer;padding:0 0 0 8px;');
      close.textContent = '×';
      close.onclick = function () {
        try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
        wrap.remove();
      };
      title.appendChild(close);
      wrap.appendChild(title);

      QUESTIONS.forEach(function (q) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('style',
          'display:block;width:100%;text-align:left;margin:6px 0;padding:9px 12px;' +
          'border:1px solid #dbe3f8;border-radius:100px;background:#f4f7ff;color:#1848B8;' +
          'font-size:13px;font-weight:600;cursor:pointer;');
        b.textContent = q[0] + ' ' + q[1];
        b.onclick = function () {
          try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
          wrap.remove();
          openChat(q[1]);
        };
        wrap.appendChild(b);
      });

      var other = document.createElement('button');
      other.type = 'button';
      other.setAttribute('style',
        'display:block;width:100%;text-align:center;margin-top:8px;padding:9px 12px;border:0;' +
        'border-radius:100px;background:#1848B8;color:#fff;font-size:13px;font-weight:700;cursor:pointer;');
      other.textContent = 'Ask something else 💬';
      other.onclick = function () {
        try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
        wrap.remove();
        openChat('');
      };
      wrap.appendChild(other);

      document.body.appendChild(wrap);
    }, 6000);
  });
})();
