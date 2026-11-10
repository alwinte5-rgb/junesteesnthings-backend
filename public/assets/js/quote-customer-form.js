/* Keep instructions and unsent size edits through a reload or a failed save. */
(function () {
  'use strict';
  var script = document.currentScript;
  var key = 'jt:customer-quote:' + script.dataset.quote + ':' + script.dataset.revision;
  var selectors = '.cq, #changeform textarea, #noteform textarea, #accept [name="customer_note"]';
  var restoring = true;
  function fields() { return Array.from(document.querySelectorAll(selectors)); }
  function identity(el) { return (el.form ? el.form.id : '') + ':' + el.name; }
  function save() {
    if (restoring) return;
    try { sessionStorage.setItem(key, JSON.stringify(fields().map(function (el) { return { id: identity(el), value: el.value }; }))); } catch (e) {}
  }
  try {
    var data = JSON.parse(sessionStorage.getItem(key) || '[]');
    fields().forEach(function (el) {
      var old = data.find(function (v) { return v.id === identity(el); });
      if (old) el.value = old.value;
    });
  } catch (e) {}
  restoring = false;
  if (typeof estimate === 'function') estimate();
  fields().forEach(function (el) { el.addEventListener('input', save); el.addEventListener('change', save); });
  window.addEventListener('pagehide', save);
  function pending(e) {
    if (!window.jtQuoteEditsPending) return;
    e.preventDefault();
    var warning = document.getElementById('unsent-changes');
    if (warning) warning.scrollIntoView({ block: 'center' });
  }
  var accept = document.getElementById('accept');
  if (accept) accept.addEventListener('submit', pending);
  document.querySelectorAll('a[href*="/pay/"]').forEach(function (a) { a.addEventListener('click', pending); });
  ['changeform', 'noteform'].forEach(function (id) {
    var form = document.getElementById(id);
    if (!form) return;
    var status = document.createElement('p'); status.setAttribute('role', 'status'); form.appendChild(status);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.dataset.sending === '1') return;
      var body = new URLSearchParams(new FormData(form));
      var button = form.querySelector('button');
      form.dataset.sending = '1'; button.disabled = true; status.textContent = 'Saving…';
      save();
      fetch(form.action, { method: 'POST', credentials: 'same-origin', body: body })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status === 409 ? 'updated' : 'save');
          var next = new URL(r.url);
          var confirmed = id === 'noteform' ? next.searchParams.get('note') === 'saved' : next.searchParams.get('ev') === 'changes';
          if (!confirmed) throw new Error('save');
          /* Preserve other unsent work, but never restore the form just saved. */
          fields().forEach(function (el) { if (el.form === form) el.value = ''; });
          if (id === 'changeform') {
            try {
              var keep = fields().filter(function (el) { return el.form !== form; }).map(function (el) { return { id: identity(el), value: el.value }; });
              sessionStorage.setItem(key, JSON.stringify(keep));
            } catch (e) {}
            restoring = true; // pagehide must not put cleared quantities back
          } else save();
          window.location.assign(r.url);
        })
        .catch(function (err) {
          status.textContent = err.message === 'updated'
            ? 'This quote has been updated. Refresh it and check the latest items before sending changes. Your entries are still here.'
            : 'Could not save. Your entries are still here. Please try again, or contact June.';
          status.style.color = '#b91c1c'; form.dataset.sending = ''; button.disabled = false;
        });
    });
  });
})();
