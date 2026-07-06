/* June's Tees — Quick Answers: a static chat-style FAQ tool.
   A persistent "Quick answers" pill sits above the Tawk bubble on every page.
   Tapping a question shows the answer INSTANTLY (canned, same answers as the
   Tawk agent shortcuts), chat-bubble style. "Chat with a real person" opens
   the live Tawk chat and tags the last question for the agent. */
(function () {
  'use strict';
  if (window.__jtQAInit) return;
  window.__jtQAInit = true;

  var QA = [
    ['💲 How much does a custom shirt cost?', "Printing is priced per piece and drops fast with quantity — for example a full-color print runs about $20 at 1 piece down to $5.50 at 200+ (plus the garment). Design it at design.jtees.net to see your exact price live, or tell us what you need in chat and we'll quote it."],
    ['⏱️ How fast can I get my order?', 'Most orders turn around in about 7 days, and many are faster. Have a deadline? Chat with us and tell us the date — we\'ll confirm we can hit it.'],
    ['👕 Do you have minimums?', 'No minimums! Order a single shirt or hundreds — DTF printing lets us do one-offs at a great price. Bulk orders get volume discounts with big breaks at 12, 24, 48, and 100+.'],
    ['🎨 Can you help me with my design?', 'Yes — free design help is included! You can also build it yourself in our online Design Studio (design.jtees.net) with uploads, fonts, graphics, and an AI designer.'],
    ['🧵 Do you do embroidery?', 'We do! Embroidery is priced by size: small left-chest from $12/ea up to full-back from $65/ea, and prices drop with quantity. No stitch file? One-time digitizing is $25–$65 and reorders never pay it again.'],
    ['📦 Do you ship?', "Yes, we ship nationwide. Local Chicago customers can also do curbside pickup at 3047 N Lincoln Ave #435, Mon–Fri 10:30 AM–6 PM."],
    ['🏢 Business & team orders?', 'We outfit businesses and teams with embroidered polos, branded tees, hats, and jackets. Send your logo once — we keep it on file for every reorder. Volume pricing applies.'],
    ['🖼️ What files work best?', "Best: vector files (AI, EPS, SVG) or high-res PNG (300 DPI at print size). For embroidery: DST, PES, EXP, JEF, VP3, XXX, or EMB — or send regular art and we'll digitize it."]
  ];

  var lastQ = '';

  function openTawk() {
    try {
      if (window.Tawk_API && Tawk_API.maximize) {
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

    var panel = el('div',
      'position:fixed;bottom:96px;right:18px;z-index:2147482999;display:none;flex-direction:column;' +
      'width:min(340px,calc(100vw - 36px));height:min(480px,calc(100vh - 140px));' +
      'background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;' +
      'box-shadow:0 16px 44px rgba(15,23,42,.28);' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;');

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

    function toggle(show) {
      open = show;
      panel.style.display = show ? 'flex' : 'none';
      launcher.style.display = show ? 'none' : 'block';
    }
    launcher.onclick = function () { toggle(true); };
    closeB.onclick = function () { toggle(false); };

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
  });
})();
