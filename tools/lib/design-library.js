'use strict';

const CHANGES = require('./design-changes');
const KINDS = new Set(['template', 'readymade', 'clipart']);
/* Tiles, not full forms: more designs to a page (owner, 2026-11-23). */
const PAGE_SIZE = 60;
const STYLE = `<style>
.lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(168px,1fr));gap:12px;margin:12px 0}
.lib-grid .library-card{position:relative;margin:0;padding:10px;min-width:0;display:flex;flex-direction:column}
.lib-grid .library-card:has(.lib-edit[open]){grid-column:1/-1}
.lib-pic{height:140px;display:flex;align-items:center;justify-content:center;background:#e8edf2;border-radius:10px;overflow:hidden}
.lib-pic img{max-width:100%;max-height:100%;object-fit:contain}
.library-card h2{font-size:14px;line-height:1.25;margin:8px 0 2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.lib-meta{font-size:12px;margin:0 0 6px;color:#526071}.library-card .warn{font-size:12px;padding:6px 8px;margin:0 0 6px;max-height:6.5em;overflow:auto}
.lib-sel{position:absolute;top:14px;left:14px;margin:0;padding:4px;z-index:2}.lib-sel input{width:20px;height:20px;margin:0}
.lib-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto}.lib-acts .btn,.lib-acts button{padding:6px 10px;font-size:12px;min-height:34px;margin:0}
.lib-acts .lib-delete{color:#b91c1c}.lib-result{font-size:12px;font-weight:600;margin:6px 0 0}.lib-result:empty{display:none}
.lib-edit{margin-top:6px}.lib-edit summary{font-size:12px;cursor:pointer;padding:4px 0}.lib-edit details summary{font-size:14px}
.lib-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;align-items:end}.lib-filters label{margin:0}
@media(max-width:600px){.lib-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.lib-pic{height:110px}}
</style>`;
const ITEM_RE = /^(?:template|readymade|clipart)-\d{1,9}$/;
const TOKEN_RE = /^(?:template|readymade|clipart)-\d{1,9}-[a-f0-9]{16}$/;
const DID = { save: 'Saved.', sell: 'Individual product pricing is on.', publish: 'Published. Customers can see it.',
  hide: 'Hidden from customers.', archive: 'Archived. It is off the shop and kept here.', changes: 'Sent back for changes.' };
function cleanDesignCard(r) {
  if (!r || !KINDS.has(r.kind) || !Number.isSafeInteger(r.id) || r.id < 1) return null;
  let link, image;
  try { link = new URL(r.link); image = new URL(r.image); } catch { return null; }
  if (link.origin !== 'https://design.jtees.net' || link.pathname !== '/editor.php'
      || !/^\d+$/.test(link.searchParams.get('product_base') || '') || image.protocol !== 'https:') return null;
  const expected = r.kind === 'readymade' ? link.searchParams.get('readymade') === String(r.id)
    : link.searchParams.get('library') === r.kind + '-' + r.id;
  if (!expected || [...link.searchParams.keys()].some(k => !['product_base','readymade','library'].includes(k))) return null;
  const mockups = (Array.isArray(r.mockups) ? r.mockups : []).slice(0, 8).filter(v => {
    try { return new URL(v).protocol === 'https:'; } catch { return false; }
  });
  return { id: r.id, kind: r.kind, name: String(r.name || '').slice(0, 120), image: image.href,
    link: link.href, mockups, collection: String(r.collection || '').slice(0, 60), featured: r.featured === true,
    from_price: typeof r.from_price === 'number' && Number.isFinite(r.from_price) && r.from_price > 0 ? r.from_price : null };
}

function libraryPage(items, query={}) {
  const v=(key,max=100)=>typeof query[key]==='string'?query[key].slice(0,max).trim():'';
  const q=v('q').toLowerCase(),status=v('status'),kind=v('kind'),collection=v('collection',60),item=v('item'),review=v('review')==='1'?'1':'';
  const filtered=items.filter(r=>(!q||(r.name+' '+(r.collection||'')+' '+(r.tags||'')).toLowerCase().includes(q))&&(!status||r.status===status)&&(!kind||r.kind===kind)&&(!collection||r.collection===collection)&&(!item||r.kind+'-'+r.id===item)&&(!review||r.needs_review));
  filtered.sort((a,b)=>a.name.localeCompare(b.name,'en',{numeric:true})||a.id-b.id);
  const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE)),page=Math.min(pages,Math.max(1,Number.parseInt(v('page'),10)||1));
  return {items:filtered.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE),total:filtered.length,one:!!item,page,pages,q,status,kind,collection,review};
}

