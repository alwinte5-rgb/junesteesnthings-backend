/* June's Tees — Quick Answers: a static chat-style FAQ tool.
   A persistent "Quick answers" pill sits above the Tawk bubble on every page.
   Tapping a question shows the answer INSTANTLY (canned, same answers as the
   Tawk agent shortcuts), chat-bubble style. "Chat with a real person" opens
   the live Tawk chat and tags the last question for the agent.

   Before a live chat starts, the visitor gives their name and email, however
   they open it (this button, the Tawk bubble, a "Text us" link): Tawk's
   onChatMaximized is caught, the chat closed again and this panel's form
   shown. The details go to Tawk (setAttributes), so the chat and the lead
   it makes arrive with them. A chat already under way is never stopped. */
(function () {
  'use strict';
  if (window.__jtQAInit) return;
  window.__jtQAInit = true;

  var QA = [
    ['💲 How much does a custom shirt cost?', "Printing is priced per piece and drops fast with quantity — for example a full-color print runs about $20 at 1 piece down to $5.50 at 200+ (plus the garment). Design it at design.jtees.net to see your exact price live, or tell us what you need in chat and we'll quote it."],
    ['⏱️ How fast can I get my order?', 'Most orders take 7–14 business days, depending on the project. Faster turnaround is available on request. Have a deadline? Chat with us and tell us the date. Rush fees may apply.'],
    ['👕 Do you have minimums?', 'No minimums! Order a single shirt or hundreds — DTF printing lets us do one-offs at a great price. Bulk orders get volume discounts with big breaks at 12, 24, 48, and 100+.'],
    ['🎨 Can you help me with my design?', 'Yes — free design help is included! You can also build it yourself in our online Design Studio (jtees.net) with uploads, fonts, graphics, and an AI designer.'],
    ['🧵 Do you do embroidery?', 'We do! Embroidery is priced by size: small left-chest from $12/ea up to full-back from $65/ea, and prices drop with quantity. No stitch file? One-time digitizing is $25–$65 and reorders never pay it again.'],
    ['📦 Do you ship?', "Yes, we ship nationwide. Local Chicago customers can also do curbside pickup at 3047 N Lincoln Ave #435, Mon–Fri 10:30 AM–6 PM."],
    ['🏢 Business & team orders?', 'We outfit businesses and teams with embroidered polos, branded tees, hats, and jackets. Send your logo once — we keep it on file for every reorder. Volume pricing applies.'],
    ['🖼️ What files work best?', "Best: vector files (AI, EPS, SVG) or high-res PNG (300 DPI at print size). For embroidery: DST, PES, EXP, JEF, VP3, XXX, or EMB — or send regular art and we'll digitize it."],
    ['📝 How do I get a quote?', "Tell us the item, quantity, and your idea — in chat, through the form, or by text at (773) 900-4592 — and we'll price it, usually within 1 business day. Or design it yourself at design.jtees.net and see your price instantly."],
    ['🛒 How do I order?', "Two ways: design it yourself at design.jtees.net and check out online, or tell us what you need and we'll handle everything — we send a proof before anything is printed."],
    ['👨‍👩‍👧 Family reunion, church & group orders?', "Yes — reunions, teams, churches, schools, and events are our specialty. Any quantity, sizes from toddler to 5XL, and per-piece prices drop as your group gets bigger."],
    ['📍 Where are you, and can I pick up?', "We're at 3047 N Lincoln Ave #435 in Chicago. Pickups are Monday–Friday, 10:30 AM–6 PM, by appointment, so please call or text (773) 900-4592 to confirm your time before you come. When you arrive, ring the intercom for June's Tees, come up to the 4th floor, and have a seat in the lobby."],
    ['🧺 How do I care for my shirt?', 'Machine wash cold, inside-out, and tumble dry low. Skip bleach and high heat, and your print will last for years.']
  ];

  /* The name/email step. Storage holds only that it was done, never the
     details, and may be unavailable (private mode), which just asks again. */
  var DONE_KEY = 'jt-chat-details';
  var givenHere = false;   // this page view, for when storage is unavailable
  function detailsGiven() {
    if (givenHere) return true;
    try { return window.localStorage.getItem(DONE_KEY) === '1'; } catch (e) { return false; }
  }
  function rememberDetails() {
    givenHere = true;
    try { window.localStorage.setItem(DONE_KEY, '1'); } catch (e) {}
  }
  function chatOngoing() {
    try { var t = window.Tawk_API; return Boolean(t && t.isChatOngoing && t.isChatOngoing()); } catch (e) { return false; }
  }
  var EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[A-Za-z]{2,24}$/;
  /** '' when fine, else what to fix. Exported for tests. */
  function checkDetails(name, email) {
    name = String(name || '').trim();
    email = String(email || '').trim();
    if (name.length < 2) return 'Please enter your name.';
    if (name.length > 60) return 'Please shorten your name to 60 characters.';
    if (!EMAIL_RE.test(email) || email.length > 120) return 'Please enter a valid email so we can reply if you step away.';
    return '';
  }
  window.__jtChatCheckDetails = checkDetails;

  /* Set when this script opens the chat itself after the form, so its own
     maximize is not caught again. */
  var passing = false;
  var gate = null;   // set once the panel exists: function () that shows the form
  window.Tawk_API = window.Tawk_API || {};
  var priorMax = window.Tawk_API.onChatMaximized;
  window.Tawk_API.onChatMaximized = function () {
    if (typeof priorMax === 'function') { try { priorMax.apply(this, arguments); } catch (e) {} }
    if (passing || detailsGiven() || chatOngoing() || !gate) return;
    try { window.Tawk_API.minimize(); } catch (e) {}
    gate();
  };

  var lastQ = '';

  function openTawk() {
    if (!detailsGiven() && !chatOngoing() && gate) { gate(); return; }
    try {
      if (window.Tawk_API && Tawk_API.maximize) {
        passing = true;
        setTimeout(function () { passing = false; }, 3000);
        if (lastQ && Tawk_API.setAttributes) Tawk_API.setAttributes({ 'quick-question': lastQ }, function () {});
        if (lastQ && Tawk_API.addEvent) Tawk_API.addEvent('quick-question', { question: lastQ }, function () {});
        Tawk_API.maximize();
      }
    } catch (e) {}
  }

  function el(tag, style, html) {
    var e = document.createElement(tag);
    if (style) e.setAttribute('style', style);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var open = false;

    var launcher = el('button',
      'position:fixed;bottom:96px;right:18px;z-index:2147482998;border:0;cursor:pointer;' +
      'background:#1848B8;color:#fff;font-weight:800;font-size:13px;padding:10px 16px;' +
      'border-radius:100px;box-shadow:0 8px 24px rgba(15,23,42,.28);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;',
      '💬 Quick answers');
    launcher.type = 'button';
    /* On a phone with the sticky action bar, sit on the LEFT above it: on the
       right this button and the live-chat bubble stacked over the bar's
       "Call" button (2026-10-08). The panel opens from the same side. */
    var phoneBar = window.matchMedia && window.matchMedia('(max-width: 760px)').matches && document.querySelector('.jt-mcb');

    var panel = el('div',
      'position:fixed;bottom:96px;right:18px;z-index:2147482999;display:none;flex-direction:column;' +
      'width:min(340px,calc(100vw - 36px));height:min(480px,calc(100vh - 140px));' +
      'background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;' +
      'box-shadow:0 16px 44px rgba(15,23,42,.28);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;');

    if (phoneBar) {
      launcher.style.right = 'auto'; launcher.style.left = '12px'; launcher.style.bottom = '84px';
      panel.style.right = 'auto'; panel.style.left = '12px'; panel.style.bottom = '84px';
    }

    var head = el('div',
      'background:#1848B8;color:#fff;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;flex:0 0 auto;',
      '<div><strong style="font-size:14px;display:block;">June’s Tees — Quick Answers</strong>' +
      '<span style="font-size:11px;opacity:.85;">Instant answers · real people one tap away</span></div>');
    var closeB = el('button',
      'border:0;background:none;color:#fff;font-size:20px;line-height:1;cursor:pointer;padding:2px 2px 2px 10px;', '×');
    closeB.type = 'button';
    head.appendChild(closeB);
    panel.appendChild(head);

    var feed = el('div', 'flex:1 1 auto;overflow-y:auto;padding:14px;background:#f6f8fc;');
    feed.appendChild(agentBubble('Hi! 👋 Tap a question below for an instant answer — or chat with a real person anytime.'));
    panel.appendChild(feed);

    function agentBubble(text) {
      var b = el('div', 'max-width:86%;margin:0 auto 10px 0;background:#fff;border:1px solid #e5e7eb;' +
        'border-radius:14px 14px 14px 4px;padding:10px 13px;font-size:13px;line-height:1.5;color:#1f2937;');
      b.textContent = text;
      return b;
    }
    function visitorBubble(text) {
      var b = el('div', 'max-width:86%;margin:0 0 10px auto;background:#1848B8;color:#fff;' +
        'border-radius:14px 14px 4px 14px;padding:10px 13px;font-size:13px;line-height:1.5;');
      b.textContent = text;
      return b;
    }

    var chipWrap = el('div', 'flex:0 0 auto;max-height:150px;overflow-y:auto;padding:10px 12px 6px;background:#fff;border-top:1px solid #e5e7eb;');
    QA.forEach(function (qa) {
      var chip = el('button',
        'display:block;width:100%;text-align:left;margin:0 0 6px;padding:8px 12px;border:1px solid #dbe3f8;' +
        'border-radius:100px;background:#f4f7ff;color:#1848B8;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;');
      chip.type = 'button';
      chip.textContent = qa[0];
      chip.onclick = function () {
        lastQ = qa[0].replace(/^[^ ]+ /, '');
        feed.appendChild(visitorBubble(lastQ));
        feed.appendChild(agentBubble(qa[1]));
        feed.scrollTop = feed.scrollHeight;
      };
      chipWrap.appendChild(chip);
    });
    panel.appendChild(chipWrap);

    var human = el('button',
      'flex:0 0 auto;margin:8px 12px 12px;padding:11px;border:0;border-radius:100px;background:#1848B8;color:#fff;' +
      'font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;');
    human.type = 'button';
    human.textContent = 'Chat with a real person 💬';
    human.onclick = function () { toggle(false); openTawk(); };
    panel.appendChild(human);

    /* The name/email form, shown in place of the questions. */
    var form = el('form', 'display:none;flex:0 0 auto;flex-direction:column;gap:8px;padding:12px;background:#fff;border-top:1px solid #e5e7eb;');
    form.setAttribute('novalidate', '');
    var intro = el('div', 'font-size:12.5px;color:#374151;line-height:1.45;');
    intro.textContent = 'Before we connect you, what’s your name and email? If you step away, we’ll reply by email.';
    function field(type, label, auto) {
      var i = el('input', 'width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:14px;font-family:inherit;');
      i.type = type; i.required = true; i.setAttribute('aria-label', label); i.placeholder = label; i.autocomplete = auto;
      i.maxLength = type === 'email' ? 120 : 60;
      return i;
    }
    var nameIn = field('text', 'Your name', 'name');
    var emailIn = field('email', 'Your email', 'email');
    var err = el('div', 'display:none;font-size:12px;color:#b91c1c;');
    err.setAttribute('role', 'alert');
    var go = el('button', 'padding:11px;border:0;border-radius:100px;background:#1848B8;color:#fff;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;');
    go.type = 'submit';
    go.textContent = 'Start chat 💬';
    var back = el('button', 'border:0;background:none;color:#1848B8;font-size:12px;cursor:pointer;font-family:inherit;');
    back.type = 'button';
    back.textContent = '← Back to quick answers';
    [intro, nameIn, emailIn, err, go, back].forEach(function (n) { form.appendChild(n); });
    panel.appendChild(form);

    function showForm(on) {
      form.style.display = on ? 'flex' : 'none';
      chipWrap.style.display = on ? 'none' : 'block';
      human.style.display = on ? 'none' : 'block';
      err.style.display = 'none';
    }
    back.onclick = function () { showForm(false); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var problem = checkDetails(nameIn.value, emailIn.value);
      if (problem) { err.textContent = problem; err.style.display = 'block'; return; }
      go.disabled = true;
      var finish = function () {
        rememberDetails();
        go.disabled = false;
        showForm(false);
        toggle(false);
        openTawk();
      };
      try {
        if (window.Tawk_API && Tawk_API.setAttributes) {
          Tawk_API.setAttributes({ name: nameIn.value.trim(), email: emailIn.value.trim() }, function (error) {
            if (error) console.warn('chat details not set:', error);
            finish();
          });
          return;
        }
      } catch (x) {}
      finish();
    };
    gate = function () { toggle(true); showForm(true); setTimeout(function () { try { nameIn.focus(); } catch (x) {} }, 50); };

    function toggle(show) {
      open = show;
      panel.style.display = show ? 'flex' : 'none';
      launcher.style.display = show ? 'none' : 'block';
    }
    launcher.onclick = function () { toggle(true); };
    closeB.onclick = function () { toggle(false); showForm(false); };

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
  });
})();
