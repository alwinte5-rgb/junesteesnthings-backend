'use strict';

const KINDS = new Set(['template', 'readymade', 'clipart']);
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
  const pages=Math.max(1,Math.ceil(filtered.length/24)),page=Math.min(pages,Math.max(1,Number.parseInt(v('page'),10)||1));
  return {items:filtered.slice((page-1)*24,page*24),total:filtered.length,page,pages,q,status,kind,collection,review};
}

function registerDesignLibrary(app, d) {
  const { requireAdmin, isOwner, adminPage, pageHeader, esc, studioFetch, getCatalog, requireInternalKey,
    notifyAdd, sendEmail, NOTIFY_EMAIL, pool, invalidate, rawBody } = d;
  const endpoint = 'https://design.jtees.net/jt-library-admin.php';
  let cache = null, at = 0;
  async function read(publicOnly = false) {
    const r = await studioFetch(endpoint + (publicOnly ? '?view=public' : ''), { timeoutMs: 25000 });
    if (!r.ok) throw new Error('Design library answered HTTP ' + r.status);
    const data = await r.json();
    if (!data.ok || !Array.isArray(data.items)) throw new Error('Invalid design library response');
    return data.items;
  }
  app.get('/api/design-library', async (_req, res) => {
    try {
      if (!cache || Date.now() - at > 60000) { cache = (await read(true)).map(cleanDesignCard).filter(Boolean); at = Date.now(); }
      res.set('Cache-Control', 'public, max-age=30').json({ ok: true, items: cache });
    } catch (e) { console.error('design-library feed:', e.message); res.status(503).json({ error: 'Designs could not be loaded. Please try again.' }); }
  });
  app.get('/admin/design-library', requireAdmin, async (req, res) => {
    if (!isOwner()) return res.status(403).send('Only the owner can manage the design library.');
    res.set('Cache-Control', 'no-store');
    try {
      const [items, cat] = await Promise.all([read(), getCatalog()]);
      const products = cat.products || [];
      const pending = items.filter(r => r.status === 'submitted').length;
      const view=libraryPage(items,req.query);
      const pageLink=n=>'/admin/design-library?'+new URLSearchParams({q:view.q,status:view.status,kind:view.kind,collection:view.collection,review:view.review,page:String(n)});
      const paging=`<nav aria-label="Library pages"><p>${view.total} matches · Page ${view.page} of ${view.pages} ${view.page>1?`<a class="btn" href="${esc(pageLink(view.page-1))}">Previous</a>`:''} ${view.page<view.pages?`<a class="btn" href="${esc(pageLink(view.page+1))}">Next</a>`:''}</p></nav>`;
      const card = r => {
        const m = r.settings || {}, key = r.kind + '-' + r.id;
        const opts = products.map(p => `<option value="${Number(p.id)}"${Number(p.id) === Number(r.product) ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
        const prices = Object.entries(r.offer || {}).map(([pid,p]) => `<label>${esc(p.name)} — default ${(p.default_price ?? p.price) == null ? 'regular pricing' : '$'+Number(p.default_price ?? p.price).toFixed(2)}<input type="number" name="price_${Number(pid)}" min="1" max="9999.99" step="0.01" placeholder="Use default" value="${m.prices && m.prices[pid] != null ? (m.prices[pid]/100).toFixed(2) : ''}"></label>`).join('');
        return `<section class="card library-card" data-status="${esc(r.status)}" data-kind="${esc(r.kind)}" id="${key}">
          <div style="display:flex;gap:16px;flex-wrap:wrap"><div style="width:150px;max-width:100%">${r.image ? `<img loading="lazy" src="${esc(r.image)}" alt="${esc(r.name)}" style="width:150px;height:150px;object-fit:contain;background:#e8edf2;border-radius:10px">` : '<p class="warn">Artwork preview needed</p>'}</div>
          <div><h2>${esc(r.name)}</h2><p>${esc(r.kind)} · <strong>${esc(r.status)}</strong></p>
          ${m.submitted_by ? `<p>Submitted by ${esc(m.submitted_by)}</p>` : ''}${m.note ? `<p>${esc(m.note)}</p>` : ''}
          ${r.link ? `<a class="btn" href="${esc(r.link)}" target="_blank" rel="noopener">Open in designer / prepare artwork preview</a>` : '<p>Choose a compatible default product below.</p>'}
          ${(r.mockups || []).slice(0,3).map(src => `<img loading="lazy" src="${esc(src)}" alt="Saved mockup" style="width:64px;height:64px;object-fit:contain">`).join('')}</div></div>
          <p>${m.master ? `<a href="/admin/design-library/master?kind=${r.kind}&id=${r.id}">Download Affinity master: ${esc(m.master.name)}</a>` : 'No Affinity master attached.'}</p>
          <label>Attach Affinity master (up to 40 MB)<input type="file" class="library-master" data-kind="${r.kind}" data-id="${r.id}" accept=".afdesign,.afphoto,.afpub,.af"></label><p class="library-upload-status" role="status"></p>
          <form method="post" action="/admin/design-library"><input type="hidden" name="kind" value="${r.kind}"><input type="hidden" name="id" value="${r.id}">
          <label>Design title<input name="name" maxlength="120" value="${esc(r.name)}" required></label><label>Default product<select name="product">${opts}</select></label>
          <label>Collection<input name="collection" maxlength="60" value="${esc(m.collection || '')}" placeholder="Christmas, birthdays, family reunions…"></label>
          <label><input type="checkbox" name="featured" value="1"${m.featured ? ' checked' : ''}> Feature on the homepage</label>
          ${r.needs_review?'<p class="warn">Review this artwork’s name and collection.</p>':''}
          <details><summary>Customer personalization</summary><p>Only bracketed words and photo placeholders can change. Fixed artwork stays locked.</p>${[['text','Bracketed text'],['photos','Photo placeholders'],['recolor','Clipart color changes']].map(([key,label])=>`<label><input type="checkbox" name="edit_${key}" value="1"${!m.personalize||m.personalize[key]!==false?' checked':''}> ${label}</label>`).join('')}</details>
          ${(r.mockup_sources||[]).length?`<details><summary>Mockup order</summary><p>Enter the positions in the order they should appear, separated by commas. Blank shows artwork only. Original files are retained.</p>${r.mockup_sources.map((url,i)=>`<span style="display:inline-block;margin:8px"><img loading="lazy" src="${esc(url)}" style="width:64px;height:64px;object-fit:contain" alt="Mockup ${i}"><br>Position ${i}</span>`).join('')}<label>Positions to show<input name="mockup_order" value="${esc((m.mockup_order||r.mockup_sources.map((_,i)=>i)).join(','))}"></label></details>`:''}
          <a href="/admin/studio-controls?tab=uploads&amp;kind=${r.kind}&amp;id=${r.id}">Add a mockup</a>
          ${prices ? `<details><summary>Individual product prices</summary><p>Blank keeps the default. Overrides include front printing; size/attribute extras and other print locations are added. Overrides do not receive automatic quantity discounts.</p>${prices}</details>` : ''}
          <label>Review note<textarea name="note" maxlength="2000">${esc(m.note || '')}</textarea></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button name="action" value="save">Save settings and prices</button>${r.kind === 'template' ? '<button name="action" value="sell">Enable individual product pricing</button>' : ''}<button name="action" value="publish">Approve and publish</button><button name="action" value="changes">Request changes</button><button name="action" value="hide">Hide</button><button name="action" value="archive">Archive</button></div></form>
          ${m.notify && !m.notify.sent && m.status === 'submitted' ? `<p class="warn">Approval email pending (${Number(m.notify.attempts) || 0} attempts). The submission is saved here.</p>` : ''}</section>`;
      };
      res.send(adminPage('Design library', `${pageHeader('Design library', 'Artwork, mockups, approvals and individual product prices in one place.')}
        ${req.query.saved === '1' ? '<div class="ok">Saved and verified.</div>' : ''}
        <div class="card"><strong>${pending} awaiting approval</strong> · ${items.length} designs and cliparts
        <p>Existing screenshots are kept as mockups. Open a design and use “Prepare artwork preview” before publishing.</p>
        <nav class="sc-tabs" aria-label="Design library sections"><a href="/admin/artwork">Artwork workspace & batch previews</a><a href="/admin/design-library?kind=template">Templates</a><a href="/admin/design-library?kind=readymade">Ready-made designs & prices</a><a href="/admin/design-library?kind=clipart">Clipart</a><a href="/admin/design-library?status=submitted">Awaiting approval</a><a href="/admin/design-library?kind=clipart&amp;review=1">Clipart name review</a></nav><p><a href="/admin/studio-controls">Designer controls</a> · <a href="/admin/design-requests">Design requests and proofs</a> · <a href="/admin/notifications/settings">Notifications</a></p>
        <form method="get" action="/admin/design-library">${view.review?'<input type="hidden" name="review" value="1">':''}
        <label>Search artwork<input name="q" type="search" value="${esc(view.q)}" maxlength="100"></label>
        <label>Artwork type<select name="kind"><option value="">All artwork</option>${['template','readymade','clipart'].map(k=>`<option value="${k}"${view.kind===k?' selected':''}>${k}</option>`).join('')}</select></label>
        <label>Status<select name="status"><option value="">All statuses</option>${['submitted','draft','changes','live','archived'].map(k=>`<option${view.status===k?' selected':''}>${k}</option>`).join('')}</select></label>
        <label>Collection<select name="collection"><option value="">All collections</option>${[...new Set(items.map(r=>r.collection).filter(Boolean))].sort().map(c=>`<option${view.collection===c?' selected':''}>${esc(c)}</option>`).join('')}</select></label>
        <button>Filter artwork</button> <a href="/admin/design-library">Clear filters</a></form>
        <a href="/shop-designs" target="_blank" rel="noopener">View customer gallery</a></div>${paging}${view.items.map(card).join('') || '<div class="card">No artwork matches these filters.</div>'}${paging}
        <script>document.querySelectorAll('.library-master').forEach(function(input){input.addEventListener('change',function(){var f=input.files[0],msg=input.closest('.library-card').querySelector('.library-upload-status');if(!f)return;if(f.size>40*1024*1024){msg.textContent='The file must be under 40 MB.';return;}input.disabled=true;msg.textContent='Uploading master…';fetch('/admin/design-library/master?kind='+encodeURIComponent(input.dataset.kind)+'&id='+input.dataset.id+'&name='+encodeURIComponent(f.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f}).then(function(r){if(!r.ok)throw new Error('Could not upload the master.');return r.json();}).then(function(){location.reload();}).catch(function(e){input.disabled=false;msg.textContent=e.message;});});});document.querySelectorAll('.library-card form').forEach(function(f){f.addEventListener('submit',function(){f.querySelectorAll('button').forEach(function(b){b.style.pointerEvents='none';});});});</script>`, 'design-library'));
    } catch(e) { console.error('library admin:', e.message); res.status(503).send(adminPage('Design library', '<div class="card"><p>Could not load the design library. Your designs have not been changed.</p><a href="/admin/design-library">Try again</a></div>', 'design-library')); }
  });
  app.post('/admin/design-library', requireAdmin, async (req,res) => {
    if (!isOwner()) return res.status(403).send('Only the owner can change design settings.');
    const b = req.body || {}, fields = ['kind','id','action','name','product','collection','featured','note','edit_text','edit_photos','edit_recolor','mockup_order'];
    if (!KINDS.has(b.kind) || !/^\d{1,9}$/.test(String(b.id)) || !['save','publish','hide','changes','archive','sell'].includes(b.action)
      || Object.keys(b).some(k=>!fields.includes(k)&&!/^price_\d{1,9}$/.test(k)) || String(b.name || '').length>120 || String(b.note || '').length>2000 || String(b.collection || '').length>60)
      return res.status(400).send('Invalid design settings.');
    const prices = {};
    for (const [k,v] of Object.entries(b)) if (k.startsWith('price_') && v !== '') {
      if (typeof v !== 'string' || !/^\d{1,4}(?:\.\d{1,2})?$/.test(v)) return res.status(400).send('Enter valid prices.'); prices[k.slice(6)] = v;
    }
    const payload = Object.fromEntries(fields.filter(k => b[k] != null).map(k=>[k,String(b[k])])); payload.prices=JSON.stringify(prices);
    payload.personalize=JSON.stringify({text:b.edit_text==='1',photos:b.edit_photos==='1',recolor:b.edit_recolor==='1'});
    if(b.mockup_order!=null){const parts=String(b.mockup_order).split(',').map(v=>v.trim()).filter(Boolean);if(parts.length>8||parts.some(v=>!/^\d{1,2}$/.test(v)))return res.status(400).send('Choose valid mockup positions.');payload.mockup_order=JSON.stringify(parts.map(Number));}
    delete payload.edit_text;delete payload.edit_photos;delete payload.edit_recolor;
    try {
      if (b.action === 'publish') {
        const save = await studioFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...payload,action:'save'}).toString()});
        const saved = await save.json(); if (!save.ok || !saved.ok) return res.status(400).send(adminPage('Design settings', `<div class="card"><p>${esc(saved.error || 'Could not save settings before publishing.')}</p><a href="/admin/design-library">Back to library</a></div>`, 'design-library'));
      }
      const r = await studioFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(payload).toString()});
      const data = await r.json(); if (!r.ok || !data.ok) return res.status(400).send(adminPage('Design settings', `<div class="card"><p>${esc(data.error || 'Could not save this design.')}</p><a href="/admin/design-library">Back to library</a></div>`, 'design-library'));
      cache=null; at=0; invalidate();
      if (b.action !== 'save') await pool.query("UPDATE notifications SET read_at=NOW() WHERE recipient='owner' AND kind='library' AND ref LIKE $1",[b.kind+'-'+b.id+':%']);
      res.redirect(303,'/admin/design-library?saved=1&item='+encodeURIComponent(data.item.kind+'-'+b.id));
    } catch(e) { console.error('library save:',e.message); res.status(503).send('Could not confirm the save. Reload the design library to check before retrying.'); }
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
      await notifyAdd([{recipient:'owner',kind:'library',ref,title:'Design awaiting approval: '+b.name,link}]);
      const {rows:[n]}=await pool.query("SELECT id,emailed_at FROM notifications WHERE recipient='owner' AND kind='library' AND ref=$1",[ref]);
      if (!n) throw new Error('Notification was not saved');
      const {rows:prefs}=await pool.query("SELECT email FROM notification_prefs WHERE reader='owner' AND kind='library'");
      if (!n.emailed_at && (!prefs.length || prefs[0].email)) {
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

