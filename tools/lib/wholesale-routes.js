'use strict';

/* Wholesale connector, v1: the I/O half. Mounted from server.js with the
 * helpers it already has (mount), plus a sweep that runs every two minutes
 * (sweep). The pure rules are in ./wholesale.js; the contract is
 * docs/wholesale-api-v1.md.
 *
 * Every partner route: switch on? -> key -> partner active -> rate limit ->
 * validation -> query scoped to that partner. A request id belonging to another
 * partner answers 404, exactly like one that does not exist.
 */

const W = require('./wholesale');

const ENDED = ['delivered', 'cancelled', 'declined'];
const MAX_BODY = 256 * 1024;

/* ── Tables ─────────────────────────────────────────────────────────────── */
async function ensureTables(pool) {
  /* A business allowed to send production requests. Only a hash of its key is
     kept; business_id optionally ties it to a Business Partner on the designer
     (jt_businesses.id), whose program rules still apply on the quote page. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wholesale_partners (
      id            SERIAL PRIMARY KEY,
      name          TEXT NOT NULL,
      contact_email TEXT,
      business_id   INTEGER,
      key_prefix    TEXT NOT NULL UNIQUE,
      key_hash      TEXT NOT NULL,
      webhook_url   TEXT,
      status        TEXT NOT NULL DEFAULT 'active',
      last_used_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  /* One production request. The quote it becomes is linked by the shop
     (quote_code); status_cache is the last status announced, so the sweep can
     tell what changed. idempotency and external_ref are unique per partner. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wholesale_requests (
      id                  BIGSERIAL PRIMARY KEY,
      public_id           TEXT NOT NULL UNIQUE,
      partner_id          INTEGER NOT NULL,
      external_ref        TEXT NOT NULL,
      idempotency_key     TEXT NOT NULL,
      body_hash           TEXT NOT NULL,
      payload             JSONB NOT NULL,
      artwork             JSONB NOT NULL DEFAULT '[]'::jsonb,
      quote_code          TEXT,
      status_cache        TEXT NOT NULL DEFAULT 'requested',
      authorized_revision INTEGER,
      authorized_at       TIMESTAMPTZ,
      declined_at         TIMESTAMPTZ,
      decline_reason      TEXT,
      cancelled_at        TIMESTAMPTZ,
      cancel_reason       TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (partner_id, idempotency_key),
      UNIQUE (partner_id, external_ref)
    )`);
  /* The quote revision last announced, so a re-priced quote is announced
     (quote.revised) even when its status does not change. */
  await pool.query(`ALTER TABLE wholesale_requests ADD COLUMN IF NOT EXISTS quote_revision_cache INTEGER`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS wholesale_requests_quote ON wholesale_requests (quote_code) WHERE quote_code IS NOT NULL`);
  await pool.query(`CREATE INDEX IF NOT EXISTS wholesale_requests_open ON wholesale_requests (status_cache, updated_at)`);
  /* Every change, who made it, before and after. Append-only; it is also the
     pull feed a partner reads to catch up on missed webhooks. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wholesale_events (
      id            BIGSERIAL PRIMARY KEY,
      public_id     TEXT NOT NULL UNIQUE,
      partner_id    INTEGER NOT NULL,
      request_id    BIGINT,
      type          TEXT NOT NULL,
      actor         TEXT NOT NULL,
      before_status TEXT,
      after_status  TEXT,
      data          JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS wholesale_events_partner ON wholesale_events (partner_id, id)`);
  /* The webhook outbox: one row per event per partner with a webhook URL. */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wholesale_deliveries (
      id            BIGSERIAL PRIMARY KEY,
      event_id      BIGINT NOT NULL UNIQUE,
      partner_id    INTEGER NOT NULL,
      attempts      INTEGER NOT NULL DEFAULT 0,
      next_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered_at  TIMESTAMPTZ,
      gave_up_at    TIMESTAMPTZ,
      last_status   INTEGER,
      last_error    TEXT
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS wholesale_deliveries_due ON wholesale_deliveries (next_at) WHERE delivered_at IS NULL AND gave_up_at IS NULL`);
}

/* ── Shared pieces ──────────────────────────────────────────────────────── */
function makeLimiter(perMinute) {
  const hits = new Map();
  return (key) => {
    const cut = Date.now() - 60e3;
    const recent = (hits.get(key) || []).filter((t) => t > cut);
    if (recent.length >= perMinute) { hits.set(key, recent); return false; }
    recent.push(Date.now());
    hits.set(key, recent);
    if (hits.size > 5000) for (const k of hits.keys()) { hits.delete(k); if (hits.size < 2500) break; }
    return true;
  };
}

function send(res, status, body) {
  res.set('Cache-Control', 'no-store');
  res.set('X-JT-Api-Version', W.API_VERSION);
  return res.status(status).json(body);
}

/** An event, its webhook row when the partner has a URL, in one transaction. */
async function recordEvent(client, { partnerId, requestId, type, actor, before = null, after = null, data = null }) {
  /* One writer at a time per partner, held to COMMIT, so a partner's event ids
     are handed out in commit order. Without it an event given id 100 could
     commit after id 101, and a reader already past 101 (GET /events?after=)
     would never see it. */
  await client.query('SELECT pg_advisory_xact_lock(7301, $1)', [partnerId]);
  const id = W.publicId('evt');
  const { rows: [ev] } = await client.query(
    `INSERT INTO wholesale_events (public_id, partner_id, request_id, type, actor, before_status, after_status, data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, public_id, created_at`,
    [id, partnerId, requestId, type, String(actor).slice(0, 60), before, after, data ? JSON.stringify(data) : null]);
  await client.query(
    `INSERT INTO wholesale_deliveries (event_id, partner_id)
     SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM wholesale_partners WHERE id = $2 AND webhook_url IS NOT NULL)
     ON CONFLICT (event_id) DO NOTHING`, [ev.id, partnerId]);
  return ev;
}

async function inTx(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
}

function mount(app, deps) {
  const { pool, quoteTotals, publicBase, alertShop, reportError, requireAdmin, isOwner,
          adminPage, esc, fmtDate, logActivity, actor, clientIp, quoteCodeRe, lineFigures = null,
          cancelQuote, env = process.env } = deps;
  const perPartner = makeLimiter(Number(env.JT_WHOLESALE_RATE_PER_MIN) || 120);
  const perIpBadKey = makeLimiter(20);
  const quoteUrl = (code) => `${publicBase}/q/${encodeURIComponent(code)}`;

  async function loadQuote(code, db = pool) {
    if (!code) return null;
    const { rows } = await db.query('SELECT * FROM quotes WHERE code = $1', [code]);
    return rows[0] || null;
  }

  const requestView = (r, q) => W.requestView(r, q, q ? quoteTotals(q) : null, q ? quoteUrl(q.code) : null, lineFigures);

  /* ── Auth for every /api/wholesale/v1 route ─────────────────────────── */
  async function partnerAuth(req, res, next) {
    if (!W.on(env)) return send(res, 404, W.err('not_found', 'Not found.'));
    const len = Number(req.get('content-length') || 0);
    if (len > MAX_BODY) return send(res, 413, W.err('body_too_large', 'Request body over 256 KB.'));
    const m = /^Bearer\s+(\S{1,200})$/.exec(String(req.get('authorization') || ''));
    const key = m ? m[1] : '';
    const prefix = W.keyPrefix(key);
    const ip = clientIp(req);
    const refuse = () => {
      if (!perIpBadKey(ip)) return send(res, 429, W.err('rate_limited', 'Too many refused keys. Wait a minute.'));
      return send(res, 401, W.err('unauthorized', 'A valid API key is required.'));
    };
    if (!prefix) return refuse();
    try {
      const { rows } = await pool.query('SELECT * FROM wholesale_partners WHERE key_prefix = $1', [prefix]);
      const p = rows[0];
      if (!p || !W.keyMatches(key, p.key_hash)) return refuse();
      if (p.status !== 'active') return send(res, 403, W.err('partner_suspended', 'This connection is switched off. Contact June\'s Tees.'));
      if (!perPartner(p.id)) { res.set('Retry-After', '60'); return send(res, 429, W.err('rate_limited', 'Over the request limit. Retry after a minute.')); }
      req.partner = p;
      pool.query('UPDATE wholesale_partners SET last_used_at = NOW() WHERE id = $1', [p.id]).catch(() => {});
      next();
    } catch (e) {
      reportError('wholesale-auth', e).catch(() => {});
      send(res, 500, W.err('server_error', 'Something went wrong. Retry later.'));
    }
  }

  async function ownRequest(req) {
    const id = String(req.params.id || '');
    if (!/^wr_[0-9a-f]{20}$/.test(id)) return null;
    const { rows } = await pool.query('SELECT * FROM wholesale_requests WHERE public_id = $1 AND partner_id = $2', [id, req.partner.id]);
    return rows[0] || null;
  }

  const fail = (res, where) => (e) => {
    reportError(`wholesale-${where}`, e).catch(() => {});
    send(res, 500, W.err('server_error', 'Something went wrong. Nothing was changed; retry later.'));
  };

  const base = '/api/wholesale/v1';

  app.get(`${base}/me`, partnerAuth, (req, res) => send(res, 200, {
    partner: { id: `wp_${req.partner.id}`, name: req.partner.name, webhooks: !!req.partner.webhook_url },
    api_version: W.API_VERSION, statuses: W.STATUSES,
  }));

  /* Create a production request. Idempotency-Key is required. */
  app.post(`${base}/requests`, partnerAuth, async (req, res) => {
    const idem = W.idempotencyKey(req.get('idempotency-key'));
    if (!idem) return send(res, 400, W.err('idempotency_key_required', 'Send an Idempotency-Key header (8-100 of A-Z a-z 0-9 . _ : -).'));
    const parsed = W.parseRequest(req.body);
    if (parsed.error) return send(res, 422, parsed);
    const v = parsed.value;
    const hash = W.bodyHash(v);
    const pid = req.partner.id;
    try {
      const prior = await pool.query(
        'SELECT * FROM wholesale_requests WHERE partner_id = $1 AND (idempotency_key = $2 OR external_ref = $3)', [pid, idem, v.external_ref]);
      for (const r of prior.rows) {
        if (r.idempotency_key === idem) {
          if (r.body_hash !== hash) return send(res, 409, W.err('idempotency_conflict', 'This Idempotency-Key was used with a different body.'));
          return send(res, 200, { request: requestView(r, await loadQuote(r.quote_code)), replayed: true });
        }
        return send(res, 409, W.err('duplicate_external_ref', `A request with external_ref ${v.external_ref} already exists: ${r.public_id}.`, 'external_ref'));
      }
      const row = await inTx(pool, async (c) => {
        const { rows: [r] } = await c.query(
          `INSERT INTO wholesale_requests (public_id, partner_id, external_ref, idempotency_key, body_hash, payload, artwork)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT DO NOTHING RETURNING *`,
          [W.publicId('wr'), pid, v.external_ref, idem, hash, JSON.stringify(v),
           JSON.stringify(v.lines.flatMap((l, ix) => l.artwork_urls.map((url) => ({ version: 1, url, name: null, note: null, line: ix, submitted_at: new Date().toISOString() }))))]);
        if (!r) return null;   // a concurrent twin won the race
        await recordEvent(c, { partnerId: pid, requestId: r.id, type: 'request.created', actor: `partner:${pid}`, after: 'requested' });
        return r;
      });
      if (!row) {
        const { rows: [r] } = await pool.query('SELECT * FROM wholesale_requests WHERE partner_id = $1 AND idempotency_key = $2', [pid, idem]);
        if (r && r.body_hash === hash) return send(res, 200, { request: requestView(r, null), replayed: true });
        return send(res, 409, W.err('conflict', 'A matching request was created at the same moment. Fetch it with GET /requests.'));
      }
      alertShop(`Wholesale request from ${req.partner.name}: ${v.lines.reduce((a, l) => a + l.qty, 0)} pieces`,
        `<p><b>${esc(req.partner.name)}</b> sent production request <b>${esc(row.public_id)}</b> (their ref ${esc(v.external_ref)}).</p>
         <p>Build the quote as usual, then link it on <a href="${publicBase}/admin/wholesale">Wholesale</a>.</p>`).catch(() => {});
      send(res, 201, { request: requestView(row, null) });
    } catch (e) { fail(res, 'create')(e); }
  });

  /* List, OLDEST change first, with a cursor: the reconciliation read. Page
     with next_cursor until it is null; nothing that changed is skipped, even
     when many requests share one updated_at. */
  app.get(`${base}/requests`, partnerAuth, async (req, res) => {
    const since = req.query.updated_since ? new Date(String(req.query.updated_since).slice(0, 40)) : null;
    if (since && !Number.isFinite(since.getTime())) return send(res, 422, W.err('invalid_field', 'updated_since: an ISO date', 'updated_since'));
    let after = null;
    if (req.query.cursor) {
      const m = /^([0-9T:.+\- ]{10,40})\|(\d{1,18})$/.exec(Buffer.from(String(req.query.cursor).slice(0, 120), 'base64url').toString());
      if (!m || !Number.isFinite(Date.parse(m[1]))) return send(res, 422, W.err('invalid_field', 'cursor: pass next_cursor back unchanged', 'cursor'));
      after = { at: m[1], id: m[2] };
    }
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    try {
      const { rows } = await pool.query(
        `SELECT *, updated_at::text AS updated_at_text FROM wholesale_requests
          WHERE partner_id = $1 AND ($2::timestamptz IS NULL OR updated_at > $2::timestamptz)
            AND ($3::timestamptz IS NULL OR (updated_at, id) > ($3::timestamptz, $4::bigint))
          ORDER BY updated_at, id LIMIT $5`,
        [req.partner.id, since ? since.toISOString() : null, after ? after.at : null, after ? after.id : null, limit]);
      const codes = rows.map((r) => r.quote_code).filter(Boolean);
      const quotes = new Map();
      if (codes.length) {
        const { rows: qs } = await pool.query('SELECT * FROM quotes WHERE code = ANY($1::text[])', [codes]);
        for (const q of qs) quotes.set(q.code, q);
      }
      const last = rows[rows.length - 1];
      send(res, 200, {
        requests: rows.map((r) => { const { updated_at_text, ...row } = r; return requestView(row, quotes.get(r.quote_code) || null); }),
        next_cursor: rows.length === limit ? Buffer.from(`${last.updated_at_text}|${last.id}`).toString('base64url') : null,
      });
    } catch (e) { fail(res, 'list')(e); }
  });

  app.get(`${base}/requests/:id`, partnerAuth, async (req, res) => {
    try {
      const r = await ownRequest(req);
      if (!r) return send(res, 404, W.err('not_found', 'No such request.'));
      send(res, 200, { request: requestView(r, await loadQuote(r.quote_code)) });
    } catch (e) { fail(res, 'get')(e); }
  });

  /* The business owner has looked at THIS revision and wants it made. It does
     not accept or pay: that happens on the quote page, whose url comes back. */
  app.post(`${base}/requests/:id/authorize`, partnerAuth, async (req, res) => {
    const rev = req.body && req.body.revision;
    if (!Number.isInteger(rev) || rev < 1) return send(res, 422, W.err('invalid_field', 'revision: the quote revision you reviewed', 'revision'));
    try {
      const out = await inTx(pool, async (c) => {
        const { rows: [r] } = await c.query('SELECT * FROM wholesale_requests WHERE public_id = $1 AND partner_id = $2 FOR UPDATE',
          [String(req.params.id || ''), req.partner.id]);
        if (!r) return [404, W.err('not_found', 'No such request.')];
        const q = await loadQuote(r.quote_code, c);
        const status = W.statusOf(r, q);
        if (!['quoted', 'awaiting_payment'].includes(status)) return [409, W.err('not_authorizable', `A request that is ${status} cannot be authorized.`)];
        const current = Number(q.revision) || 1;
        if (rev !== current) return [409, W.err('revision_mismatch', `The quote is at revision ${current}; review it again.`, 'revision')];
        if (r.authorized_revision === rev) return [200, null];
        await c.query('UPDATE wholesale_requests SET authorized_revision = $2, authorized_at = NOW(), updated_at = NOW() WHERE id = $1', [r.id, rev]);
        await recordEvent(c, { partnerId: req.partner.id, requestId: r.id, type: 'request.authorized', actor: `partner:${req.partner.id}`, before: status, after: status, data: { revision: rev } });
        return [200, null];
      });
      if (out[0] !== 200) return send(res, out[0], out[1]);
      const r = await ownRequest(req);
      const view = requestView(r, await loadQuote(r.quote_code));
      send(res, 200, { request: view, next: { action: 'accept_and_pay', url: view.quote && view.quote.url } });
    } catch (e) { fail(res, 'authorize')(e); }
  });

  /* Cancel before any money has moved. After that it is a conversation. */
  app.post(`${base}/requests/:id/cancel`, partnerAuth, async (req, res) => {
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500) || null;
    try {
      const out = await inTx(pool, async (c) => {
        const { rows: [r] } = await c.query('SELECT * FROM wholesale_requests WHERE public_id = $1 AND partner_id = $2 FOR UPDATE',
          [String(req.params.id || ''), req.partner.id]);
        if (!r) return [404, W.err('not_found', 'No such request.')];
        const q = await loadQuote(r.quote_code, c);
        const status = W.statusOf(r, q);
        if (status === 'cancelled') return [200, r];
        if (q && Number(q.paid_amount || 0) > 0) return [409, W.err('payment_received', 'Money has been paid on this job. Contact June\'s Tees to cancel it.')];
        if (ENDED.includes(status)) return [409, W.err('not_cancellable', `A request that is ${status} cannot be cancelled.`)];
        await c.query('UPDATE wholesale_requests SET cancelled_at = NOW(), cancel_reason = $2, status_cache = $3, updated_at = NOW() WHERE id = $1', [r.id, reason, 'cancelled']);
        await recordEvent(c, { partnerId: req.partner.id, requestId: r.id, type: 'request.status_changed', actor: `partner:${req.partner.id}`, before: status, after: 'cancelled', data: { reason } });
        return [200, { ...r, quote_code: r.quote_code }];
      });
      if (out[0] !== 200) return send(res, out[0], out[1]);
      const r = await ownRequest(req);
      if (r.quote_code) {
        /* The linked quote is cancelled too, the same way the job page does
           it: no reminder chases it, its card page is closed, and it lands on
           the owner's follow-up list. If that fails the shop is told to do it
           by hand, because an open quote could still be paid. */
        let closed = false;
        try { closed = !!(await cancelQuote(r.quote_code, `Wholesale request cancelled by ${req.partner.name}${reason ? `: ${reason}` : ''}`, req.partner.name)); }
        catch (e) { reportError('wholesale-cancel-quote', e, r.quote_code).catch(() => {}); }
        alertShop(`Wholesale request cancelled: quote ${r.quote_code}`,
          `<p><b>${esc(req.partner.name)}</b> cancelled request ${esc(r.public_id)}${reason ? `: ${esc(reason)}` : ''}. Nothing had been paid.</p>
           ${closed ? `<p>Quote <b>${esc(r.quote_code)}</b> was cancelled with it.</p>`
             : `<p><b>Quote ${esc(r.quote_code)} could not be cancelled automatically.</b> Cancel it on its job page so it cannot be paid or chased.</p>`}`).catch(() => {});
      }
      send(res, 200, { request: requestView(r, await loadQuote(r.quote_code)) });
    } catch (e) { fail(res, 'cancel')(e); }
  });

  /* Artwork: each submission is a new version; nothing is ever replaced. A
     change after the proof was approved is flagged to the shop, because the
     job may already be on the press. */
  app.post(`${base}/requests/:id/artwork`, partnerAuth, async (req, res) => {
    const parsed = W.parseArtwork(req.body);
    if (parsed.error) return send(res, 422, parsed);
    const a = parsed.value;
    try {
      const out = await inTx(pool, async (c) => {
        const { rows: [r] } = await c.query('SELECT * FROM wholesale_requests WHERE public_id = $1 AND partner_id = $2 FOR UPDATE',
          [String(req.params.id || ''), req.partner.id]);
        if (!r) return [404, W.err('not_found', 'No such request.')];
        const q = await loadQuote(r.quote_code, c);
        const status = W.statusOf(r, q);
        if (ENDED.includes(status) || status === 'shipped') return [409, W.err('artwork_closed', `Artwork cannot change on a request that is ${status}.`)];
        const lineCount = ((r.payload || {}).lines || []).length;
        if (a.line !== null && a.line >= lineCount) return [422, W.err('invalid_field', `line: 0-${lineCount - 1} on this request`, 'line')];
        const list = Array.isArray(r.artwork) ? r.artwork : [];
        if (list.length >= 50) return [409, W.err('artwork_limit', 'This request already has 50 artwork versions.')];
        const version = list.filter((x) => (x.line ?? null) === a.line).length + 1;
        const afterApproval = !!(q && q.proof_ok_at);
        const entry = { version, ...a, submitted_at: new Date().toISOString(), after_approval: afterApproval };
        await c.query('UPDATE wholesale_requests SET artwork = artwork || $2::jsonb, updated_at = NOW() WHERE id = $1', [r.id, JSON.stringify([entry])]);
        await recordEvent(c, { partnerId: req.partner.id, requestId: r.id, type: afterApproval ? 'artwork.changed_after_approval' : 'artwork.submitted',
          actor: `partner:${req.partner.id}`, before: status, after: status, data: { version, line: a.line } });
        return [201, { r, afterApproval }];
      });
      if (out[0] !== 201) return send(res, out[0], out[1]);
      const { r, afterApproval } = out[1];
      if (r.quote_code) {
        alertShop(`${afterApproval ? 'ARTWORK CHANGED AFTER APPROVAL' : 'New artwork'}: quote ${r.quote_code}`,
          `<p><b>${esc(req.partner.name)}</b> sent artwork for request ${esc(r.public_id)}: <a href="${esc(a.url)}">${esc(a.name || a.url)}</a>.</p>
           ${afterApproval ? '<p><b>The proof was already approved.</b> Check before anything more is printed; a new proof is needed.</p>' : ''}`).catch(() => {});
      }
      const fresh = await ownRequest(req);
      send(res, 201, { request: requestView(fresh, await loadQuote(fresh.quote_code)) });
    } catch (e) { fail(res, 'artwork')(e); }
  });

  /* Every event for this partner after `after` (an event id), oldest first. */
  app.get(`${base}/events`, partnerAuth, async (req, res) => {
    const after = String(req.query.after || '');
    if (after && !/^evt_[0-9a-f]{20}$/.test(after)) return send(res, 422, W.err('invalid_field', 'after: an event id', 'after'));
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));
    try {
      const { rows } = await pool.query(
        `SELECT e.public_id, e.type, e.before_status, e.after_status, e.data, e.created_at, r.public_id AS request_id
           FROM wholesale_events e LEFT JOIN wholesale_requests r ON r.id = e.request_id
          WHERE e.partner_id = $1
            AND e.id > COALESCE((SELECT id FROM wholesale_events WHERE public_id = $2 AND partner_id = $1), 0)
          ORDER BY e.id LIMIT $3`, [req.partner.id, after || null, limit]);
      send(res, 200, { events: rows.map(eventView) });
    } catch (e) { fail(res, 'events')(e); }
  });

  /* ── Admin: /admin/wholesale (owner only) ─────────────────────────────── */
  app.get('/admin/wholesale', requireAdmin, async (req, res) => {
    if (!isOwner()) return res.redirect('/admin/dashboard');
    try {
      const [{ rows: partners }, { rows: reqs }, { rows: stuck }] = await Promise.all([
        pool.query('SELECT * FROM wholesale_partners ORDER BY created_at DESC'),
        pool.query(`SELECT r.*, p.name AS partner_name FROM wholesale_requests r JOIN wholesale_partners p ON p.id = r.partner_id
                     ORDER BY (r.status_cache IN ('delivered','cancelled','declined')), r.updated_at DESC LIMIT 200`),
        pool.query('SELECT COUNT(*)::int AS n FROM wholesale_deliveries WHERE gave_up_at IS NOT NULL AND delivered_at IS NULL'),
      ]);
      const msg = String(req.query.msg || ''), err = String(req.query.err || '');
      const pRows = partners.map((p) => `<tr style="border-top:1px solid #eef1f8">
        <td style="padding:8px 6px"><b>${esc(p.name)}</b><div class="muted" style="font-size:12.5px">${esc(p.contact_email || '')}${p.business_id ? ` &middot; Business Partner #${p.business_id}` : ''}</div></td>
        <td style="padding:8px 6px;font-size:13px">${p.webhook_url ? esc(p.webhook_url) : '<span class="muted">pull only</span>'}</td>
        <td style="padding:8px 6px;font-size:13px">${p.last_used_at ? fmtDate(p.last_used_at) : '<span class="muted">never</span>'}</td>
        <td style="padding:8px 6px;text-align:right"><form method="POST" action="/admin/wholesale/partner">
          <input type="hidden" name="id" value="${p.id}"><input type="hidden" name="action" value="${p.status === 'active' ? 'suspend' : 'activate'}">
          <button class="btn btn-ghost" style="padding:4px 10px;font-size:12.5px">${p.status === 'active' ? 'Switch off' : 'Switch on'}</button></form></td></tr>`).join('');
      const rRows = reqs.map((r) => {
        const pieces = ((r.payload || {}).lines || []).reduce((a, l) => a + (Number(l.qty) || 0), 0);
        const open = !['delivered', 'cancelled', 'declined'].includes(r.status_cache);
        return `<tr style="border-top:1px solid #eef1f8">
          <td style="padding:8px 6px"><b>${esc(r.partner_name)}</b><div class="muted" style="font-size:12.5px">${esc(r.public_id)} &middot; their ref ${esc(r.external_ref)}</div>
            <div style="font-size:12.5px">${((r.payload || {}).lines || []).map((l) => `${l.qty} &times; ${esc(l.product)}${l.colour ? ` (${esc(l.colour)})` : ''}`).join('<br>')}</div></td>
          <td style="padding:8px 6px;font-size:13px">${pieces} pcs<div class="muted">${fmtDate(r.created_at)}</div></td>
          <td style="padding:8px 6px;font-size:13px"><b>${esc(r.status_cache)}</b>${r.authorized_revision ? `<div class="muted">authorized rev ${r.authorized_revision}</div>` : ''}</td>
          <td style="padding:8px 6px;font-size:13px">${r.quote_code ? `<a href="/admin/quote/${encodeURIComponent(r.quote_code)}" style="color:#1848B8">${esc(r.quote_code)}</a>` : open ? `
            <form method="POST" action="/admin/wholesale/link" style="display:flex;gap:4px"><input type="hidden" name="id" value="${esc(r.public_id)}">
              <input name="code" placeholder="Quote code" maxlength="10" style="width:110px"><button class="btn" style="padding:4px 10px;font-size:12.5px">Link</button></form>
            <form method="POST" action="/admin/wholesale/decline" style="margin-top:4px" onsubmit="var n=prompt('Why? (the business sees this)');if(n===null)return false;this.reason.value=n;return true;">
              <input type="hidden" name="id" value="${esc(r.public_id)}"><input type="hidden" name="reason" value="">
              <button class="btn btn-ghost" style="padding:2px 8px;font-size:12px">Decline</button></form>` : ''}</td></tr>`;
      }).join('');
      res.send(adminPage('Wholesale', `<h1>Wholesale</h1>
        <div class="sub">Production requests from businesses that sell their own brand. Build each quote as usual, then link it here; the business accepts and pays on the quote page. ${W.on(env) ? '' : '<b style="color:#b45309">The API is switched off (JT_WHOLESALE).</b>'}</div>
        ${stuck[0].n ? `<div class="card"><div class="warn">${stuck[0].n} status update(s) could not be delivered to a partner after three days of retries. They can still read them from the events feed.</div></div>` : ''}
        ${msg ? `<div class="card" style="color:#166534">${esc(msg)}</div>` : ''}
        ${err ? `<div class="card"><div class="warn">${esc(err)}</div></div>` : ''}
        <div class="card" style="overflow-x:auto"><h3 style="margin-top:0">Requests</h3>${reqs.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${rRows}</tbody></table>` : '<p class="muted">None yet.</p>'}</div>
        <div class="card" style="overflow-x:auto"><h3 style="margin-top:0">Connected businesses</h3>${partners.length ? `<table style="width:100%;border-collapse:collapse;font-size:14px"><tbody>${pRows}</tbody></table>` : '<p class="muted">None yet.</p>'}
          <form method="POST" action="/admin/wholesale/partner" style="margin-top:14px;display:grid;gap:6px;max-width:440px">
            <input type="hidden" name="action" value="create">
            <input name="name" placeholder="Business name" maxlength="120" required>
            <input name="contact_email" type="email" placeholder="Contact email" maxlength="254">
            <input name="business_id" inputmode="numeric" placeholder="Business Partner # (optional)" maxlength="9">
            <input name="webhook_url" placeholder="Webhook URL, https (optional)" maxlength="500">
            <button class="btn">Connect a business and make its key</button></form></div>`, 'wholesale'));
    } catch (e) {
      reportError('wholesale-admin', e).catch(() => {});
      res.status(500).send(adminPage('Wholesale', '<h1>Wholesale</h1><div class="card"><div class="warn">Could not load. Nothing has been lost; reload in a minute.</div></div>', 'wholesale'));
    }
  });

  const back = (res, kind, text) => res.redirect(`/admin/wholesale?${kind}=${encodeURIComponent(text)}`);

  app.post('/admin/wholesale/partner', requireAdmin, async (req, res) => {
    if (!isOwner()) return res.redirect('/admin/dashboard');
    const b = req.body || {};
    try {
      if (b.action === 'create') {
        const name = String(b.name || '').trim().slice(0, 120);
        if (!name) return back(res, 'err', 'A business name is needed.');
        const email = String(b.contact_email || '').trim().toLowerCase().slice(0, 254) || null;
        const bizId = /^\d{1,9}$/.test(String(b.business_id || '').trim()) ? parseInt(b.business_id, 10) : null;
        let hook = null;
        if (String(b.webhook_url || '').trim()) {
          hook = W.webhookUrl(b.webhook_url);
          if (!hook) return back(res, 'err', 'The webhook URL must be https on a public address.');
          if (!W.partnerSecret(env.JT_WHOLESALE_SECRET, 1)) return back(res, 'err', 'Webhooks need JT_WHOLESALE_SECRET (32+ characters) set on the server first.');
        }
        const { key, prefix } = W.newApiKey();
        const { rows: [p] } = await pool.query(
          `INSERT INTO wholesale_partners (name, contact_email, business_id, key_prefix, key_hash, webhook_url)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [name, email, bizId, prefix, W.hashKey(key), hook]);
        logActivity(actor(), 'wholesale partner created', { type: 'wholesale_partner', id: String(p.id) });
        /* The key is shown in THIS response, once. Never in a URL (history,
           proxy logs) and never stored: only its hash is. */
        res.set('Cache-Control', 'no-store');
        /* The webhook signing secret is derived, not stored, so it can be shown
           here; it is only shown here, beside the key, to the owner. */
        const hookSecret = hook ? W.partnerSecret(env.JT_WHOLESALE_SECRET, p.id) : null;
        return res.send(adminPage('Wholesale', `<h1>Connected ${esc(name)}</h1>
          <div class="card"><b>Their API key, shown once.</b> Send it to the business privately; it cannot be shown again.
          If it is lost, connect them again and switch the old one off.
          <pre style="user-select:all;white-space:pre-wrap;word-break:break-all">${esc(key)}</pre>
          ${hookSecret ? `<b>Webhook signing secret</b> (their system checks each update with it):
          <pre style="user-select:all;white-space:pre-wrap;word-break:break-all">${esc(hookSecret)}</pre>` : ''}
          <p><a href="/admin/wholesale" style="color:#1848B8">Back to Wholesale</a></p></div>`, 'wholesale'));
      }
      const id = parseInt(b.id, 10);
      if (!Number.isInteger(id) || !['suspend', 'activate'].includes(b.action)) return back(res, 'err', 'That did not work. Please try again.');
      await pool.query('UPDATE wholesale_partners SET status = $2 WHERE id = $1', [id, b.action === 'suspend' ? 'suspended' : 'active']);
      logActivity(actor(), `wholesale partner ${b.action}`, { type: 'wholesale_partner', id: String(id) });
      back(res, 'msg', b.action === 'suspend' ? 'Switched off.' : 'Switched on.');
    } catch (e) {
      reportError('wholesale-partner', e).catch(() => {});
      back(res, 'err', 'That did not save. Please try again.');
    }
  });

  app.post('/admin/wholesale/link', requireAdmin, async (req, res) => {
    if (!isOwner()) return res.redirect('/admin/dashboard');
    const id = String((req.body || {}).id || '');
    const code = String((req.body || {}).code || '').trim().toUpperCase();
    if (!/^wr_[0-9a-f]{20}$/.test(id) || !quoteCodeRe.test(code)) return back(res, 'err', 'Type the quote code exactly as it shows on the quote.');
    try {
      const out = await inTx(pool, async (c) => {
        const { rows: [r] } = await c.query('SELECT * FROM wholesale_requests WHERE public_id = $1 FOR UPDATE', [id]);
        if (!r) return 'No such request.';
        if (r.quote_code) return `Already linked to ${r.quote_code}.`;
        if (r.cancelled_at || r.declined_at) return 'That request is closed.';
        const q = await loadQuote(code, c);
        if (!q) return `There is no quote ${code}.`;
        const { rows: taken } = await c.query('SELECT public_id FROM wholesale_requests WHERE quote_code = $1', [code]);
        if (taken.length) return `Quote ${code} is already linked to ${taken[0].public_id}.`;
        await c.query('UPDATE wholesale_requests SET quote_code = $2, updated_at = NOW() WHERE id = $1', [r.id, code]);
        await recordEvent(c, { partnerId: r.partner_id, requestId: r.id, type: 'quote.linked', actor: `staff:${(actor() || {}).id || 'owner'}`, data: { quote: code } });
        return null;
      });
      if (out) return back(res, 'err', out);
      logActivity(actor(), 'wholesale quote linked', { type: 'quote', id: code }, { request: id });
      /* The partner hears when the quote is actually out (status sweep): a
         draft or held quote stays invisible to them. */
      sweep(deps).catch(() => {});
      back(res, 'msg', `Linked ${code}. The business sees it once the quote is sent.`);
    } catch (e) {
      reportError('wholesale-link', e).catch(() => {});
      back(res, 'err', 'That did not save. Please try again.');
    }
  });

  app.post('/admin/wholesale/decline', requireAdmin, async (req, res) => {
    if (!isOwner()) return res.redirect('/admin/dashboard');
    const id = String((req.body || {}).id || '');
    const reason = String((req.body || {}).reason || '').trim().slice(0, 500) || null;
    if (!/^wr_[0-9a-f]{20}$/.test(id)) return back(res, 'err', 'That did not work. Please try again.');
    try {
      const out = await inTx(pool, async (c) => {
        const { rows: [r] } = await c.query('SELECT * FROM wholesale_requests WHERE public_id = $1 FOR UPDATE', [id]);
        if (!r || r.quote_code || r.cancelled_at || r.declined_at) return 'Only an open request with no quote can be declined.';
        await c.query(`UPDATE wholesale_requests SET declined_at = NOW(), decline_reason = $2, status_cache = 'declined', updated_at = NOW() WHERE id = $1`, [r.id, reason]);
        await recordEvent(c, { partnerId: r.partner_id, requestId: r.id, type: 'request.status_changed', actor: `staff:${(actor() || {}).id || 'owner'}`, before: r.status_cache, after: 'declined', data: { reason } });
        return null;
      });
      if (out) return back(res, 'err', out);
      back(res, 'msg', 'Declined.');
    } catch (e) {
      reportError('wholesale-decline', e).catch(() => {});
      back(res, 'err', 'That did not save. Please try again.');
    }
  });
}

function eventView(e) {
  return {
    id: e.public_id, type: e.type, request_id: e.request_id || null,
    from_status: e.before_status || null, to_status: e.after_status || null,
    data: e.data || null, created_at: e.created_at,
  };
}

/* ── The sweep: every two minutes ─────────────────────────────────────────
   1. Reconcile: work out each open request's status (and its quote's
      revision) from the quote and payments; announce any change. Deriving it
      here, instead of hooking every place a quote changes (accept, the Stripe
      webhook, a manual payment, the job board's stage buttons, an edit), means
      no path can be missed. EVERY open request is read, in batches.
   2. Deliver due webhooks, with backoff; give up after the last try and say so.
   One sweep at a time in this process; deliveries are also CLAIMED in the
   database first, so two processes (or a run started by linking a quote)
   never send the same delivery twice. */
let sweeping = null;
function sweep(deps) {
  if (!sweeping) sweeping = runSweep(deps).finally(() => { sweeping = null; });
  return sweeping;
}

async function runSweep(deps) {
  const { pool, reportError, alertShop, esc = (x) => String(x), env = process.env, fetchImpl = fetch,
          resolvesPublic = W.resolvesPublic } = deps;
  if (!W.on(env)) return '';
  let changed = 0, revised = 0, delivered = 0, failed = 0;

  for (let lastId = 0; ;) {
    const { rows } = await pool.query(
      `SELECT r.*, row_to_json(q.*) AS q FROM wholesale_requests r LEFT JOIN quotes q ON q.code = r.quote_code
        WHERE r.status_cache NOT IN ('delivered','cancelled','declined') AND r.id > $1
        ORDER BY r.id LIMIT 200`, [lastId]);
    if (!rows.length) break;
    lastId = rows[rows.length - 1].id;
    for (const r of rows) {
      const status = W.statusOf(r, r.q);
      const rev = r.q && W.quoteVisible(r.q) ? Number(r.q.revision) || 1 : null;
      if (status === r.status_cache && rev === r.quote_revision_cache) continue;
      try {
        await inTx(pool, async (c) => {
          const { rowCount } = await c.query(
            `UPDATE wholesale_requests SET status_cache = $2, quote_revision_cache = $3, updated_at = NOW()
              WHERE id = $1 AND status_cache = $4 AND quote_revision_cache IS NOT DISTINCT FROM $5`,
            [r.id, status, rev, r.status_cache, r.quote_revision_cache]);
          if (!rowCount) return;   // another sweep got there first
          const data = r.q ? { quote: r.q.code, revision: rev } : null;
          if (status !== r.status_cache) {
            await recordEvent(c, { partnerId: r.partner_id, requestId: r.id, type: 'request.status_changed', actor: 'system',
              before: r.status_cache, after: status, data });
            changed++;
          }
          /* A re-priced quote: the business must look again before paying.
             The first revision a partner sees arrives with its status change. */
          if (rev !== null && r.quote_revision_cache !== null && rev !== r.quote_revision_cache) {
            await recordEvent(c, { partnerId: r.partner_id, requestId: r.id, type: 'quote.revised', actor: 'system',
              before: status, after: status,
              data: { ...data, previous_revision: r.quote_revision_cache,
                      reapproval_required: !!(r.authorized_revision && rev > r.authorized_revision) } });
            revised++;
          }
        });
      } catch (e) { reportError('wholesale-reconcile', e, r.public_id).catch(() => {}); }
    }
  }

  /* Claim up to 50 due deliveries for active partners that still have a URL
     (so a switched-off partner's backlog never blocks anyone else), by moving
     their next try 15 minutes out; a crash mid-send therefore retries later
     rather than never. */
  const { rows: claimed } = await pool.query(
    `UPDATE wholesale_deliveries SET next_at = NOW() + interval '15 minutes'
      WHERE id IN (
        SELECT d.id FROM wholesale_deliveries d JOIN wholesale_partners p ON p.id = d.partner_id
         WHERE d.delivered_at IS NULL AND d.gave_up_at IS NULL AND d.next_at <= NOW()
           AND p.status = 'active' AND p.webhook_url IS NOT NULL
         ORDER BY d.id LIMIT 50 FOR UPDATE OF d SKIP LOCKED)
      RETURNING id`);
  const due = claimed.length ? (await pool.query(
    `SELECT d.*, e.public_id AS event_public_id, e.type, e.before_status, e.after_status, e.data, e.created_at,
            p.webhook_url, p.name AS partner_name, r.public_id AS request_id
       FROM wholesale_deliveries d JOIN wholesale_events e ON e.id = d.event_id
       JOIN wholesale_partners p ON p.id = d.partner_id LEFT JOIN wholesale_requests r ON r.id = e.request_id
      WHERE d.id = ANY($1::bigint[]) ORDER BY d.id`, [claimed.map((x) => x.id)])).rows : [];
  for (const d of due) {
    const secret = W.partnerSecret(env.JT_WHOLESALE_SECRET, d.partner_id);
    if (!secret) {
      await pool.query('UPDATE wholesale_deliveries SET next_at = NOW() WHERE id = ANY($1::bigint[]) AND delivered_at IS NULL', [due.map((x) => x.id)]);
      reportError('wholesale-webhook', new Error('JT_WHOLESALE_SECRET is missing or under 32 characters; webhooks are held')).catch(() => {});
      break;
    }
    const body = JSON.stringify({ api_version: W.API_VERSION, event: eventView({ ...d, public_id: d.event_public_id }) });
    let status = 0, error = null;
    if (!(await resolvesPublic(d.webhook_url))) {
      error = 'webhook host does not resolve to a public address';
    } else {
      try {
        const r = await fetchImpl(d.webhook_url, {
          method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'JunesTees-Wholesale/1',
                     'X-JT-Event-Id': d.event_public_id, 'X-JT-Signature': W.signatureHeader(secret, body) },
          body,
        });
        status = r.status;
        if (status < 200 || status >= 300) error = `answered ${status}`;
      } catch (e) { error = String(e.message || e).slice(0, 200); }
    }
    if (!error) {
      await pool.query('UPDATE wholesale_deliveries SET delivered_at = NOW(), attempts = attempts + 1, last_status = $2, last_error = NULL WHERE id = $1', [d.id, status]);
      delivered++;
      continue;
    }
    failed++;
    const next = W.nextAttemptAt(d.attempts + 1);
    await pool.query(
      `UPDATE wholesale_deliveries SET attempts = attempts + 1, last_status = $2, last_error = $3,
              next_at = COALESCE($4, next_at), gave_up_at = CASE WHEN $4::timestamptz IS NULL THEN NOW() END WHERE id = $1`,
      [d.id, status || null, error, next ? next.toISOString() : null]);
    if (!next) {
      reportError('wholesale-webhook-gave-up', new Error(`${d.partner_name}: ${d.type} ${d.event_public_id} undelivered after ${d.attempts + 1} tries (${error})`)).catch(() => {});
      alertShop(`Wholesale update not delivered to ${d.partner_name}`,
        `<p>A status update (${esc(d.type)}, request ${esc(d.request_id || '')}) could not reach ${esc(d.partner_name)}'s system after three days of retries (${esc(error)}).</p>
         <p>Their system can still read it from the events feed. Let them know their webhook is down.</p>`).catch(() => {});
    }
  }
  const parts = [changed && `${changed} status change(s)`, revised && `${revised} quote revision(s)`,
                 delivered && `${delivered} webhook(s) delivered`, failed && `${failed} failed`].filter(Boolean);
  return parts.join(', ');
}

module.exports = { ensureTables, mount, sweep, eventView, MAX_BODY };
