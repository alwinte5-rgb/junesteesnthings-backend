'use strict';

/* Sending a paid job to Gooten: the card on the job page, its routes, the
 * Gooten page, and the hourly check that brings status and tracking back.
 * The client and the rules are tools/lib/gooten.js.
 *
 * Owner, 2026-11-25: a "Send to Gooten" button, never automatic. Gooten
 * charges the owner's card for every order, so:
 *   1. Prepare: lines, artwork and address are checked and priced by Gooten.
 *      Nothing is ordered.
 *   2. Send: the price is asked for again and must match what was shown, the
 *      address must not have moved, and the row is claimed in one UPDATE, so
 *      two clicks send one order.
 *   3. No clear answer is 'unknown': it is looked up at Gooten by our own
 *      reference, never just sent again.
 * Every order is a TEST until the owner sets GOOTEN_LIVE=1. */

const G = require('./gooten');

/* draft    prepared and priced, not sent
 * sending  claimed by a click; still here after 10 minutes is 'unknown'
 * unknown  sent, no clear answer: look it up
 * sent     Gooten has it
 * closed   shipped, cancelled, or a test that is finished with */
const OPEN = ['draft', 'sending', 'unknown'];

async function ensureTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gooten_orders (
      id            BIGSERIAL PRIMARY KEY,
      quote_code    TEXT NOT NULL,
      status        TEXT NOT NULL DEFAULT 'draft',
      test          BOOLEAN NOT NULL DEFAULT TRUE,
      items         JSONB NOT NULL,
      ship_dest     TEXT NOT NULL,
      ship_to       JSONB NOT NULL,
      ship_type     TEXT NOT NULL,
      whole_job     BOOLEAN NOT NULL DEFAULT FALSE,
      est           JSONB NOT NULL,
      warnings      JSONB NOT NULL DEFAULT '[]',
      error         TEXT,
      gooten_id     TEXT,
      standing      JSONB,
      charged       NUMERIC(10,2),
      created_by    INT,
      sent_by       INT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sending_at    TIMESTAMPTZ,
      sent_at       TIMESTAMPTZ,
      checked_at    TIMESTAMPTZ,
      job_shipped_at TIMESTAMPTZ,
      notify_error  TEXT
    )`);
  await pool.query('CREATE INDEX IF NOT EXISTS gooten_orders_quote ON gooten_orders (quote_code, id)');
  /* One order being prepared or sent per job at a time. */
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS gooten_orders_one_open ON gooten_orders (quote_code)
    WHERE status IN ('draft', 'sending', 'unknown')`);
}

/** Why a job cannot go to Gooten, or ''. Refunded and cancelled jobs never. */
function refusal(q) {
  if (!q) return 'That job was not found.';
  if (q.cancelled_at) return 'This job is cancelled.';
  if (['draft', 'held', 'expired'].includes(String(q.status || ''))) return 'This quote has not gone to the customer.';
  if (!q.accepted_at) return 'The customer has not accepted this quote.';
  if (!(Number(q.paid_amount || 0) > 0)) return 'Nothing has been paid on this job yet.';
  if (q.delivered_at) return 'This job is already delivered.';
  return '';
}

const sameAddress = (a, b) => ['name', 'street1', 'street2', 'city', 'state', 'zip']
  .every((k) => String((a && a[k]) || '') === String((b && b[k]) || ''));

