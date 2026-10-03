'use strict';

/* Local delivery's tables, and every write to them.
 *
 * The rules live in ./delivery.js (pure, tested directly); this is the only
 * code that touches the delivery tables, so a booking is made, moved and freed
 * in exactly one way whichever checkout asked.
 *
 * Seats. Two buyers can press Pay on the last seat in the same second, so a
 * booking is made under a transaction-scoped advisory lock on its date and
 * window: the second waits, counts again, and finds the window full. Moving a
 * booking locks the window it is moving INTO. */

const D = require('./delivery');

const BOOKING_COLS = `id, ref, zone_id, zone_name, fee, to_char(date, 'YYYY-MM-DD') AS date, window_id,
  window_label, window_start, address, name, phone, email, status, hold_expires_at,
  to_char(ready_by, 'YYYY-MM-DD') AS ready_by, courier, history, notes, created_at, updated_at`;

/* studio:<order id>, quote:<code>, or cart:<hex> — a studio buyer's seat
   while they pay, before there is an order number (see /api/delivery/attach). */
const REF_RE = /^(studio:\d{1,10}|quote:[A-Z0-9]{4,16}|cart:[a-f0-9]{16,32})$/;

function createDeliveryStore(pool) {
  async function ensureSchema() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_zones (
        id       SERIAL PRIMARY KEY,
        name     TEXT NOT NULL,
        fee      NUMERIC(8,2) NOT NULL DEFAULT 0,
        zips     TEXT[] NOT NULL DEFAULT '{}',
        active   BOOLEAN NOT NULL DEFAULT TRUE,
        sort     INT NOT NULL DEFAULT 0
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_windows (
        id         SERIAL PRIMARY KEY,
        weekday    SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        start_time TEXT NOT NULL,
        end_time   TEXT NOT NULL,
        capacity   INT NOT NULL DEFAULT 4 CHECK (capacity >= 0),
        active     BOOLEAN NOT NULL DEFAULT TRUE
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_blackouts (
        date  DATE PRIMARY KEY,
        note  TEXT
      )`);
    /* key/value for the courier partner (and anything later that is one
       record, not a table): {name, email, phone, costs: {zoneId: dollars}}. */
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_settings (
        key    TEXT PRIMARY KEY,
        value  JSONB NOT NULL
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS delivery_bookings (
        id               SERIAL PRIMARY KEY,
        ref              TEXT NOT NULL,              -- studio:<order id> | quote:<code>
        zone_id          INT,
        zone_name        TEXT,
        fee              NUMERIC(8,2) NOT NULL DEFAULT 0,  -- what the customer pays
        date             DATE NOT NULL,
        window_id        INT NOT NULL,
        window_label     TEXT,                       -- as sold, kept if the window is edited later
        window_start     TEXT,
        address          JSONB,
        name             TEXT,
        phone            TEXT,
        email            TEXT,
        status           TEXT NOT NULL DEFAULT 'held',  -- held|confirmed|out|delivered|cancelled
        hold_expires_at  TIMESTAMPTZ,
        ready_by         DATE,                       -- when the job is promised ready
        token_hash       TEXT,                       -- the customer's reschedule link, hashed
        courier          JSONB,                      -- {partner, cost, sent_at, by}
        history          JSONB NOT NULL DEFAULT '[]',
        notes            TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
    // One live booking per order, however often checkout is retried.
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS delivery_bookings_ref_uq
                        ON delivery_bookings (ref) WHERE status <> 'cancelled'`);
    await pool.query(`CREATE INDEX IF NOT EXISTS delivery_bookings_slot_idx
                        ON delivery_bookings (date, window_id) WHERE status <> 'cancelled'`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS delivery_bookings_token_uq
                        ON delivery_bookings (token_hash) WHERE token_hash IS NOT NULL`);
  }

  async function loadConfig(db = pool) {
    const [z, w, b, s] = await Promise.all([
      db.query('SELECT id, name, fee::float AS fee, zips, active, sort FROM delivery_zones ORDER BY sort, id'),
      db.query('SELECT id, weekday, start_time, end_time, capacity, active FROM delivery_windows ORDER BY weekday, start_time, id'),
      db.query(`SELECT to_char(date, 'YYYY-MM-DD') AS date, note FROM delivery_blackouts
                 WHERE date >= CURRENT_DATE - 1 ORDER BY date`),
      db.query(`SELECT value FROM delivery_settings WHERE key = 'courier'`),
    ]);
    return { zones: z.rows, windows: w.rows, blackouts: b.rows, partner: s.rows[0] ? s.rows[0].value : null };
  }

  /** Bookings that can hold a seat from `fromYmd` on (cancelled ones never do). */
  async function seatBookings(fromYmd, db = pool) {
    const { rows } = await db.query(
      `SELECT id, to_char(date, 'YYYY-MM-DD') AS date, window_id, status, hold_expires_at
         FROM delivery_bookings WHERE status <> 'cancelled' AND date >= $1::date`, [fromYmd]);
    return rows;
  }

  /**
   * What a customer at `zip` can book: the zone, its fee and the open days.
   * `readyYmd` is when the job is promised ready. `exceptId` leaves a booking
   * out of the count (the one being moved, so its own seat is offered back).
   */
  async function options({ zip, readyYmd, now = new Date(), exceptId = null }) {
    const cfg = await loadConfig();
    if (!D.deliveryOffered(cfg.zones, cfg.windows)) return { offered: false, reason: 'off' };
    const zone = D.zoneForZip(cfg.zones, zip);
    if (!zone) return { offered: true, available: false, reason: 'zone' };
    const today = D.shopClock(now).ymd;
    const earliest = D.earliestDate(readyYmd, today);
    const bookings = await seatBookings(earliest);
    const days = D.availableSlots({ windows: cfg.windows, blackouts: cfg.blackouts, bookings, earliest,
      horizonDays: D.settings().horizonDays, now, exceptId });
    return { offered: true, available: days.length > 0, reason: days.length ? null : 'full',
      zone: { id: zone.id, name: zone.name }, fee: D.zoneFee(zone), earliest, days };
  }

  /** Whether delivery is set up at all (for showing the choice). */
  async function offered() {
    const cfg = await loadConfig();
    return D.deliveryOffered(cfg.zones, cfg.windows);
  }

  async function lockSlot(client, date, windowId) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`delivery:${date}|${windowId}`]);
  }

  /**
   * Book a seat for an order.
   *
   * `status` 'held' for a studio buyer about to pay (the seat is kept for
   * JT_DELIVERY_HOLD_MIN minutes, then given back unless payment confirms it);
   * 'confirmed' for a quote the customer has just accepted.
   *
   * An order already holding a live booking has it MOVED, not duplicated, so
   * retrying checkout cannot take two seats. Returns {ok, booking, token} or
   * {ok: false, reason}; `token` is the customer's reschedule link, shown once.
   */
  async function book({ ref, zip, date, windowId, address, name, phone, email, readyYmd,
    status = 'held', by = 'customer', now = new Date() }) {
    if (!REF_RE.test(String(ref || ''))) return { ok: false, reason: 'ref' };
    if (!['held', 'confirmed'].includes(status)) return { ok: false, reason: 'status' };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cfg = await loadConfig(client);
      if (!D.deliveryOffered(cfg.zones, cfg.windows)) { await client.query('ROLLBACK'); return { ok: false, reason: 'off' }; }
      const zone = D.zoneForZip(cfg.zones, zip);
      if (!zone) { await client.query('ROLLBACK'); return { ok: false, reason: 'zone' }; }
      if (!D.isYmd(date)) { await client.query('ROLLBACK'); return { ok: false, reason: 'date' }; }
      await lockSlot(client, date, Number(windowId));
      const { rows: mine } = await client.query(
        `SELECT id FROM delivery_bookings WHERE ref = $1 AND status <> 'cancelled' FOR UPDATE`, [ref]);
      const exceptId = mine[0] ? mine[0].id : null;
      const today = D.shopClock(now).ymd;
      const earliest = D.earliestDate(readyYmd, today);
      const bookings = await seatBookings(earliest, client);
      const chk = D.checkSlot({ windows: cfg.windows, blackouts: cfg.blackouts, bookings, earliest,
        horizonDays: D.settings().horizonDays, now, exceptId, date, windowId });
      if (!chk.ok) { await client.query('ROLLBACK'); return { ok: false, reason: chk.reason }; }

      const token = D.newToken();
      const holdUntil = status === 'held' ? new Date(now.getTime() + D.settings().holdMinutes * 60000) : null;
      const entry = D.historyEntry({ by, action: exceptId ? 'rebooked' : 'booked',
        to: D.bookingPhrase({ date, window_label: chk.label }), at: now });
      const vals = [ref, zone.id, zone.name, D.zoneFee(zone), date, Number(windowId), chk.label,
        String(chk.window.start_time), JSON.stringify(address || null),
        String(name || '').slice(0, 120) || null, String(phone || '').slice(0, 40) || null,
        String(email || '').slice(0, 200) || null, status, holdUntil,
        D.isYmd(readyYmd) ? readyYmd : null, D.hashToken(token), JSON.stringify([entry])];
      let rows;
      if (exceptId) {
        ({ rows } = await client.query(
          `UPDATE delivery_bookings SET ref=$1, zone_id=$2, zone_name=$3, fee=$4, date=$5, window_id=$6, window_label=$7,
                  window_start=$8, address=$9::jsonb, name=$10, phone=$11, email=$12, status=$13,
                  hold_expires_at=$14, ready_by=$15, token_hash=$16, history = history || $17::jsonb,
                  updated_at=NOW()
            WHERE id=$18 RETURNING ${BOOKING_COLS}`, [...vals, exceptId]));
      } else {
        ({ rows } = await client.query(
          `INSERT INTO delivery_bookings (ref, zone_id, zone_name, fee, date, window_id, window_label, window_start,
                  address, name, phone, email, status, hold_expires_at, ready_by, token_hash, history)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)
           RETURNING ${BOOKING_COLS}`, vals));
      }
      await client.query('COMMIT');
      return { ok: true, booking: rows[0], token };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /** Payment landed: the held seat is theirs. A paid order is NEVER refused
   *  for capacity — if its hold had lapsed and the window filled meanwhile,
   *  it is confirmed anyway and the board shows the window over. */
  async function confirm({ id, ref, by = 'payment' }) {
    const entry = D.historyEntry({ by, action: 'confirmed' });
    const { rows } = await pool.query(
      `UPDATE delivery_bookings SET status='confirmed', hold_expires_at=NULL, updated_at=NOW(),
              history = history || $3::jsonb
        WHERE status='held' AND (($1::int IS NOT NULL AND id=$1) OR ($2::text IS NOT NULL AND ref=$2))
        RETURNING ${BOOKING_COLS}`, [id || null, ref || null, JSON.stringify([entry])]);
    return rows[0] || null;
  }

  async function byId(id) {
    const { rows } = await pool.query(`SELECT ${BOOKING_COLS} FROM delivery_bookings WHERE id=$1`, [Number(id) || 0]);
    return rows[0] || null;
  }

  async function byRef(ref) {
    if (!REF_RE.test(String(ref || ''))) return null;
    const { rows } = await pool.query(
      `SELECT ${BOOKING_COLS} FROM delivery_bookings WHERE ref=$1 AND status <> 'cancelled'`, [ref]);
    return rows[0] || null;
  }

  async function byToken(token) {
    if (!D.tokenShapeOk(token)) return null;
    const { rows } = await pool.query(
      `SELECT ${BOOKING_COLS}, token_hash FROM delivery_bookings WHERE token_hash=$1`, [D.hashToken(token)]);
    const b = rows[0];
    // The index lookup found it by hash; compare once more without leaking timing.
    if (!b || !D.tokenMatches(token, b.token_hash)) return null;
    delete b.token_hash;
    return b;
  }

  /** A fresh reschedule link for a booking; the old one stops working. */
  async function newLink(id) {
    const token = D.newToken();
    await pool.query('UPDATE delivery_bookings SET token_hash=$2 WHERE id=$1', [id, D.hashToken(token)]);
    return token;
  }

  /**
   * Move a booking to another date and window.
   *
   * The customer may move it only into an open seat, and only before the
   * cutoff (checked by the caller with D.rescheduleAllowed). The shop may also
   * `force` it into a full window — they know their own van.
   */
  async function move({ id, date, windowId, by, note, force = false, shop = false, now = new Date() }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: cur } = await client.query(
        `SELECT ${BOOKING_COLS} FROM delivery_bookings WHERE id=$1 FOR UPDATE`, [Number(id) || 0]);
      const b = cur[0];
      if (!b || ['cancelled', 'delivered'].includes(b.status)) { await client.query('ROLLBACK'); return { ok: false, reason: 'gone' }; }
      if (!D.isYmd(date)) { await client.query('ROLLBACK'); return { ok: false, reason: 'date' }; }
      await lockSlot(client, date, Number(windowId));
      const cfg = await loadConfig(client);
      const today = D.shopClock(now).ymd;
      /* The shop can move a job earlier than its ready date (they can see it
         is done) — from tomorrow, or from today when forcing; the customer
         cannot. */
      const earliest = force ? today : shop ? D.earliestDate(null, today) : D.earliestDate(b.ready_by, today);
      const bookings = await seatBookings(earliest, client);
      let chk = D.checkSlot({ windows: cfg.windows, blackouts: cfg.blackouts, bookings, earliest,
        horizonDays: D.settings().horizonDays, now, exceptId: b.id, date, windowId });
      if (!chk.ok && force && ['full', 'closed', 'far'].includes(chk.reason)) {
        const w = cfg.windows.find((x) => Number(x.id) === Number(windowId) && Number(x.weekday) === D.weekdayOf(date));
        if (w) chk = { ok: true, window: w, label: D.windowLabel(w), forced: true };
      }
      if (!chk.ok) { await client.query('ROLLBACK'); return { ok: false, reason: chk.reason }; }
      const from = D.bookingPhrase(b);
      const to = D.bookingPhrase({ date, window_label: chk.label });
      const entry = D.historyEntry({ by, action: 'moved', from, to, note: (chk.forced ? '[over capacity] ' : '') + (note || ''), at: now });
      const { rows } = await client.query(
        `UPDATE delivery_bookings SET date=$2, window_id=$3, window_label=$4, window_start=$5,
                status = CASE WHEN status='out' THEN 'confirmed' ELSE status END,
                courier = NULL, history = history || $6::jsonb, updated_at=NOW()
          WHERE id=$1 RETURNING ${BOOKING_COLS}`,
        [b.id, date, Number(windowId), chk.label, String(chk.window.start_time), JSON.stringify([entry])]);
      await client.query('COMMIT');
      return { ok: true, booking: rows[0], from, to, forced: !!chk.forced };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const STATUS_FROM = {
    out: ['confirmed'],
    delivered: ['confirmed', 'out'],
    confirmed: ['out'],                 // "not out after all"
    cancelled: ['held', 'confirmed', 'out'],
  };

  async function setStatus({ id, status, by, note }) {
    const allowed = STATUS_FROM[status];
    if (!allowed) return null;
    const entry = D.historyEntry({ by, action: status, note });
    const { rows } = await pool.query(
      `UPDATE delivery_bookings SET status=$2, hold_expires_at=NULL, updated_at=NOW(), history = history || $4::jsonb
        WHERE id=$1 AND status = ANY($3::text[]) RETURNING ${BOOKING_COLS}`,
      [Number(id) || 0, status, allowed, JSON.stringify([entry])]);
    return rows[0] || null;
  }

  async function cancelRef(ref, by, note) {
    const b = await byRef(ref);
    if (!b) return null;
    return setStatus({ id: b.id, status: 'cancelled', by, note });
  }

  /** When the job is now promised ready (the shop moved its target). */
  async function setReadyBy(ref, readyYmd) {
    if (!REF_RE.test(String(ref || ''))) return;
    await pool.query(`UPDATE delivery_bookings SET ready_by=$2, updated_at=NOW()
                       WHERE ref=$1 AND status <> 'cancelled'`, [ref, D.isYmd(readyYmd) ? readyYmd : null]);
  }

  async function setCourier({ id, partner, cost, by }) {
    const c = { partner: String(partner || '').slice(0, 80), cost: cost == null ? null : D.money2(cost),
      sent_at: new Date().toISOString(), by: String(by || '').slice(0, 80) };
    const entry = D.historyEntry({ by, action: 'courier', to: c.partner, note: cost == null ? '' : `cost $${c.cost.toFixed(2)}` });
    const { rows } = await pool.query(
      `UPDATE delivery_bookings SET courier=$2::jsonb, history = history || $3::jsonb, updated_at=NOW()
        WHERE id=$1 AND status IN ('confirmed', 'out') RETURNING ${BOOKING_COLS}`,
      [Number(id) || 0, JSON.stringify(c), JSON.stringify([entry])]);
    return rows[0] || null;
  }

  /** Everything the board shows: live from yesterday on, plus the last 14 days done. */
  async function boardBookings() {
    const { rows } = await pool.query(
      `SELECT ${BOOKING_COLS} FROM delivery_bookings
        WHERE (status NOT IN ('cancelled', 'delivered') AND date >= CURRENT_DATE - 30)
           OR (updated_at >= NOW() - INTERVAL '14 days')
        ORDER BY date, window_start, id`);
    return rows;
  }

  async function bookingsOn(date, windowId = null) {
    const { rows } = await pool.query(
      `SELECT ${BOOKING_COLS} FROM delivery_bookings
        WHERE date=$1::date AND status IN ('confirmed', 'out') AND ($2::int IS NULL OR window_id=$2)
        ORDER BY window_start, id`, [date, windowId]);
    return rows;
  }

  /* ── Settings ──────────────────────────────────────────────────────────── */

  async function saveZone({ id, name, fee, zips, active, sort }) {
    const n = String(name || '').trim().slice(0, 60);
    const f = Number(fee);
    if (!n || !Number.isFinite(f) || f > 500) return { ok: false, reason: 'Give the zone a name and a fee of $500 or less.' };
    if (f < D.MIN_FEE) return { ok: false, reason: 'Local delivery is at least $20. Set the zone fee to $20 or more.' };
    const list = D.parseZipList(zips).slice(0, 400);
    if (!list.length) return { ok: false, reason: 'List at least one 5-digit ZIP code for the zone.' };
    const vals = [n, D.money2(f), list, active !== false, Number.isInteger(Number(sort)) ? Number(sort) : 0];
    if (id) {
      await pool.query('UPDATE delivery_zones SET name=$1, fee=$2, zips=$3, active=$4, sort=$5 WHERE id=$6', [...vals, Number(id)]);
    } else {
      await pool.query('INSERT INTO delivery_zones (name, fee, zips, active, sort) VALUES ($1,$2,$3,$4,$5)', vals);
    }
    return { ok: true };
  }

  async function deleteZone(id) {
    await pool.query('DELETE FROM delivery_zones WHERE id=$1', [Number(id) || 0]);
  }

  async function saveWindow({ id, weekday, start, end, capacity, active }) {
    const wd = Number(weekday);
    const a = D.toMinutes(start), b = D.toMinutes(end);
    const cap = Number(capacity);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) return { ok: false, reason: 'Pick a day of the week.' };
    if (a == null || b == null || b <= a) return { ok: false, reason: 'The window must end after it starts.' };
    if (!Number.isInteger(cap) || cap < 0 || cap > 100) return { ok: false, reason: 'Capacity is a whole number from 0 to 100.' };
    const vals = [wd, D.hhmm(a), D.hhmm(b), cap, active !== false];
    if (id) {
      await pool.query('UPDATE delivery_windows SET weekday=$1, start_time=$2, end_time=$3, capacity=$4, active=$5 WHERE id=$6', [...vals, Number(id)]);
    } else {
      await pool.query('INSERT INTO delivery_windows (weekday, start_time, end_time, capacity, active) VALUES ($1,$2,$3,$4,$5)', vals);
    }
    return { ok: true };
  }

  /* A window with bookings on it is switched off, not deleted: the bookings
     keep its label and start, and the board still groups them. */
  async function deleteWindow(id) {
    const { rows } = await pool.query(
      `SELECT 1 FROM delivery_bookings WHERE window_id=$1 AND status <> 'cancelled' AND date >= CURRENT_DATE LIMIT 1`, [Number(id) || 0]);
    if (rows.length) {
      await pool.query('UPDATE delivery_windows SET active=FALSE WHERE id=$1', [Number(id) || 0]);
      return { ok: true, deactivated: true };
    }
    await pool.query('DELETE FROM delivery_windows WHERE id=$1', [Number(id) || 0]);
    return { ok: true };
  }

  async function addBlackout(date, note) {
    if (!D.isYmd(date)) return { ok: false, reason: 'Pick a date.' };
    await pool.query(`INSERT INTO delivery_blackouts (date, note) VALUES ($1,$2)
                      ON CONFLICT (date) DO UPDATE SET note = EXCLUDED.note`, [date, String(note || '').slice(0, 120) || null]);
    return { ok: true };
  }

  async function removeBlackout(date) {
    if (!D.isYmd(date)) return;
    await pool.query('DELETE FROM delivery_blackouts WHERE date=$1', [date]);
  }

  async function savePartner({ name, email, phone, costs }) {
    const p = {
      name: String(name || '').trim().slice(0, 80),
      email: String(email || '').trim().slice(0, 200),
      phone: String(phone || '').trim().slice(0, 40),
      costs: {},
    };
    for (const [k, v] of Object.entries(costs || {})) {
      if (!/^\d{1,9}$/.test(k)) continue;
      const s = String(v == null ? '' : v).trim();
      if (s === '') continue;
      const n = Number(s);
      if (Number.isFinite(n) && n >= 0 && n <= 1000) p.costs[k] = D.money2(n);
    }
    if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) return { ok: false, reason: 'That dispatch email does not look right.' };
    await pool.query(`INSERT INTO delivery_settings (key, value) VALUES ('courier', $1::jsonb)
                      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [JSON.stringify(p)]);
    return { ok: true };
  }

  return {
    ensureSchema, loadConfig, options, offered, book, confirm, byId, byRef, byToken, newLink,
    move, setStatus, cancelRef, setReadyBy, setCourier, boardBookings, bookingsOn,
    saveZone, deleteZone, saveWindow, deleteWindow, addBlackout, removeBlackout, savePartner,
  };
}

module.exports = { createDeliveryStore, REF_RE };
