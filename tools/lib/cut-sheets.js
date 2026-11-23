'use strict';

/* The cut sheet maker on the dashboard (owner, 2026-11-23). It was only at
 * design.jtees.net/jt-cutsheet.php, behind the studio's separate login.
 *
 * The tracing and the PDFs stay on the studio, which has the image tools: this
 * passes the form through with the shared key and shows the links that come
 * back. A build can outlast Cloudflare's wait, so every one is a job with a
 * name made here, and the page asks for it until it is done. */

const crypto = require('node:crypto');
const { Transform } = require('node:stream');

const JOB_RE = /^[0-9a-f]{24}$/;
/* Cloudflare refuses bodies over 100 MB. */
const MAX_BYTES = 95 * 1024 * 1024;
const MAX_FILES = 20;
const BUILD_MS = 5 * 60 * 1000;
const KINDS = ['print', 'cut', 'combined'];

/** Only the studio's own cut sheet files are ever linked. */
function linkOk(url, base, job) {
  const want = `${base}/data/orders/cutsheets/${job}/`;
  return typeof url === 'string' && url.startsWith(want) && /^sheet\d{1,3}-(print|cut|combined)\.pdf$/.test(url.slice(want.length));
}

/** The studio's answer about a job, cut down to what the page shows. */
function shape(body, base, job) {
  const b = body && typeof body === 'object' ? body : {};
  const words = (v) => String(v == null ? '' : v).slice(0, 300);
  if (b.status === 'working' || b.status === 'none') return { status: b.status };
  if (b.status === 'failed') {
    const errors = (Array.isArray(b.errors) ? b.errors : []).slice(0, 40).map(words).filter(Boolean);
    return { status: 'failed', errors: errors.length ? errors : ['The sheets could not be made. Try again.'] };
  }
  if (b.status !== 'done') return { status: 'failed', errors: ['The studio gave an answer this page does not understand.'] };
  const sheets = (Array.isArray(b.sheets) ? b.sheets : Object.values(b.sheets || {})).slice(0, 100)
    .filter((s) => s && KINDS.every((k) => linkOk(s[k], base, job)))
    .map((s) => ({ count: Number(s.count) || 0, print: s.print, cut: s.cut, combined: s.combined }));
  if (!sheets.length) return { status: 'failed', errors: ['No sheet came back. Try again.'] };
  return { status: 'done', sheets, skipped: (Array.isArray(b.skipped) ? b.skipped : []).slice(0, 40)
    .map((x) => (Array.isArray(x) ? `${words(x[0])} (${words(x[1])})` : '')).filter(Boolean) };
}