function registerGooten(app, d) {
  const { pool, requireAdmin, adminPage, pageHeader, back, esc, money, quoteCodeRe, SHIP, ART, PHOTOS, shop,
          mayUse, staffId, quoteTotals, balanceOf, moveToShipped, inTextingHours, reportError, env = process.env, fetcher } = d;
  const api = () => G.client({ env, ...(fetcher ? { fetcher } : {}) });
  const jobPath = (code) => `/admin/production/${code}#gooten`;
  const codeOf = (req) => { const c = String(req.params.code || '').toUpperCase(); return quoteCodeRe.test(c) ? c : null; };
  const idOf = (v) => (/^\d{1,12}$/.test(String(v || '')) ? String(v) : null);

  async function artFor(q) {
    const { rows: [a] } = await pool.query('SELECT files, status FROM art_requests WHERE quote_code = $1', [q.code]);
    const cloud = PHOTOS.cloudName(env);
    return G.artworkChoices({
      artFiles: a && a.status === 'approved' && Array.isArray(a.files) ? a.files : [],
      photos: Array.isArray(q.customer_photos) ? q.customer_photos : [],
      artOk: (u) => ART.artUrlOk(u, cloud), photoOk: (u) => PHOTOS.photoUrlOk(u, cloud),
    });
  }
  /** Where the order would go: { to } or { error }. */
  function destination(q, dest) {
    if (dest === 'shop') return { to: shop };
    if (!SHIP.quoteShips(q)) return { error: 'This job is not set to ship to the customer. Choose the shop, or change how it goes.' };
    const to = SHIP.cleanShipTo(q.ship_to, q.name);
    return SHIP.shipToProblems(to).length ? { error: 'Add the customer’s full address on the Shipping page first.' } : { to };
  }
  const pub = (a) => ({ name: a.name, street1: a.street1, street2: a.street2 || '', city: a.city, state: a.state, zip: a.zip });

  /* ── The job page card ─────────────────────────────────────────────── */

  async function card(q, query = {}) {
    if (!mayUse('POST', '/admin/quote/:code/gooten/prepare')) return '';
    const { rows } = await pool.query('SELECT * FROM gooten_orders WHERE quote_code = $1 ORDER BY id DESC', [q.code]);
    const why = refusal(q);
    if (why && !rows.length) return '';
    const open = rows.find((r) => OPEN.includes(r.status));
    const past = rows.filter((r) => !OPEN.includes(r.status));
    const c = esc(q.code);
    const form = (r, path, label, cls = '', ask = '') => `<form method="POST" action="/admin/quote/${c}/gooten/${path}" style="display:inline-block;margin:8px 6px 0 0"
        onsubmit="${ask ? `if(!confirm(${esc(JSON.stringify(ask))}))return false;` : ''}this.querySelector('button').disabled=true">
      <input type="hidden" name="id" value="${Number(r.id)}"><input type="hidden" name="total" value="${esc(String(r.est && r.est.total))}">
      <input type="hidden" name="mode" value="${G.live(env) ? 'live' : 'test'}">
      <button type="submit"${cls ? ` class="${cls}"` : ''}>${label}</button></form>`;
    const lines = (r) => `<ul style="margin:6px 0;padding-left:18px">${r.items.map((it) => `<li>${Number(it.qty)} &times; ${esc(it.sku)} &middot; ${
      it.images.map((u, n) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc((it.names && it.names[n]) || (n ? 'second artwork' : 'artwork'))}</a>`).join(', ')}</li>`).join('')}</ul>
      <div class="muted" style="font-size:13px">${esc(r.ship_type)} to ${esc(SHIP.shipToLines(r.ship_to).join(', '))}</div>`;
    const tag = (r) => (r.test ? ' <span style="background:#fef3c7;color:#92400e;border-radius:6px;padding:1px 7px;font-size:12px">TEST</span>' : '');
    let body = '';
    if (!G.configured(env)) {
      body = '<div class="warn">Gooten is not set up: the server needs GOOTEN_RECIPE_ID and GOOTEN_PARTNER_BILLING_KEY.</div>';
    } else if (open && open.status === 'draft') {
      const due = balanceOf(q, quoteTotals(q).total);
      const isLive = G.live(env);
      body = `${open.error ? `<div class="warn">${esc(open.error)}</div>` : ''}${lines(open)}
        ${(open.warnings || []).map((w) => `<div class="warn">${esc(w)}</div>`).join('')}
        ${due > 0 ? `<div class="warn">The customer still owes ${money(due)} on this job.</div>` : ''}
        <div style="margin:8px 0"><b>Gooten’s estimate: ${money(open.est.total)}</b> <span class="muted">(${money(open.est.items)} items + ${money(open.est.shipping)} shipping, before any tax)</span></div>
        ${isLive ? '' : '<div class="muted" style="font-size:13px">Test mode: Gooten records the order and charges nothing. Real orders start when GOOTEN_LIVE=1 is set on the server.</div>'}
        ${why ? `<div class="warn">${esc(why)}</div>` : form(open, 'send', isLive ? 'Send to Gooten' : 'Send a test to Gooten', '',
          isLive ? `Send this order to Gooten? Your card on file there is charged about ${money(open.est.total)}.` : 'Send this as a test order? Nothing is charged.')}
        ${form(open, 'discard', 'Start over', 'btn-ghost')}`;
    } else if (open) {
      body = `<div class="warn">${open.status === 'sending' ? 'This order is being sent.' : 'Gooten gave no clear answer, so this order may or may not be there.'} Do not order it another way: check with Gooten first.</div>
        ${lines(open)}${form(open, 'check', 'Check with Gooten')}`;
    } else if (!why) {
      const art = await artFor(q);
      const opts = (blank) => `<option value="">${blank}</option>${art.map((a) => `<option value="${esc(a.url)}">${esc(a.label)}</option>`).join('')}`;
      const row = `<div class="row" style="gap:8px;flex-wrap:wrap;margin:6px 0" data-gline>
        <input name="sku" maxlength="120" placeholder="Gooten SKU" aria-label="Gooten SKU" style="flex:2 1 220px">
        <input name="qty" type="number" min="1" max="${G.MAX_QTY}" inputmode="numeric" placeholder="Qty" aria-label="Quantity" style="flex:0 0 80px">
        <select name="art" aria-label="Artwork" style="flex:1 1 180px">${opts('Artwork…')}</select>
        <select name="art2" aria-label="Second artwork" style="flex:1 1 180px">${opts('No second side')}</select></div>`;
      const ships = SHIP.quoteShips(q);
      body = !art.length
        ? '<div class="muted">No print-ready artwork on this job yet. Gooten needs a PNG or JPG: approve the final art, or ask the customer for a file.</div>'
        : `<details><summary style="cursor:pointer;color:#1848B8">Prepare a Gooten order</summary>
        <form method="POST" action="/admin/quote/${c}/gooten/prepare" onsubmit="this.querySelector('button[type=submit]').disabled=true">
          <div class="muted" style="font-size:13px;margin-top:8px">Find SKUs and costs on the <a href="/admin/gooten" target="_blank">Gooten page</a>. Nothing is ordered at this step.</div>
          <div data-glines>${row}</div>
          <button type="button" class="kbtn" onclick="var w=this.form.querySelector('[data-glines]'),f=w.firstElementChild;if(w.children.length>=${G.MAX_LINES})return;var n=f.cloneNode(true);n.querySelectorAll('input').forEach(function(i){i.value=''});n.querySelectorAll('select').forEach(function(s){s.selectedIndex=0});w.appendChild(n)">Add a line</button>
          <div class="row" style="gap:8px;flex-wrap:wrap;margin:10px 0">
            <select name="dest" aria-label="Where it goes">${ships ? '<option value="customer">Ship to the customer</option>' : ''}<option value="shop">Ship to the shop</option></select>
            <select name="ship_type" aria-label="Shipping speed">${G.SHIP_TYPES.map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join('')}</select></div>
          ${ships ? `<label style="display:block;font-weight:400;text-transform:none;margin:0 0 10px"><input type="checkbox" name="whole_job" value="1" style="width:auto;display:inline-block">
            Gooten makes everything on this job: when it ships to the customer, mark the job shipped and tell them</label>` : ''}
          <button type="submit">Check price and stock</button>
        </form></details>`;
    }
    const history = past.map((r) => {
      const s = r.standing || { items: [] };
      return `<div style="border-top:1px solid #eef1f6;padding:8px 0;margin-top:8px"><b>${esc(r.gooten_id || '')}</b>${tag(r)}
        <span class="muted">${r.charged != null ? `charged ${money(r.charged)}` : `estimate ${money(r.est.total)}`}${r.charged != null ? ' &middot; <a href="#costs">add it to the job’s costs</a>' : ''}</span>
        ${s.problem ? '<div class="warn">Gooten has a problem with this order. Open it in Gooten Admin.</div>' : ''}
        ${r.notify_error ? `<div class="warn">${esc(r.notify_error)}</div>` : ''}
        ${s.partCancelled ? '<div class="warn">Gooten cancelled part of this order.</div>' : ''}
        ${s.items.length ? `<ul style="margin:6px 0;padding-left:18px">${s.items.map((it) => `<li>${esc(it.sku)}: ${esc(it.status || 'no status yet')}${
          (it.parcels || []).map((p) => ` &middot; ${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.number)}</a>` : esc(p.number)}`).join('')}</li>`).join('')}</ul>` : lines(r)}
        ${r.status === 'sent' && G.configured(env) ? form(r, 'check', 'Check status', 'btn-ghost') : ''}</div>`;
    }).join('');
    const said = query.gooten_ok ? `<div class="ok">${esc(String(query.gooten_ok).slice(0, 300))}</div>`
      : query.gooten_err ? `<div class="warn">${esc(String(query.gooten_err).slice(0, 400))}</div>` : '';
    return `<div class="card" id="gooten" style="margin-top:14px"><h2 class="card-title">Gooten${open ? (open.status === 'draft' ? (G.live(env) ? '' : tag({ test: true })) : tag(open)) : ''}</h2>${said}${body}${history}</div>`;
  }

  /* ── Routes ────────────────────────────────────────────────────────── */

  const say = (res, code, ok, msg) => back(res, jobPath(code), ok ? 'gooten_ok' : 'gooten_err', msg);
  const quote = async (code) => (await pool.query('SELECT * FROM quotes WHERE code = $1', [code])).rows[0];

  app.post('/admin/quote/:code/gooten/prepare', requireAdmin, async (req, res) => {
    const code = codeOf(req);
    if (!code) return res.redirect('/admin/quotes');
    const b = req.body || {};
    try {
      const q = await quote(code);
      const why = refusal(q);
      if (why) return say(res, code, false, why);
      const { items, error } = G.parseLines(b, await artFor(q));
      if (error) return say(res, code, false, error);
      const shipType = String(b.ship_type || '');
      if (!G.SHIP_TYPES.includes(shipType)) return say(res, code, false, 'Choose a shipping speed.');
      const dest = b.dest === 'customer' ? 'customer' : b.dest === 'shop' ? 'shop' : '';
      if (!dest) return say(res, code, false, 'Choose where it goes.');
      const { to, error: noTo } = destination(q, dest);
      if (noTo) return say(res, code, false, noTo);
      const g = api();
      const skus = [...new Set(items.map((i) => i.sku))];
      const out = await g.outOfStock(skus, to);
      if (!Array.isArray(out)) return say(res, code, false, 'Gooten’s stock answer could not be read. Nothing was prepared.');
      if (out.length) return say(res, code, false, `Out of stock at Gooten: ${out.map(String).join(', ').slice(0, 250)}.`);
      const est = G.estimate(await g.price(items, to, shipType));
      if (!est) return say(res, code, false, 'Gooten gave no price for that. Check the SKUs and the shipping speed.');
      /* An address Gooten doubts is a warning to look at, not a block: new
         buildings are unknown to every checker. */
      const warnings = [];
      try {
        const v = await g.validateAddress(to);
        if (v && v.IsValid === false) warnings.push(`Gooten is not sure of this address${v.Reason ? ': ' + String(v.Reason).slice(0, 160) : ''}. Check it with the customer.`);
      } catch { warnings.push('Gooten could not check this address. Read it over before sending.'); }
      const { rowCount } = await pool.query(
        `INSERT INTO gooten_orders (quote_code, items, ship_dest, ship_to, ship_type, whole_job, est, warnings, created_by)
         VALUES ($1, $2::jsonb, $3, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, $9)
         ON CONFLICT (quote_code) WHERE status IN ('draft', 'sending', 'unknown') DO NOTHING`,
        [code, JSON.stringify(items), dest, JSON.stringify(pub(to)), shipType,
         dest === 'customer' && b.whole_job === '1', JSON.stringify(est), JSON.stringify(warnings), staffId()]);
      return say(res, code, !!rowCount, rowCount ? 'Priced. Read it over, then send it.' : 'A Gooten order is already being prepared on this job.');
    } catch (e) {
      if (e instanceof G.GootenError) return say(res, code, false, `${e.message} Nothing was prepared.`);
      console.error(`gooten prepare on ${code} failed:`, e.message);
      return say(res, code, false, 'That did not work. Nothing was ordered.');
    }
  });

  app.post('/admin/quote/:code/gooten/discard', requireAdmin, async (req, res) => {
    const code = codeOf(req), id = idOf(req.body && req.body.id);
    if (!code || !id) return res.redirect('/admin/quotes');
    try {
      const { rowCount } = await pool.query(`DELETE FROM gooten_orders WHERE id = $1 AND quote_code = $2 AND status = 'draft'`, [id, code]);
      return say(res, code, !!rowCount, rowCount ? 'Cleared. Nothing was ordered.' : 'That order is no longer a draft.');
    } catch (e) {
      console.error(`gooten discard on ${code} failed:`, e.message);
      return say(res, code, false, 'That did not save. Try again.');
    }
  });

  app.post('/admin/quote/:code/gooten/send', requireAdmin, async (req, res) => {
    const code = codeOf(req), id = idOf(req.body && req.body.id);
    if (!code || !id) return res.redirect('/admin/quotes');
    const backToDraft = (msg) => pool.query(
      `UPDATE gooten_orders SET status = 'draft', sending_at = NULL, error = $2 WHERE id = $1 AND status = 'sending'`, [id, String(msg).slice(0, 400)]);
    let claimed = false;
    try {
      const test = !G.live(env);
      /* What the button said is what is sent: a page left open from test mode
         promised "nothing is charged". */
      if (String((req.body || {}).mode) !== (test ? 'test' : 'live')) return say(res, code, false, `Gooten is now in ${test ? 'test' : 'live'} mode. Nothing was sent: check the order and send again.`);
      const q = await quote(code);
      const why = refusal(q);
      if (why) return say(res, code, false, why);
      const { rows: [row] } = await pool.query(`SELECT * FROM gooten_orders WHERE id = $1 AND quote_code = $2`, [id, code]);
      if (!row || row.status !== 'draft') return say(res, code, false, 'That order is not waiting to be sent.');
      /* The price on the screen that was clicked, not one prepared since. */
      if (String((req.body || {}).total) !== String(row.est.total)) return say(res, code, false, 'The price changed since you opened this page. Check it and send again.');
      const { to, error } = destination(q, row.ship_dest);
      if (error) return say(res, code, false, error);
      if (!sameAddress(to, row.ship_to)) return say(res, code, false, 'The address changed since this was priced. Start over.');
      const known = new Set((await artFor(q)).map((a) => a.url));
      if (!row.items.every((it) => it.images.every((u) => known.has(u)))) return say(res, code, false, 'The artwork changed since this was priced. Start over.');
      const g = api();
      const now = G.estimate(await g.price(row.items, to, row.ship_type));
      if (!now) return say(res, code, false, 'Gooten gave no price just now. Nothing was sent.');
      if (now.total !== row.est.total) {
        await pool.query(`UPDATE gooten_orders SET est = $2::jsonb WHERE id = $1 AND status = 'draft'`, [id, JSON.stringify(now)]);
        return say(res, code, false, `Gooten’s price is now ${money(now.total)} (it was ${money(row.est.total)}). Nothing was sent: check it and send again.`);
      }
      /* Claimed in one statement that also re-reads the job, so a second click,
         a refund to nothing or a cancel landing meanwhile sends nothing. */
      const { rows: [mine] } = await pool.query(
        `UPDATE gooten_orders SET status = 'sending', sending_at = NOW(), test = $3, error = NULL, sent_by = $4
          WHERE id = $1 AND quote_code = $2 AND status = 'draft'
            AND EXISTS (SELECT 1 FROM quotes WHERE code = $2 AND cancelled_at IS NULL AND accepted_at IS NOT NULL
                          AND delivered_at IS NULL AND COALESCE(paid_amount, 0) > 0)
          RETURNING *`, [id, code, test, staffId()]);
      if (!mine) return say(res, code, false, 'That order was already sent, or the job changed. Nothing more was sent.');
      claimed = true;
      const { id: gid } = await g.submit(G.orderPayload(mine, { shop, phone: q.phone }));
      await pool.query(`UPDATE gooten_orders SET status = 'sent', gooten_id = $2, sent_at = NOW() WHERE id = $1`, [id, gid]);
      console.log(`gooten: ${test ? 'test ' : ''}order ${gid} sent for ${code}`);
      return say(res, code, true, test ? 'Test order sent. Nothing was charged.' : 'Sent to Gooten. Status and tracking will show here.');
    } catch (e) {
      const known = e instanceof G.GootenError;
      if (!claimed) {
        if (!known) console.error(`gooten send on ${code} failed before sending:`, e.message);
        return say(res, code, false, known ? `${e.message} Nothing was sent.` : 'Something went wrong here before Gooten was asked. Nothing was sent.');
      }
      if (known && e.kind === 'refused') {
        await backToDraft(`Gooten refused it: ${e.message}`).catch((x) => console.error('gooten draft restore failed:', x.message));
        return say(res, code, false, `Gooten refused the order, so nothing was made: ${e.message}`);
      }
      console.error(`gooten send on ${code} (order row ${id}) has no clear answer:`, e.message);
      reportError('gooten:unclear-send', e, code).catch(() => {});
      await pool.query(`UPDATE gooten_orders SET status = 'unknown' WHERE id = $1 AND status = 'sending'`, [id])
        .catch((x) => console.error('gooten unknown mark failed:', x.message));
      return say(res, code, false, 'Gooten gave no clear answer, so the order may be there. Press Check with Gooten before anything else.');
    }
  });

  app.post('/admin/quote/:code/gooten/check', requireAdmin, async (req, res) => {
    const code = codeOf(req), id = idOf(req.body && req.body.id);
    if (!code || !id) return res.redirect('/admin/quotes');
    try {
      const { rows: [row] } = await pool.query('SELECT * FROM gooten_orders WHERE id = $1 AND quote_code = $2', [id, code]);
      if (!row) return say(res, code, false, 'That order was not found.');
      if (row.status === 'sent') {
        await refresh(row);
        return say(res, code, true, 'Checked with Gooten.');
      }
      if (!['unknown', 'sending'].includes(row.status)) return say(res, code, false, 'There is nothing to check on that order.');
      /* A send still running answers for itself. */
      if (row.status === 'sending' && Date.now() - new Date(row.sending_at).getTime() < 10 * 60000) return say(res, code, false, 'It is still being sent. Check again in a few minutes.');
      const found = await lookUp(row);
      if (found) return say(res, code, true, `Gooten has this order${row.test ? ' (a test)' : ''}.`);
      /* Not there yet is not proof it never will be: an hour of asking first. */
      if (Date.now() - new Date(row.sending_at).getTime() < 60 * 60000) return say(res, code, false, 'Gooten does not show it yet. Check again an hour after it was sent before sending it again.');
      await pool.query(`UPDATE gooten_orders SET status = 'draft', sending_at = NULL, error = 'Gooten never received it. You can send it again.' WHERE id = $1 AND status IN ('unknown', 'sending')`, [id]);
      return say(res, code, true, 'Gooten never received it. You can send it again.');
    } catch (e) {
      console.error(`gooten check on ${code} failed:`, e.message);
      return say(res, code, false, e instanceof G.GootenError ? e.message : 'The check did not work. Try again.');
    }
  });

  /** An unclear send, looked up by our own reference. True once found. */
  async function lookUp(row) {
    const start = new Date(new Date(row.sending_at || row.created_at).getTime() - 2 * 86400000).toISOString().slice(0, 10);
    const o = G.findBySource(await api().search(G.sourceId(row), start), G.sourceId(row));
    if (!o) return false;
    await pool.query(`UPDATE gooten_orders SET status = 'sent', gooten_id = $2, sent_at = COALESCE(sent_at, sending_at, NOW()), error = NULL
      WHERE id = $1 AND status IN ('unknown', 'sending')`, [row.id, o.Id]);
    return true;
  }

  /** A sent order's status, tracking and real charge, from Gooten. */
  async function refresh(row) {
    const g = api();
    const o = await g.order(row.gooten_id);
    const s = G.standing(o);
    /* A failed read here holds nothing up: the hourly check keeps asking,
       closed or not, until it has the charge (sweep, readCharge). */
    const charged = await readCharge(row, o).catch((e) => { console.error(`gooten billing for ${row.quote_code}:`, e.message); return null; });
    await pool.query('UPDATE gooten_orders SET standing = $2::jsonb, charged = COALESCE($3, charged), checked_at = NOW() WHERE id = $1',
      [row.id, JSON.stringify(s), charged]);
    if (s.cancelled) return void await close(row.id);
    if (!s.shipped) return;
    if (row.test || !row.whole_job || row.ship_dest !== 'customer') return void await close(row.id);
    /* A text goes out with this, so it waits for daytime: the order stays
       'sent' and the next hourly check does it. */
    if (!inTextingHours()) return;
    /* Part cancelled is not "everything": a person decides what to say. */
    if (s.partCancelled) return void await close(row.id);
    const { rowCount } = await pool.query(
      'UPDATE gooten_orders SET job_shipped_at = NOW() WHERE id = $1 AND job_shipped_at IS NULL', [row.id]);
    if (rowCount) {
      try { await shipJob(row, s.tracking); }
      catch (e) {
        await pool.query('UPDATE gooten_orders SET job_shipped_at = NULL WHERE id = $1', [row.id]).catch(() => {});
        throw e;
      }
    }
    await close(row.id);
  }
  /** What Gooten charged, or null while it has no total yet. */
  async function readCharge(row, o) {
    if (row.test) return null;
    if (row.charged != null) return row.charged;
    const gid = Number(o && o.GootenId);
    return Number.isSafeInteger(gid) && gid > 0 ? G.billed(await api().billing(gid)) : null;
  }
  async function catchUpCharge(row) {
    const n = await readCharge(row, await api().order(row.gooten_id));
    await pool.query('UPDATE gooten_orders SET charged = COALESCE($2, charged), checked_at = NOW() WHERE id = $1', [row.id, n]);
  }
  const close = (id) => pool.query(`UPDATE gooten_orders SET status = 'closed' WHERE id = $1 AND status = 'sent'`, [id]);
  async function shipJob(row, tracking) {
    const code = row.quote_code;
    const { rows: [q] } = await pool.query(
      `UPDATE quotes SET tracking = CASE WHEN COALESCE(tracking, '') = '' THEN NULLIF($2, '') ELSE tracking END
        WHERE code = $1 AND cancelled_at IS NULL AND shipped_at IS NULL AND delivered_at IS NULL RETURNING code`,
      [code, G.trackingLine(tracking)]);
    if (!q) return;
    const after = await moveToShipped(code);   // emails and texts the customer, once each
    const told = after && after._notified;
    /* The job is shipped either way; a message that did not go must not pass
       for one that did. */
    if (!after || told === 'failed' || told === 'no-email') {
      const why = !after ? 'The job could not be marked shipped.' : told === 'failed' ? 'The job is marked shipped, but the customer’s email did not send. Tell them.'
        : 'The job is marked shipped, but there is no email address for the customer. Check they were told.';
      await pool.query('UPDATE gooten_orders SET notify_error = $2 WHERE id = $1', [row.id, why]);
      reportError('gooten:customer-not-told', new Error(why), code).catch(() => {});
    }
  }

  /** Hourly: sends left hanging, then every order Gooten is working on. One
   *  order failing never stops the rest; all the failures are thrown at the end. */
  async function sweep() {
    if (!G.configured(env)) return '';
    await pool.query(`UPDATE gooten_orders SET status = 'unknown' WHERE status = 'sending' AND sending_at < NOW() - INTERVAL '10 minutes'`);
    const { rows } = await pool.query(
      `SELECT * FROM gooten_orders WHERE status = 'unknown' OR (status = 'sent' AND (NOT test OR sent_at > NOW() - INTERVAL '3 days'))
           OR (status = 'closed' AND NOT test AND charged IS NULL AND sent_at > NOW() - INTERVAL '14 days')
        ORDER BY checked_at NULLS FIRST, id LIMIT 100`);
    const failed = [];
    for (const row of rows) {
      try { if (row.status === 'unknown') await lookUp(row); else if (row.status === 'closed') await catchUpCharge(row); else await refresh(row); }
      catch (e) {
        failed.push(`${row.quote_code}: ${e.message}`);
        /* To the back of the line, so 100 broken ones cannot starve the rest. */
        await pool.query('UPDATE gooten_orders SET checked_at = NOW() WHERE id = $1', [row.id]).catch(() => {});
      }
    }
    if (failed.length) throw new Error(`Gooten check: ${failed.slice(0, 5).join('; ')}${failed.length > 5 ? ` and ${failed.length - 5} more` : ''}`);
    return rows.length ? `${rows.length} checked` : '';
  }

  /** For the owner's list: orders that will not move until someone acts. */
  async function alerts() {
    const { rows } = await pool.query(
      `SELECT o.id, o.quote_code, o.status, o.standing, o.notify_error, q.name FROM gooten_orders o JOIN quotes q ON q.code = o.quote_code
        WHERE (o.status = 'unknown')
           OR (o.status = 'draft' AND o.created_at < NOW() - INTERVAL '1 day' AND q.cancelled_at IS NULL)
           OR (o.status = 'sent' AND NOT o.test AND (o.standing->>'problem' = 'true' OR o.standing->>'partCancelled' = 'true'))
           OR (o.status = 'closed' AND NOT o.test AND o.sent_at > NOW() - INTERVAL '14 days'
               AND (o.standing->>'cancelled' = 'true' OR o.standing->>'partCancelled' = 'true' OR o.notify_error IS NOT NULL
                 OR (o.charged IS NULL AND o.sent_at < NOW() - INTERVAL '3 days')))
        ORDER BY o.id DESC LIMIT 100`);
    const said = (r) => (r.status === 'unknown' ? ['red', 'Gooten may not have this order', 'check with Gooten before ordering again']
      : r.status === 'draft' ? ['amber', 'Gooten order prepared but not sent', 'send it, or start over']
        : r.notify_error ? ['red', 'Shipped by Gooten, customer not told', r.notify_error]
          : r.standing && r.standing.cancelled ? ['red', 'Gooten cancelled this order', 'open it in Gooten Admin']
            : r.standing && r.standing.partCancelled ? ['red', 'Gooten cancelled part of this order', 'the rest shipped: sort out the missing items']
              : r.status === 'closed' ? ['amber', 'Gooten’s charge could not be read', 'look it up in Gooten Admin and add it to the costs']
          : ['red', 'Gooten has a problem with this order', 'open it in Gooten Admin']);
    return rows.map((r) => {
      const [tone, title, sub] = said(r);
      return { group: 'customers', kind: 'customer', ref: `gooten:${Number(r.id)}:${r.status}`, tone, icon: 'alert',
        title: `${title}: ${r.name || r.quote_code}`, sub: `${r.quote_code}: ${sub}`, href: `/admin/production/${encodeURIComponent(r.quote_code)}#gooten` };
    });
  }

  /* ── The Gooten page: what they sell, and the SKUs ─────────────────── */

  let cat = { at: 0, list: [] };
  async function products() {
    if (cat.list.length && Date.now() - cat.at < 6 * 3600000) return cat.list;
    const r = await (fetcher || fetch)(G.CATALOG_URL, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`catalog ${r.status}`);
    const list = G.catalogProducts(await r.json());
    if (!list.length) throw new Error('catalog is empty');
    cat = { at: Date.now(), list };
    return list;
  }

  app.get('/admin/gooten', requireAdmin, async (req, res) => {
    const find = String(req.query.q || '').slice(0, 80).trim();
    const pid = /^\d{1,9}$/.test(String(req.query.product || '')) ? Number(req.query.product) : null;
    const head = pageHeader('Gooten', 'Print-on-demand products, with what they cost the shop before your price.');
    const search = `<form method="get" class="card row" style="gap:8px"><input name="q" value="${esc(find)}" placeholder="Search" aria-label="Search" style="flex:1 1 200px">${
      pid ? `<input type="hidden" name="product" value="${pid}">` : ''}<button type="submit">Search</button></form>`;
    const words = find.toLowerCase().split(/\s+/).filter(Boolean);
    const hit = (s) => words.every((w) => s.toLowerCase().includes(w));
    res.set('Cache-Control', 'no-store');
    try {
      const list = await products();
      if (pid) {
        const p = list.find((x) => x.id === pid);
        if (!G.configured(env)) return res.send(adminPage('Gooten', `${head}<div class="warn">Gooten is not set up: the server needs GOOTEN_RECIPE_ID and GOOTEN_PARTNER_BILLING_KEY.</div>`, 'gooten'));
        const all = G.variantRows(await api().variants(pid)).filter((v) => hit(`${v.sku} ${v.options}`));
        return res.send(adminPage('Gooten', `${head}<p><a href="/admin/gooten">All products</a></p>${search}
          <div class="card"><h2 class="card-title">${esc(p ? p.name : `Product ${pid}`)}</h2>
          <p class="muted">${all.length} option${all.length === 1 ? '' : 's'}${all.length > 200 ? ', first 200 shown: search to narrow it' : ''}. Cost is Gooten’s price to the shop, before shipping (from ${esc(p ? p.ship : '—')}).</p>
          <div style="overflow-x:auto"><table style="width:100%"><thead><tr><th align="left">SKU</th><th align="left">Options</th><th align="left">Cost</th><th align="left">Artwork sides</th></tr></thead><tbody>${
            all.slice(0, 200).map((v) => `<tr><td style="padding:6px"><code>${esc(v.sku)}</code></td><td style="padding:6px">${esc(v.options)}</td><td style="padding:6px">${v.cost != null ? money(v.cost) : 'not given'}</td><td style="padding:6px">${v.images || ''}</td></tr>`).join('')}</tbody></table></div></div>`, 'gooten'));
      }
      const shown = list.filter((p) => hit(`${p.name} ${p.groups.join(' ')}`));
      return res.send(adminPage('Gooten', `${head}${search}<div class="card"><p class="muted">${shown.length} products. Open one for its SKUs and exact costs.</p>
        <div style="overflow-x:auto"><table style="width:100%"><thead><tr><th align="left">Product</th><th align="left">Kind</th><th align="left">Costs from</th><th align="left">Ships from</th></tr></thead><tbody>${
          shown.map((p) => `<tr><td style="padding:6px"><a href="/admin/gooten?product=${p.id}">${esc(p.name)}</a>${p.out ? ' <span class="muted">(out of stock)</span>' : ''}</td><td style="padding:6px">${esc(p.groups.join(', '))}</td><td style="padding:6px">${esc(p.cost)}</td><td style="padding:6px">${esc(p.ship)}</td></tr>`).join('')}</tbody></table></div></div>`, 'gooten'));
    } catch (e) {
      console.error('gooten page:', e.message);
      return res.status(502).send(adminPage('Gooten', `${head}<div class="warn">${e instanceof G.GootenError ? esc(e.message) : 'Gooten’s catalog could not be loaded.'} Try again in a minute.</div>`, 'gooten'));
    }
  });

  return { card, sweep, alerts };
}

module.exports = { ensureTables, refusal, sameAddress, registerGooten };
