/* Recover unfinished staff quotes on this browser. No HTML or credentials are stored. */
(function () {
  'use strict';
  window.JTQuoteRecovery = function (options) {
    var form = document.getElementById('qf');
    if (!form) return;
    var key = 'jt:quote-work:' + options.scope;
    var token = document.createElement('input');
    token.type = 'hidden'; token.name = 'recovery_token'; token.value = crypto.randomUUID();
    form.appendChild(token);
    var status = document.createElement('div');
    status.className = 'card'; status.setAttribute('role', 'status');
    form.insertBefore(status, form.firstChild);
    var text = document.createElement('span'); status.appendChild(text);
    var reset = document.createElement('button');
    reset.type = 'button'; reset.className = 'btn-ghost'; reset.textContent = 'Start fresh';
    reset.style.marginLeft = '12px'; status.appendChild(reset);
    var busy = false, dirty = false, saved = null;
    function fields(root) {
      return Array.from(root.querySelectorAll('input,select,textarea')).filter(function (e) {
        return e.type !== 'file' && e.type !== 'password' && e.name !== 'recovery_token';
      });
    }
    function id(e) { return e.name || (e.dataset.size ? 'size:' + e.dataset.size : 'class:' + e.className); }
    function capture(root) {
      return fields(root).map(function (e) {
        return { id: id(e), value: e.value, checked: e.checked,
          auto: e.dataset.auto, cleared: e.dataset.cleared };
      });
    }
    function fill(root, values) {
      var buckets = new Map();
      values.forEach(function (v) { if (!buckets.has(v.id)) buckets.set(v.id, []); buckets.get(v.id).push(v); });
      fields(root).forEach(function (e) {
        var list = buckets.get(id(e)), v = list && list.shift();
        if (!v) return;
        e.value = v.value;
        if (e.type === 'checkbox' || e.type === 'radio') e.checked = !!v.checked;
        ['auto', 'cleared'].forEach(function (k) { if (v[k] === undefined) delete e.dataset[k]; else e.dataset[k] = v[k]; });
      });
    }
    function save() {
      if (busy || !dirty) return;
      try {
        var lines = Array.from(document.querySelectorAll('#lines .line'));
        var data = { version: 1, token: token.value, at: Date.now(),
          fields: capture(form).filter(function (v) { return !lines.some(function (l) { return fields(l).some(function (e) { return id(e) === v.id; }); }); }),
          lines: lines.map(capture) };
        localStorage.setItem(key, JSON.stringify(data));
        text.textContent = 'Unfinished quote saved on this browser. Reopen this form to continue. Uploaded files are kept; files still uploading need to finish.';
      } catch (e) { text.textContent = 'Automatic recovery is unavailable. Use Save as draft before leaving.'; }
    }
    try {
      saved = JSON.parse(localStorage.getItem(key) || 'null');
      var ack = document.cookie.split('; ').find(function (v) { return v.indexOf('jt_quote_saved=') === 0; });
      if (saved && ack && decodeURIComponent(ack.split('=').slice(1).join('=')) === saved.token) {
        localStorage.removeItem(key); saved = null;
      }
    } catch (e) { saved = null; }
    if (saved && saved.version === 1 && Array.isArray(saved.lines) && saved.lines.length && saved.lines.length <= 100) {
      busy = true;
      try {
        token.value = saved.token;
        var container = document.getElementById('lines');
        while (container.children.length > 1) container.lastElementChild.remove();
        options.reindex();
        while (container.children.length < saved.lines.length) options.addLine();
        /* Product/decoration choices build sizes and extras. Restore those choices
           first, then fill the generated controls, including unnamed size boxes. */
        for (var pass = 0; pass < 3; pass++) {
          fill(form, saved.fields);
          Array.from(container.children).forEach(function (line, i) { fill(line, saved.lines[i]); });
          options.recalculate();
        }
        options.bind();
        dirty = true;
        text.textContent = 'Resumed your unfinished quote, including its items and notes. Changes save automatically on this browser.';
      } catch (e) { text.textContent = 'Could not restore this quote completely. Your saved work has been kept.'; }
      busy = false;
    } else text.textContent = 'Your unfinished work will save automatically on this browser.';
    form.addEventListener('input', function () { dirty = true; save(); });
    form.addEventListener('change', function () { dirty = true; save(); });
    form.addEventListener('click', function () { setTimeout(function () { if (dirty) save(); }, 0); });
    form.addEventListener('submit', save);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save(); });
    /* Uploaded files and added/removed rows can change without an input event. */
    var observer = new MutationObserver(function () { if (!busy) { dirty = true; save(); } });
    observer.observe(document.getElementById('lines'), { childList: true, subtree: true });
    reset.addEventListener('click', function () {
      if (!window.confirm('Discard the unfinished changes on this browser and start fresh?')) return;
      busy = true; dirty = false; localStorage.removeItem(key); window.location.reload();
    });
  };
})();
