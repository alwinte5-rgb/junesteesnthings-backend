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
  const mockups = (Array.isArray(r.mockups) ? r.mockups : []).slice(0, 3).filter(v => {
    try { return new URL(v).protocol === 'https:'; } catch { return false; }
  });
  return { id: r.id, kind: r.kind, name: String(r.name || '').slice(0, 120), image: image.href,
    link: link.href, mockups, collection: String(r.collection || '').slice(0, 60), featured: r.featured === true,
    from_price: typeof r.from_price === 'number' && Number.isFinite(r.from_price) && r.from_price > 0 ? r.from_price : null };
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
      const card = r => {
        const m = r.settings || {}, key = r.kind + '-' + r.id;
        const opts = products.map(p => `<option value="${Number(p.id)}"${Number(p.id) === Number(r.product) ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
        const prices = Object.entries(r.offer || {}).map(([pid,p]) => `<label>${esc(p.name)} — default ${(p.default_price ?? p.price) == null ? 'regular pricing' : '$'+Number(p.default_price ?? p.price).toFixed(2)}<input type="number" name="price_${Number(pid)}" min="1" max="9999.99" step="0.01" placeholder="Use default" value="${m.prices && m.prices[pid] != null ? (m.prices[pid]/100).toFixed(2) : ''}"></label>`).join('');
        return `<section class="card library-card" data-status="${esc(r.status)}" data-kind="${esc(r.kind)}" id="${key}">
          <div style="display:flex;gap:16px;flex-wrap:wrap"><div style="width:150px;max-width:100%">${r.image ? `<img src="${esc(r.image)}" alt="${esc(r.name)}" style="width:150px;height:150px;object-fit:contain;background:#e8edf2;border-radius:10px">` : '<p class="warn">Artwork preview needed</p>'}</div>
          <div><h2>${esc(r.name)}</h2><p>${esc(r.kind)} · <strong>${esc(r.status)}</strong></p>
          ${m.submitted_by ? `<p>Submitted by ${esc(m.submitted_by)}</p>` : ''}${m.note ? `<p>${esc(m.note)}</p>` : ''}
          ${r.link ? `<a class="btn" href="${esc(r.link)}" target="_blank" rel="noopener">Open in designer / prepare artwork preview</a>` : '<p>Choose a compatible default product below.</p>'}
          ${(r.mockups || []).slice(0,3).map(src => `<img src="${esc(src)}" alt="Saved mockup" style="width:64px;height:64px;object-fit:contain">`).join('')}</div></div>
          <p>${m.master ? `<a href="/admin/design-library/master?kind=${r.kind}&id=${r.id}">Download Affinity master: ${esc(m.master.name)}</a>` : 'No Affinity master attached.'}</p>
          <label>Attach Affinity master (up to 40 MB)<input type="file" class="library-master" data-kind="${r.kind}" data-id="${r.id}" accept=".afdesign,.afphoto,.afpub,.af"></label><p class="library-upload-status" role="status"></p>
          <form method="post" action="/admin/design-library"><input type="hidden" name="kind" value="${r.kind}"><input type="hidden" name="id" value="${r.id}">
          <label>Design title<input name="name" maxlength="120" value="${esc(r.name)}" required></label><label>Default product<select name="product">${opts}</select></label>
          <label>Collection<input name="collection" maxlength="60" value="${esc(m.collection || '')}" placeholder="Christmas, birthdays, family reunions…"></label>
          <label><input type="checkbox" name="featured" value="1"${m.featured ? ' checked' : ''}> Feature on the homepage</label>
          ${prices ? `<details><summary>Individual product prices</summary><p>Blank keeps the default. Overrides include front printing; size/attribute extras and other print locations are added. Overrides do not receive automatic quantity discounts.</p>${prices}</details>` : ''}
          <label>Review note<textarea name="note" maxlength="2000">${esc(m.note || '')}</textarea></label>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button name="action" value="save">Save settings and prices</button>${r.kind === 'template' ? '<button name="action" value="sell">Enable individual product pricing</button>' : ''}<button name="action" value="publish">Approve and publish</button><button name="action" value="changes">Request changes</button><button name="action" value="hide">Hide</button><button name="action" value="archive">Archive</button></div></form>
          ${m.notify && !m.notify.sent && m.status === 'submitted' ? `<p class="warn">Approval email pending (${Number(m.notify.attempts) || 0} attempts). The submission is saved here.</p>` : ''}</section>`;
      };
      res.send(adminPage('Design library', `${pageHeader('Design library', 'Artwork, mockups, approvals and individual product prices in one place.')}
        ${req.query.saved === '1' ? '<div class="ok">Saved and verified.</div>' : ''}
        <div class="card"><strong>${pending} awaiting approval</strong> · ${items.length} designs and cliparts
        <p>Existing screenshots are kept as mockups. Open a design and use “Prepare artwork preview” before publishing.</p>
        <label>Show<select id="library-filter"><option value="all">All items</option>${['submitted','draft','changes','live','archived'].map(s=>`<option>${s}</option>`).join('')}</select></label>
        <a href="/shop-designs" target="_blank" rel="noopener">View customer gallery</a></div>${items.map(card).join('') || '<div class="card">No designs have been added yet.</div>'}
        <script>document.getElementById('library-filter').onchange=function(){var v=this.value;document.querySelectorAll('.library-card').forEach(function(c){c.hidden=v!=='all'&&c.dataset.status!==v;});};document.querySelectorAll('.library-master').forEach(function(input){input.addEventListener('change',function(){var f=input.files[0],msg=input.closest('.library-card').querySelector('.library-upload-status');if(!f)return;if(f.size>40*1024*1024){msg.textContent='The file must be under 40 MB.';return;}input.disabled=true;msg.textContent='Uploading master…';fetch('/admin/design-library/master?kind='+encodeURIComponent(input.dataset.kind)+'&id='+input.dataset.id+'&name='+encodeURIComponent(f.name),{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:f}).then(function(r){if(!r.ok)throw new Error('Could not upload the master.');return r.json();}).then(function(){location.reload();}).catch(function(e){input.disabled=false;msg.textContent=e.message;});});});document.querySelectorAll('.library-card form').forEach(function(f){f.addEventListener('submit',function(){f.querySelectorAll('button').forEach(function(b){b.style.pointerEvents='none';});});});</script>`, 'design-library'));
    } catch(e) { console.error('library admin:', e.message); res.status(503).send(adminPage('Design library', '<div class="card"><p>Could not load the design library. Your designs have not been changed.</p><a href="/admin/design-library">Try again</a></div>', 'design-library')); }
  });
  app.post('/admin/design-library', requireAdmin, async (req,res) => {
    if (!isOwner()) return res.status(403).send('Only the owner can change design settings.');
    const b = req.body || {}, fields = ['kind','id','action','name','product','collection','featured','note'];
    if (!KINDS.has(b.kind) || !/^\d{1,9}$/.test(String(b.id)) || !['save','publish','hide','changes','archive','sell'].includes(b.action)
      || Object.keys(b).some(k=>!fields.includes(k)&&!/^price_\d{1,9}$/.test(k)) || String(b.name || '').length>120 || String(b.note || '').length>2000 || String(b.collection || '').length>60)
      return res.status(400).send('Invalid design settings.');
    const prices = {};
    for (const [k,v] of Object.entries(b)) if (k.startsWith('price_') && v !== '') {
      if (typeof v !== 'string' || !/^\d{1,4}(?:\.\d{1,2})?$/.test(v)) return res.status(400).send('Enter valid prices.'); prices[k.slice(6)] = v;
    }
    const payload = Object.fromEntries(fields.filter(k => b[k] != null).map(k=>[k,String(b[k])])); payload.prices=JSON.stringify(prices);
    try {
      if (b.action === 'publish') {
        const save = await studioFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({...payload,action:'save'}).toString()});
        const saved = await save.json(); if (!save.ok || !saved.ok) return res.status(400).send(adminPage('Design settings', `<div class="card"><p>${esc(saved.error || 'Could not save settings before publishing.')}</p><a href="/admin/design-library">Back to library</a></div>`, 'design-library'));
      }
      const r = await studioFetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(payload).toString()});
      const data = await r.json(); if (!r.ok || !data.ok) return res.status(400).send(adminPage('Design settings', `<div class="card"><p>${esc(data.error || 'Could not save this design.')}</p><a href="/admin/design-library">Back to library</a></div>`, 'design-library'));
      cache=null; at=0; invalidate();
      if (b.action !== 'save') await pool.query("UPDATE notifications SET read_at=NOW() WHERE recipient='owner' AND kind='library' AND ref LIKE $1",[b.kind+'-'+b.id+':%']);
      res.redirect(303,'/admin/design-library?saved=1#'+data.item.kind+'-'+b.id);
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
    const ref=b.kind+'-'+b.id+':'+b.revision, link='/admin/design-library#'+b.kind+'-'+b.id;
    try {
      await notifyAdd([{recipient:'owner',kind:'library',ref,title:'Design awaiting approval: '+b.name,link}]);
      const {rows:[n]}=await pool.query("SELECT id,emailed_at FROM notifications WHERE recipient='owner' AND kind='library' AND ref=$1",[ref]);
      if (!n) throw new Error('Notification was not saved');
      if (!n.emailed_at) {
        await sendEmail({to:NOTIFY_EMAIL,promo:false,urgent:true,subject:'Design awaiting approval: '+b.name,
          html:`<p>${esc(b.name)} is ready for review${b.submitted_by?' from '+esc(b.submitted_by):''}.</p><p><a href="https://www.jtees.net${link}">Review in your June’s Tees dashboard</a></p>`});
        await pool.query('UPDATE notifications SET emailed_at=NOW() WHERE id=$1',[n.id]);
      }
      res.json({ok:true});
    } catch(e) { console.error('library notification:',e.message);res.status(503).json({error:'Notification could not be delivered; retry required'}); }
  });
}
module.exports = { cleanDesignCard, registerDesignLibrary };