/* Runs in the browser (its source is put into the page). The buttons act where
   they are: they used to load a page holding only that one design, with the
   answer off the top of the screen (owner, 2026-11-23: "nothing happens. It
   just opens a new page"). Without this script the form still posts. */
function libraryPageScript() {
  function say(el, text, bad) { if (!el) return; el.textContent = text; el.style.color = bad ? '#b91c1c' : '#166534'; }
  function post(url, body) {
    return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: body.toString() })
      .then(function (r) { return r.json().catch(function () { throw new Error('The answer could not be read. Reload to check before trying again.'); })
        .then(function (b) { if (!r.ok || !b.ok) throw new Error(b.error || 'That did not save. Try again.'); return b; }); }, function () { throw new Error('No connection. Nothing is confirmed; try again.'); });
  }
  var cards = Array.prototype.slice.call(document.querySelectorAll('.library-card'));
  cards.forEach(function (card) {
    var form = card.querySelector('form'), out = card.querySelector('.lib-result');
    if (!form) return;
    var fold = card.querySelector('.lib-edit'), sel = form.querySelector('.lib-product'), list = document.getElementById('lib-products');
    function fill() {
      if (!fold.open || !sel || !list || sel.dataset.full) return;
      sel.dataset.full = '1'; var was = sel.value;
      Array.prototype.forEach.call(list.content.children, function (o) { if (o.value !== was) sel.appendChild(o.cloneNode(true)); });
    }
    if (fold) { fold.addEventListener('toggle', fill); fill(); }
    form.addEventListener('submit', function (e) {
      var btn = e.submitter; if (!btn || btn.name !== 'action') return;
      e.preventDefault();
      var note = form.querySelector('[name="note"]');
      if (btn.value === 'changes' && note && !note.value.trim()) { say(out, 'Write what to change in Review note first.', true); note.focus(); return; }
      var body = new URLSearchParams();
      new FormData(form).forEach(function (v, k) { if (typeof v === 'string' && k !== 'action') body.append(k, v); });
      body.append('action', btn.value);
      var buttons = Array.prototype.filter.call(form.elements, function (x) { return x.tagName === 'BUTTON'; });
      buttons.forEach(function (b) { b.disabled = true; });
      out.style.color = ''; out.textContent = 'Working…';
      post('/admin/design-library', body).then(function (b) {
        say(out, b.message, b.warn);
        var st = card.querySelector('.lib-status'); if (st && b.status) { st.textContent = b.status;
          var q = card.querySelector('.lib-quick'); if (q) { q.value = b.status === 'live' ? 'hide' : 'publish'; q.textContent = b.status === 'live' ? 'Hide' : 'Publish'; } }
        var rv = card.querySelector('.lib-review'); if (rv && b.reviewed) rv.remove();
        if (b.reload) setTimeout(function () { location.reload(); }, 1200);
      }).catch(function (err) { say(out, err.message, true); })
        .then(function () { buttons.forEach(function (b) { b.disabled = false; }); });
    });
  });
  var bulk = document.getElementById('lib-del-all'), all = document.getElementById('lib-all'), msg = document.getElementById('lib-bulk-msg');
  function picked() { return Array.prototype.slice.call(document.querySelectorAll('.lib-pick:checked')).map(function (c) { return c.value; }); }
  function count() { var n = picked().length; clearTimeout(bulk.timer); bulk.disabled = !n; bulk.textContent = n ? 'Delete selected (' + n + ')' : 'Delete selected'; bulk.dataset.sure = ''; }
  function remove(keys, out, done) {
    out.style.color = ''; out.textContent = 'Deleting…';
    var body = new URLSearchParams(); body.append('items', JSON.stringify(keys));
    post('/admin/design-library/delete', body).then(function (b) {
      b.done.forEach(function (k) { var c = document.getElementById(k); if (c) c.remove(); });
      say(msg, 'Deleted ' + b.done.length + '. You can put ' + (b.done.length === 1 ? 'it' : 'them') + ' back under Deleted.' + (b.failed.length ? ' ' + b.failed.length + ' could not be deleted: ' + b.failed[0].error : ''), b.failed.length > 0);
    }).catch(function (err) { say(out, err.message, true); }).then(function () { done(); count(); });
  }
  /* Two presses, no pop-up: the first asks, the second deletes. */
  function sure(b, label, go) {
    if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.dataset.was = b.textContent; b.textContent = label; b.timer = setTimeout(function () { b.dataset.sure = ''; b.textContent = b.dataset.was; }, 5000); return; }
    clearTimeout(b.timer); b.dataset.sure = ''; b.textContent = b.dataset.was; b.disabled = true; go();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.lib-delete'); if (!b) return;
    sure(b, 'Press again to delete', function () { remove([b.dataset.key], b.closest('.library-card').querySelector('.lib-result'), function () { b.disabled = false; }); });
  });
  if (bulk) {
    document.addEventListener('change', function (e) { if (e.target.classList && e.target.classList.contains('lib-pick')) count(); });
    all.addEventListener('change', function () { document.querySelectorAll('.lib-pick').forEach(function (c) { c.checked = all.checked; }); count(); });
    bulk.addEventListener('click', function () { var keys = picked(); if (!keys.length) return;
      sure(bulk, 'Press again to delete ' + keys.length, function () { remove(keys, msg, function () { all.checked = false; }); }); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.lib-restore'); if (!b) return;
    b.disabled = true;
    var row = b.closest('.library-deleted'), out = row.querySelector('.lib-result');
    var body = new URLSearchParams(); body.append('items', JSON.stringify([b.dataset.token]));
    post('/admin/design-library/restore', body).then(function () { row.querySelector('.lib-note').textContent = 'Back in the library, hidden. Publish it when you are ready.'; b.remove(); })
      .catch(function (err) { b.disabled = false; say(out, err.message, true); });
  });
}