function pageHtml({ pageHeader, maxFiles = MAX_FILES }) {
  return `${pageHeader('Cut sheet maker', 'Big heads, stickers and decals: transparent PNGs in, print and cut PDFs out, on 48 x 96 in sheets.')}
  <div class="card"><p class="muted" style="margin:0">Each image gets a cut line traced around what is printed, art pushed 1/8" past that line, and a place on a 48 &times; 96 in sheet. You get a print PDF, a cut PDF (CutContour) and a combined PDF per sheet, with matching registration marks.</p></div>
  <div id="cs-out" role="status" aria-live="polite"></div>
  <form class="card" id="cs-form" method="post" enctype="multipart/form-data">
    <label for="cs-art"><b>Images</b> <span class="muted">(PNG or WebP, transparent background, up to ${Number(maxFiles)})</span></label>
    <input type="file" id="cs-art" name="art[]" accept="image/png,image/webp" multiple required>
    <div id="cs-rows" style="display:grid;gap:8px;margin:12px 0"></div>
    <label style="display:flex;gap:8px;align-items:center;font-weight:400;text-transform:none;letter-spacing:0">
      <input type="checkbox" name="bighead" value="1" checked style="width:auto"> Big heads: leave stray hair outside the cut</label>
    <button type="submit" class="btn" id="cs-go" style="margin-top:12px">Make cut sheets</button>
  </form>
  <div class="card"><h2 class="card-title">How the cut line is made</h2><ul class="muted" style="margin:0;padding-left:20px">
    <li>It follows the edge of what is printed, a hair inside it.</li>
    <li>Holes are filled, and gaps or slots under 0.3 in are bridged, because a blade can't follow them.</li>
    <li>Loose pieces within 0.75 in (like a sticker's text) are joined with a border. Specks farther away are left off.</li>
    <li>Items sit 1/4 in apart, inside a 3/4 in margin where the registration marks go.</li></ul></div>
  <style>.cs-row{display:grid;grid-template-columns:1fr 110px 90px;gap:10px;align-items:end}.cs-row .cs-nm{overflow-wrap:anywhere;align-self:center}
    @media(max-width:560px){.cs-row{grid-template-columns:1fr 1fr}.cs-row .cs-nm{grid-column:1/-1}}</style>
  <script>(function(){
    var f=document.getElementById('cs-form'),art=document.getElementById('cs-art'),rows=document.getElementById('cs-rows'),
        go=document.getElementById('cs-go'),out=document.getElementById('cs-out'),MAX=${Number(maxFiles)},MAXB=${MAX_BYTES};
    function el(t,text,css){var e=document.createElement(t);if(text)e.textContent=text;if(css)e.style.cssText=css;return e;}
    function say(tone,text,list){out.textContent='';var d=el('div');d.className=tone;d.appendChild(el('b',text));
      if(list&&list.length){var u=el('ul');list.forEach(function(x){u.appendChild(el('li',x));});d.appendChild(u);}out.appendChild(d);}
    function ready(){go.disabled=false;go.textContent='Make cut sheets';}
    art.addEventListener('change',function(){rows.textContent='';
      Array.prototype.forEach.call(art.files,function(file,i){
        var r=el('div');r.className='cs-row';var n=el('div',file.name);n.className='cs-nm';r.appendChild(n);
        [['Height (in)','h[]','1','90','0.25','12'],['How many','qty[]','1','200','1','1']].forEach(function(d){
          var l=el('label',d[0]),x=document.createElement('input');x.type='number';x.name=d[1];x.min=d[2];x.max=d[3];x.step=d[4];x.value=d[5];x.required=true;
          l.appendChild(x);r.appendChild(l);});
        rows.appendChild(r);});});
    function show(d){out.textContent='';var c=el('div');c.className='card';c.style.borderColor='#1f7a45';
      c.appendChild(el('b',d.sheets.length+(d.sheets.length===1?' sheet ready':' sheets ready')));
      d.sheets.forEach(function(s,i){var r=el('div','Sheet '+(i+1)+' ('+s.count+(s.count===1?' piece): ':' pieces): '),'margin-top:6px');
        [['Print PDF',s.print],['Cut PDF',s.cut],['Combined PDF',s.combined]].forEach(function(k){
          var a=el('a',k[0],'margin-right:12px;font-weight:700');a.href=k[1];a.target='_blank';a.rel='noopener';r.appendChild(a);});
        c.appendChild(r);});
      if(d.skipped.length)c.appendChild(el('p','Left out: '+d.skipped.join('; '),'color:#b45309'));
      c.appendChild(el('p','Open the combined PDF first to check every cut line sits where you want it.','color:#5d5866'));out.appendChild(c);}
    function poll(job,tries,misses){
      fetch('/admin/cut-sheets/job/'+job,{credentials:'same-origin'}).then(function(r){if(!r.ok)throw new Error();return r.json();}).then(function(d){
        if(d.status==='done'){show(d);ready();return;}
        if(d.status==='failed'){say('warn','Nothing was made:',d.errors);ready();return;}
        if(d.status==='none'&&tries>20){say('warn','The studio has no record of that cut sheet. Make it again.');ready();return;}
        if(tries>150){say('warn','It is taking too long. Reload this page in a few minutes to see whether it finished.');ready();return;}
        setTimeout(function(){poll(job,tries+1,0);},3000);
      }).catch(function(){if(misses>9){say('warn','Could not check on the cut sheets. Reload this page to look again.');ready();return;}
        setTimeout(function(){poll(job,tries+1,misses+1);},3000);});}
    function watch(job){go.disabled=true;go.textContent='Making the sheets\\u2026 (can take a few minutes)';
      history.replaceState(null,'','/admin/cut-sheets?job='+job);poll(job,0,0);}
    f.addEventListener('submit',function(e){e.preventDefault();
      var n=art.files.length,b=0;Array.prototype.forEach.call(art.files,function(x){b+=x.size;});
      if(!n)return;
      if(n>MAX){say('warn','Choose at most '+MAX+' images at a time.');return;}
      if(b>MAXB){say('warn','Those images are over 95 MB together. Send fewer at a time.');return;}
      out.textContent='';go.disabled=true;go.textContent='Sending the images\\u2026';
      fetch('/admin/cut-sheets/make',{method:'POST',credentials:'same-origin',body:new FormData(f)})
        .then(function(r){return r.json().catch(function(){return {};}).then(function(d){if(!r.ok||!d.job)throw new Error(d.error||'The images did not arrive. Try again.');return d;});})
        .then(function(d){watch(d.job);})
        .catch(function(err){say('warn',err.message||'The images did not arrive. Try again.');ready();});});
    var had=/[?&]job=([0-9a-f]{24})(?:&|$)/.exec(location.search);if(had)watch(had[1]);
  })();</script>`;
}