function registerDesignLibrary(app, d) {
  const { requireAdmin, isOwner, adminPage, pageHeader, esc, studioFetch, getCatalog, requireInternalKey,
    notifyAdd, sendEmail, NOTIFY_EMAIL, pool, invalidate, rawBody, designChanges } = d;
  const endpoint = 'https://design.jtees.net/jt-library-admin.php';
  require('./artwork-handoff').queueArtworkHandoff(pool);
  let cache = null, at = 0;
  async function read(publicOnly = false) {
    const r = await studioFetch(endpoint + (publicOnly ? '?view=public' : ''), { timeoutMs: 25000 });
    if (!r.ok) throw new Error('Design library answered HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok || !Array.isArray(data.items)) throw new Error('Invalid design library response');
    return data.items;
  }
  async function publicRead(){if(!cache||Date.now()-at>60000){cache=(await read(true)).map(cleanDesignCard).filter(Boolean);at=Date.now();}return cache;}
  require('./public-design-gallery').registerPublicGallery(app,{read:publicRead});
  app.get('/api/design-library', async (_req, res) => {
    try {
      cache=await publicRead();
      res.set('Cache-Control', 'public, max-age=30').json({ ok: true, items: cache });
    } catch (e) { console.error('design-library feed:', e.message); res.status(503).json({ error: 'Designs could not be loaded. Please try again.' }); }
  });
  app.get('/admin/design-library', requireAdmin, async (req, res) => {
    if (!isOwner()) return res.status(403).send('Only the owner can manage the design library.');
    res.set('Cache-Control', 'no-store');
    try {
      if (req.query.view === 'deleted') return res.send(await deletedPage());
      const [items, cat] = await Promise.all([read(), getCatalog()]);
      const products = cat.products || [];
      const pending = items.filter(r => r.status === 'submitted').length;
      const view=libraryPage(items,req.query);
      const pageLink=n=>'/admin/design-library?'+new URLSearchParams({q:view.q,status:view.status,kind:view.kind,collection:view.collection,review:view.review,page:String(n)});
      const paging=`<nav aria-label="Library pages"><p>${view.total} matches · Page ${view.page} of ${view.pages} ${view.page>1?`<a class="btn" href="${esc(pageLink(view.page-1))}">Previous</a>`:''} ${view.page<view.pages?`<a class="btn" href="${esc(pageLink(view.page+1))}">Next</a>`:''}</p></nav>`;
      const card = r => {
        const m = r.settings || {}, key = r.kind + '-' + r.id;
        /* Only the chosen product; the whole list is one template, filled in
           when Edit opens, so 60 tiles do not carry 60 copies of it. */
        const mine = products.find(p => Number(p.id) === Number(r.product));
        const opts = mine ? `<option value="${Number(mine.id)}" selected>${esc(mine.name)}</option>` : '<option value="" selected>Choose a product</option>';
        const prices = Object.entries(r.offer || {}).map(([pid,p]) => `<label>${esc(p.name)} — default ${(p.default_price ?? p.price) == null ? 'regular pricing' : '$'+Number(p.default_price ?? p.price).toFixed(2)}<input type="number" name="price_${Number(pid)}" min="1" max="9999.99" step="0.01" placeholder="Use default" value="${m.prices && m.prices[pid] != null ? (m.prices[pid]/100).toFixed(2) : ''}"></label>`).join('');
        const fid = 'lf-' + key, quick = r.status === 'live' ? ['hide', 'Hide'] : r.image && mine && !r.needs_source ? ['publish', 'Publish'] : null;
        return `<section class="card library-card" data-status="${esc(r.status)}" data-kind="${esc(r.kind)}" data-key="${key}" id="${key}">
          <label class="lib-sel"><input type="checkbox" class="lib-pick" value="${key}" aria-label="Select ${esc(r.name)}"></label>
          <div class="lib-pic">${r.image ? `<img loading="lazy" src="${esc(r.image)}" alt="${esc(r.name)}">` : '<span class="warn">Artwork preview needed</span>'}</div>
          <h2 title="${esc(r.name)}">${esc(r.name)}</h2><p class="lib-meta">${esc(r.kind)} · <strong class="lib-status">${esc(r.status)}</strong></p>
          ${r.needs_source?'<p class="warn">The original source file is missing. Restore or replace it before publishing.</p>':r.designer_edit_required?`<p class="warn lib-review">Waiting on the designer${r.designer_note?': '+esc(r.designer_note):'.'}</p>`:r.needs_review?'<p class="warn lib-review">Check the name and collection, then save.</p>':''}
          <div class="lib-acts">${quick ? `<button form="${fid}" name="action" value="${quick[0]}" class="lib-quick">${quick[1]}</button>` : ''}${r.link ? `<a class="btn btn-ghost" href="${esc(r.link)}" target="_blank" rel="noopener">Open</a>` : ''}<button type="button" class="btn-ghost lib-delete" data-key="${key}">Delete</button></div>
          <p class="lib-result" role="status"></p>
          <details class="lib-edit"${view.one ? ' open' : ''}><summary>Edit, prices and review</summary>
          ${m.submitted_by ? `<p>Submitted by ${esc(m.submitted_by)}</p>` : ''}${m.note ? `<p>${esc(m.note)}</p>` : ''}
          ${r.link ? '<p><a href="' + esc(r.link) + '" target="_blank" rel="noopener">Open in designer / prepare artwork preview</a></p>' : '<p>Choose a compatible default product below.</p>'}
          <div>${(r.mockups || []).slice(0,3).map(src => `<img loading="lazy" src="${esc(src)}" alt="Saved mockup" style="width:64px;height:64px;object-fit:contain">`).join('')}</div>
          <p>${m.master ? `<a href="/admin/design-library/master?kind=${r.kind}&id=${r.id}">Download Affinity master: ${esc(m.master.name)}</a>` : 'No Affinity master attached.'}</p>
          <label>Attach Affinity master (up to 40 MB)<input type="file" class="library-master" data-kind="${r.kind}" data-id="${r.id}" accept=".afdesign,.afphoto,.afpub,.af"></label><p class="library-upload-status" role="status"></p>
          <form method="post" action="/admin/design-library" id="${fid}" novalidate><input type="hidden" name="kind" value="${r.kind}"><input type="hidden" name="id" value="${r.id}">
          <label>Design title<input name="name" maxlength="120" value="${esc(r.name)}" required></label><label>Default product<select name="product" class="lib-product">${opts}</select></label>
          <label>Collection<input name="collection" maxlength="60" value="${esc(m.collection || '')}" placeholder="Christmas, birthdays, family reunions…"></label>
          <label><input type="checkbox" name="featured" value="1"${m.featured ? ' checked' : ''}> Feature on the homepage</label>
          <details><summary>Customer personalization</summary><p>Only bracketed words and photo placeholders can change. Fixed artwork stays locked.</p>${[['text','Bracketed text'],['photos','Photo placeholders'],['recolor','Clipart color changes']].map(([key,label])=>`<label><input type="checkbox" name="edit_${key}" value="1"${!m.personalize||m.personalize[key]!==false?' checked':''}> ${label}</label>`).join('')}</details>
          ${(r.mockup_sources||[]).length?`<details><summary>Mockup order</summary><p>Enter the positions in the order they should appear, separated by commas. Blank shows artwork only. Original files are retained.</p>${r.mockup_sources.map((url,i)=>`<span style="display:inline-block;margin:8px"><img loading="lazy" src="${esc(url)}" style="width:64px;height:64px;object-fit:contain" alt="Mockup ${i}"><br>Position ${i}</span>`).join('')}<label>Positions to show<input name="mockup_order" value="${esc((m.mockup_order||r.mockup_sources.map((_,i)=>i)).join(','))}"></label></details>`:''}
          <a href="/admin/studio-controls?tab=uploads&amp;kind=${r.kind}&amp;id=${r.id}">Add a mockup</a>
          ${prices ? `<details><summary>Individual product prices</summary><p>Blank keeps the default. Overrides include front printing; size/attribute extras and other print locations are added. Overrides do not receive automatic quantity discounts.</p>${prices}</details>` : ''}
          <label>Review note<textarea name="note" maxlength="2000">${esc(m.note || '')}</textarea></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button name="action" value="save">Save settings and prices</button>${r.kind === 'template' ? '<button name="action" value="sell">Enable individual product pricing</button>' : ''}<button name="action" value="publish">Approve and publish</button><button name="action" value="changes">Request changes</button><button name="action" value="hide">Hide</button><button name="action" value="archive">Archive</button></div></form>
          ${m.notify && !m.notify.sent && m.status === 'submitted' ? `<p class="warn">Approval email pending (${Number(m.notify.attempts) || 0} attempts). The submission is saved here.</p>` : ''}</details></section>`;
      };
      res.send(adminPage('Design library', `${pageHeader('Design library', 'Artwork, mockups, approvals and individual product prices in one place.')}${STYLE}
        <template id="lib-products">${products.map(p => `<option value="${Number(p.id)}">${esc(p.name)}</option>`).join('')}</template>
        ${req.query.saved === '1' ? '<div class="ok">Saved and verified.</div>' : ''}
        <div class="card"><strong>${pending} awaiting approval</strong> · ${items.length} designs and cliparts
        <p>Existing screenshots are kept as mockups. Open a design and use “Prepare artwork preview” before publishing.</p>
        <nav class="sc-tabs" aria-label="Design library sections"><a href="/admin/artwork">Artwork workspace & batch previews</a><a href="/admin/design-library?kind=template">Templates</a><a href="/admin/design-library?kind=readymade">Ready-made designs & prices</a><a href="/admin/design-library?kind=clipart">Clipart</a><a href="/admin/design-library?status=submitted">Awaiting approval</a><a href="/admin/design-library?kind=clipart&amp;review=1">Clipart name review</a><a href="/admin/artwork?missing=1">Missing source files</a><a href="/admin/design-library?view=deleted">Deleted</a></nav><p><a href="/admin/studio-controls">Designer controls</a> · <a href="/admin/design-requests">Design requests and proofs</a> · <a href="/admin/notifications/settings">Notifications</a></p>
        <form method="get" action="/admin/design-library" class="lib-filters">${view.review?'<input type="hidden" name="review" value="1">':''}
        <label>Search artwork<input name="q" type="search" value="${esc(view.q)}" maxlength="100"></label>
        <label>Artwork type<select name="kind"><option value="">All artwork</option>${['template','readymade','clipart'].map(k=>`<option value="${k}"${view.kind===k?' selected':''}>${k}</option>`).join('')}</select></label>
        <label>Status<select name="status"><option value="">All statuses</option>${['submitted','draft','changes','live','archived'].map(k=>`<option${view.status===k?' selected':''}>${k}</option>`).join('')}</select></label>
        <label>Collection<select name="collection"><option value="">All collections</option>${[...new Set(items.map(r=>r.collection).filter(Boolean))].sort().map(c=>`<option${view.collection===c?' selected':''}>${esc(c)}</option>`).join('')}</select></label>
        <span><button>Filter artwork</button> <a href="/admin/design-library">Clear filters</a></span></form>
        <a href="/shop-designs" target="_blank" rel="noopener">View customer gallery</a></div>
        <div class="card" id="lib-bulk" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;position:sticky;top:0;z-index:5">
          <label style="display:inline-flex;gap:8px;align-items:center;margin:0"><input type="checkbox" id="lib-all" style="width:auto"> Select all on this page</label>
          <button type="button" id="lib-del-all" disabled style="background:#b91c1c">Delete selected</button>
          <span id="lib-bulk-msg" role="status"></span></div>${paging}${view.items.length ? `<div class="lib-grid">${view.items.map(card).join('')}</div>` : '<div class="card">No artwork matches these filters.</div>'}${paging}
        <script>document.querySelectorAll('.library-master').forEach(function(input){input.addEventListener('change',function(){var f=input.files[0],msg=input.closest('.library-card').querySelector('.library-upload-status');if(!f)return;if(f.size>40*1024*1024){msg.textContent='The file must be under 40 MB.';return;}input.disabled=true;msg.textContent='Uploading master…';fetch('/admin/design-library/master?kind='+encodeURIComponent(input.dataset.kind)+'&id='+input.dataset.id+'&name='+encodeURIComponent(f.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f}).then(function(r){if(!r.ok)throw new Error('Could not upload the master.');return r.json();}).then(function(){location.reload();}).catch(function(e){input.disabled=false;msg.textContent=e.message;});});});</script><script>(${libraryPageScript.toString()})();</script>`, 'design-library'));
    } catch(e) { console.error('library admin:', e.message); res.status(503).send(adminPage('Design library', '<div class="card"><p>Could not load the design library. Your designs have not been changed.</p><a href="/admin/design-library">Try again</a></div>', 'design-library')); }
  });
  async function deletedPage() {
    const r = await studioFetch(endpoint + '?view=deleted', { timeoutMs: 25000 });
    const b = await r.json();
    if (!r.ok || !b.ok || !Array.isArray(b.items)) throw new Error('Deleted designs could not be read');
    const rows = b.items.filter(x => x && TOKEN_RE.test(x.token)).map(x => `<section class="card library-deleted" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
      ${/^https:\/\//.test(x.image || '') ? `<img loading="lazy" src="${esc(x.image)}" alt="" style="width:80px;height:80px;object-fit:contain;background:#e8edf2;border-radius:10px">` : ''}
      <div style="flex:1;min-width:180px"><strong>${esc(x.name || 'Untitled')}</strong><p class="lib-note">${esc(x.kind)} · deleted ${esc(String(x.at || '').slice(0, 10))}</p><p class="lib-result" role="status"></p></div>
      <button type="button" class="lib-restore" data-token="${esc(x.token)}">Restore</button></section>`).join('');
    return adminPage('Deleted designs', `${pageHeader('Deleted designs', 'Off the shop and out of the library. Restoring brings one back hidden.')}
      <p><a href="/admin/design-library">Back to Design library</a></p>${rows || '<div class="card">Nothing is deleted.</div>'}<script>(${libraryPageScript.toString()})();</script>`, 'design-library');
  }
  /* Delete or restore up to 100 at once: a whole page. The studio answers for each one. */
  const bulkRoute = (action) => async (req, res) => {
    if (!isOwner()) return res.status(403).json({ error: 'Only the owner can do this.' });
    res.set('Cache-Control', 'no-store');
    let items = null;
    try { items = JSON.parse(String((req.body || {}).items || '')); } catch { /* refused below */ }
    const ok = action === 'delete' ? ITEM_RE : TOKEN_RE;
    if (!Array.isArray(items) || !items.length || items.length > 100 || items.some(i => typeof i !== 'string' || !ok.test(i)) || Object.keys(req.body).some(k => k !== 'items'))
      return res.status(400).json({ error: 'Choose between 1 and 100 designs.' });
    try {
      const r = await studioFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ action, items: JSON.stringify(items) }).toString(), timeoutMs: 60000 });
      const b = await r.json();
      cache = null; at = 0; invalidate();
      if (!r.ok || !b.ok || !Array.isArray(b.done)) return res.status(400).json({ error: b.error || 'Nothing was changed. Try again.' });
      const done = b.done.map(x => x.kind + '-' + Number(x.id));
      if (action === 'delete') for (const key of done) await settled(key).catch(e => console.error('library delete clean-up:', e.message));
      res.json({ ok: true, done, failed: (Array.isArray(b.failed) ? b.failed : []).map(f => ({ item: String(f.item), error: String(f.error).slice(0, 200) })) });
    } catch (e) { console.error(`library ${action}:`, e.message); res.status(503).json({ error: 'Could not confirm this. Reload the library to check before trying again.' }); }
  };
  app.post('/admin/design-library/delete', requireAdmin, bulkRoute('delete'));
  app.post('/admin/design-library/restore', requireAdmin, bulkRoute('restore'));
  /** A design that is decided: its approval alert is read and an open change request is closed. */
  async function settled(key, closeTask = true) {
    await pool.query("UPDATE notifications SET read_at=NOW() WHERE recipient='owner' AND kind='library' AND read_at IS NULL AND (ref LIKE $1 OR ref=$2)", [key + ':%', 'poll:' + key]);
    const m = /^(\w+)-(\d+)$/.exec(key);
    if (closeTask) await CHANGES.closeTasks(pool, [CHANGES.refOf(m[1], m[2])]);
  }
  app.post('/admin/design-library', requireAdmin, async (req,res) => {
    /* The page's script asks for JSON and stays where it is; a plain form post
       still gets pages. */
    const json = String((req.headers || {}).accept || '').includes('application/json');
    const refuse = (code, text) => json ? res.status(code).json({ error: text })
      : res.status(code).send(adminPage('Design settings', `<div class="card"><p>${esc(text)}</p><a href="/admin/design-library">Back to library</a></div>`, 'design-library'));
    if (!isOwner()) return json ? refuse(403, 'Only the owner can change design settings.') : res.status(403).send('Only the owner can change design settings.');
    const b = req.body || {}, fields = ['kind','id','action','name','product','collection','featured','note','edit_text','edit_photos','edit_recolor','mockup_order'];
    if (!KINDS.has(b.kind) || !/^\d{1,9}$/.test(String(b.id)) || !['save','publish','hide','changes','archive','sell'].includes(b.action)
      || Object.keys(b).some(k=>!fields.includes(k)&&!/^price_\d{1,9}$/.test(k)) || String(b.name || '').length>120 || String(b.note || '').length>2000 || String(b.collection || '').length>60)
      return refuse(400, 'Invalid design settings.');
    if (b.action === 'changes' && !String(b.note || '').trim()) return refuse(400, 'Write what to change in Review note first.');
    const prices = {};
    for (const [k,v] of Object.entries(b)) if (k.startsWith('price_') && v !== '') {
      if (typeof v !== 'string' || !/^\d{1,4}(?:\.\d{1,2})?$/.test(v)) return refuse(400, 'Enter valid prices.'); prices[k.slice(6)] = v;
    }
    const payload = Object.fromEntries(fields.filter(k => b[k] != null).map(k=>[k,String(b[k])])); payload.prices=JSON.stringify(prices);
    payload.personalize=JSON.stringify({text:b.edit_text==='1',photos:b.edit_photos==='1',recolor:b.edit_recolor==='1'});
    if(b.mockup_order!=null){const parts=String(b.mockup_order).split(',').map(v=>v.trim()).filter(Boolean);if(parts.length>8||parts.some(v=>!/^\d{1,2}$/.test(v)))return refuse(400,'Choose valid mockup positions.');payload.mockup_order=JSON.stringify(parts.map(Number));}
    delete payload.edit_text;delete payload.edit_photos;delete payload.edit_recolor;
    let data;
    try {
      if (b.action === 'publish') {
        const save = await studioFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...payload,action:'save'}).toString()});
        const saved = await save.json(); if (!save.ok || !saved.ok) return refuse(400, saved.error || 'Could not save settings before publishing.');
      }
      const r = await studioFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(payload).toString()});
      data = await r.json(); if (!r.ok || !data.ok) return refuse(400, data.error || 'Could not save this design.');
    } catch(e) { console.error('library save:',e.message); return refuse(503, 'Could not confirm the save. Reload the design library to check before retrying.'); }
    cache=null; at=0; invalidate();
    /* The studio has saved it. What follows only tells people, so a failure
       here is said as that, never as "not saved". */
    let message = DID[b.action], warn = false;
    /* Hide and sell leave a change request open: only publishing, archiving,
       deleting or the designer submitting again answers it. */
    try { if (b.action !== 'save') await settled(b.kind+'-'+b.id, ['publish', 'archive'].includes(b.action)); }
    catch (e) { console.error('library alerts:', e.message); }
    if (b.action === 'changes') {
      try {
        const t = await CHANGES.requestChanges(designChanges, { kind: b.kind, id: b.id, name: (data.item && data.item.name) || b.name,
          note: String(b.note).trim(), submittedBy: data.item && data.item.settings && data.item.settings.submitted_by });
        const who = t.names.join(' and ') || 'the designer';
        warn = !t.told;
        message = !t.told ? 'Sent back for changes, but nobody on the team has Artwork access, so no one was told.'
          : `Sent to ${who}: it is a task on My Day${t.emailed ? ' and an email' : ''}.${t.emailed ? '' : ' No email went out.'}`;
      } catch (e) { console.error('library change request:', e.message); warn = true; message = 'Sent back for changes, but the designer could not be told. Press Request changes again.'; }
    }
    if (json) return res.json({ ok: true, message, warn, status: (data.item && data.item.status) || '', reviewed: !(data.item && data.item.needs_review), reload: b.action === 'sell' });
    res.redirect(303,'/admin/design-library?saved=1&item='+encodeURIComponent(data.item.kind+'-'+b.id));
  });
  const masterEndpoint = 'https://design.jtees.net/jt-library-master.php';
  const masterArgs = req => KINDS.has(req.query.kind) && /^\d{1,9}$/.test(String(req.query.id || ''));
  app.get('/admin/design-library/master',requireAdmin,async(req,res)=>{
    if(!isOwner())return res.status(403).send('Only the owner can download master files.');
    if(!masterArgs(req))return res.status(400).send('Invalid design.');
    try {const r=await studioFetch(masterEndpoint+'?'+new URLSearchParams({kind:req.query.kind,id:req.query.id}),{timeoutMs:30000});
      if(!r.ok)return res.status(r.status===404?404:503).send('Master file is unavailable.');
      res.set('Cache-Control','no-store').set('X-Content-Type-Options','nosniff').set('Content-Type','application/octet-stream');
      res.set('Content-Disposition',r.headers.get('content-disposition')||'attachment');
      require('node:stream').Readable.fromWeb(r.body).on('error',()=>res.destroy()).pipe(res);
    }catch(e){res.status(503).send('Could not download the master file.');}
  });
  app.post('/admin/design-library/master',requireAdmin,rawBody({type:'application/octet-stream',limit:'40mb'}),async(req,res)=>{
    if(!isOwner())return res.status(403).json({error:'Only the owner can attach master files.'});
    if(!masterArgs(req)||!Buffer.isBuffer(req.body)||!req.body.length||req.body.length>40*1024*1024
      ||!/^[A-Za-z0-9_. -]{1,100}\.(afdesign|afphoto|afpub|af)$/i.test(String(req.query.name||'')))return res.status(400).json({error:'Choose a valid Affinity file up to 40 MB.'});
    try {const r=await studioFetch(masterEndpoint+'?'+new URLSearchParams({kind:req.query.kind,id:req.query.id,name:req.query.name}),{method:'POST',headers:{'Content-Type':'application/octet-stream','Content-Length':String(req.body.length)},body:req.body,timeoutMs:60000});
      if(!r.ok)throw new Error('Master upload failed');res.set('Cache-Control','no-store').json(await r.json());
    }catch(e){res.status(503).json({error:'Could not upload the master. Please retry.'});}
  });
  app.post('/api/library-submission', requireInternalKey, async(req,res)=>{
    const b=req.body||{};
    if (!KINDS.has(b.kind) || !Number.isSafeInteger(b.id) || b.id<1 || !Number.isSafeInteger(b.revision) || b.revision<1
        || typeof b.name!=='string' || b.name.length>120 || String(b.submitted_by||'').length>254
        || Object.keys(b).some(k=>!['kind','id','revision','name','submitted_by'].includes(k))) return res.status(400).json({error:'Invalid submission'});
    const ref=b.kind+'-'+b.id+':'+b.revision, link='/admin/design-library?item='+b.kind+'-'+b.id;
    try {
      /* Submitted again: the change request on it is answered. */
      await CHANGES.closeTasks(pool, [CHANGES.refOf(b.kind, b.id)]).catch(e => console.error('library change task:', e.message));
      await notifyAdd([{recipient:'owner',kind:'library',ref,title:'Design awaiting approval: '+b.name,link}]);
      const {rows:[n]}=await pool.query("SELECT id,emailed_at FROM notifications WHERE recipient='owner' AND kind='library' AND ref=$1",[ref]);
      if (!n) throw new Error('Notification was not saved');
      const {rows:prefs}=await pool.query("SELECT email FROM notification_prefs WHERE reader='owner' AND kind='library'");
      if (!n.emailed_at && require('./notifications').emailOn('library', prefs.length ? { library: prefs[0].email } : {})) {
        const {rows:claimed}=await pool.query('UPDATE notifications SET emailed_at=NOW() WHERE id=$1 AND emailed_at IS NULL RETURNING id',[n.id]);
        if(claimed.length)try {
        await sendEmail({to:NOTIFY_EMAIL,promo:false,urgent:true,subject:'Design awaiting approval: '+b.name,
          html:`<p>${esc(b.name)} is ready for review${b.submitted_by?' from '+esc(b.submitted_by):''}.</p><p><a href="https://www.jtees.net${link}">Review in your June’s Tees dashboard</a></p>`});
        }catch(e){await pool.query('UPDATE notifications SET emailed_at=NULL WHERE id=$1',[n.id]);throw e;}
      }
      res.json({ok:true});
    } catch(e) { console.error('library notification:',e.message);res.status(503).json({error:'Notification could not be delivered; retry required'}); }
  });
}
module.exports = { cleanDesignCard, libraryPage, registerDesignLibrary };