/** Counts the bytes passing through and cuts the upload off past the limit. */
function limiter(max) {
  let n = 0;
  return new Transform({ transform(chunk, _enc, cb) {
    n += chunk.length;
    if (n > max) return cb(Object.assign(new Error('too big'), { code: 'too-big' }));
    cb(null, chunk);
  } });
}

function registerCutSheets(app, { requireAdmin, isOwner, adminPage, pageHeader, studioFetch, studioBase, reportError }) {
  const endpoint = `${studioBase}/jt-cutsheet.php`;
  /* A build the studio refused or never received, so the page says so at once
     instead of asking about a job that does not exist. */
  const refused = new Map();
  const refuse = (job, text) => {
    const now = Date.now();
    for (const [k, v] of refused) if (now - v.at > 30 * 60000) refused.delete(k);
    refused.set(job, { at: now, text });
  };

  app.get('/admin/cut-sheets', requireAdmin, (req, res) => {
    if (!isOwner()) return res.status(403).send('Only the owner can make cut sheets.');
    res.set('Cache-Control', 'no-store').send(adminPage('Cut sheet maker', pageHtml({ pageHeader }), 'cutsheets'));
  });

  app.post('/admin/cut-sheets/make', requireAdmin, (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!isOwner()) return res.status(403).json({ error: 'Only the owner can make cut sheets.' });
    const type = String(req.headers['content-type'] || '');
    if (!/^multipart\/form-data;\s*boundary=/i.test(type) || type.length > 300) return res.status(400).json({ error: 'Choose the images first.' });
    if (Number(req.headers['content-length']) > MAX_BYTES + 1024 * 1024) return res.status(413).json({ error: 'Those images are over 95 MB together. Send fewer at a time.' });
    const job = crypto.randomBytes(12).toString('hex');
    const body = limiter(MAX_BYTES + 1024 * 1024);
    let answered = false;
    const answer = (status, data) => { if (!answered && !res.headersSent) { answered = true; res.status(status).json(data); } };
    /* The upload has all arrived: the page is told the job's name and asks for
       it. The studio may still be building. */
    body.on('end', () => answer(202, { job }));
    req.on('aborted', () => body.destroy(new Error('upload stopped')));
    req.on('error', (e) => body.destroy(e));
    req.pipe(body);
    studioFetch(`${endpoint}?job=${job}`, { method: 'POST', headers: { 'Content-Type': type },
      body: require('node:stream').Readable.toWeb(body), duplex: 'half', timeoutMs: BUILD_MS })
      .then(async (r) => {
        if (r.ok) return;
        /* 5xx and 524 are Cloudflare giving up on the wait: the studio carries
           on, and the job itself says how it ended. */
        if (r.status >= 500) { console.error(`cut sheet ${job}: studio answered ${r.status}`); return answer(202, { job }); }
        const b = await r.json().catch(() => ({}));
        const text = r.status === 403 ? 'The studio refused this app’s key: the internal key must be set, and the same, on both services.'
          : r.status === 413 ? 'Those images are too big. Send fewer at a time.'
          : String((b && b.error) || `The studio answered ${r.status}.`).slice(0, 300);
        console.error(`cut sheet ${job} refused: ${text}`);
        refuse(job, text);
        answer(502, { error: text });
      })
      .catch((e) => {
        if (e && e.name === 'TimeoutError') return answer(202, { job });
        const big = body.errored && body.errored.code === 'too-big';
        const text = big ? 'Those images are over 95 MB together. Send fewer at a time.' : 'The studio could not be reached. Try again in a minute.';
        console.error(`cut sheet ${job} failed:`, e && e.message);
        if (!big && !(body.errored)) reportError('cut-sheet', e).catch(() => {});
        /* Reached after the upload arrived: the job may still have started, so
           the studio is asked; only an upload that never arrived is final. */
        if (!answered) { refuse(job, text); answer(big ? 413 : 502, { error: text }); }
        req.unpipe(body);
        req.resume();
      });
  });

  app.get('/admin/cut-sheets/job/:job', requireAdmin, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!isOwner()) return res.status(403).json({ error: 'Only the owner can make cut sheets.' });
    const job = String(req.params.job || '');
    if (!JOB_RE.test(job)) return res.status(404).json({ error: 'No such cut sheet.' });
    if (refused.has(job)) return res.json({ status: 'failed', errors: [refused.get(job).text] });
    try {
      const r = await studioFetch(`${endpoint}?job=${job}`, { timeoutMs: 15000 });
      if (!r.ok) throw new Error(`studio answered ${r.status}`);
      return res.json(shape(await r.json(), studioBase, job));
    } catch (e) {
      console.error(`cut sheet job ${job} read failed:`, e.message);
      return res.status(503).json({ error: 'Could not check on the cut sheets.' });
    }
  });
}

module.exports = { registerCutSheets, shape, linkOk, pageHtml, limiter, JOB_RE, MAX_BYTES, MAX_FILES };
