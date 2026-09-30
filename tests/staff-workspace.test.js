'use strict';

/* The staff workspace: helpers' logins, what each may do, what waits for the
 * owner, and the numbers the owner judges them by (tools/lib/staff.js,
 * tools/lib/team-metrics.js and the routes by /admin/staff in server.js).
 *
 * Until 2026-09-30 the back office had one password and no idea who used it.
 * Hiring a helper would have meant handing over that password, Finances and
 * all. The rules that matter most here are the ones that fail closed: a route
 * nobody gave a permission is the owner's, a typo in a stored permission takes
 * access away, and a quote a helper may not send never reaches the customer.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const STAFF = require('../tools/lib/staff');
const TEAM = require('../tools/lib/team-metrics');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

/* Every route registered with requireAdmin, as STAFF.routeKey would key it. */
function adminRoutes() {
  const out = [];
  const re = /app\.(get|post|put|patch|delete)\(\s*(\[[^\]]+\]|'[^']+'|FINANCES_PATH)\s*,\s*requireAdmin\b/g;
  let m;
  while ((m = re.exec(src))) {
    let p = m[2];
    if (p === 'FINANCES_PATH') p = '/admin/finances';
    else if (p.startsWith('[')) p = p.slice(1, -1).split(',').map((x) => x.trim().replace(/^'|'$/g, '')).join('|');
    else p = p.slice(1, -1);
    out.push(STAFF.routeKey(m[1], p));
  }
  return out;
}

/* ── Every admin route is decided, and the table names only real routes ─── */

test('every admin route names the permission a helper needs', () => {
  const routes = adminRoutes();
  assert.ok(routes.length > 60, `found ${routes.length} admin routes`);
  const missing = routes.filter((k) => !STAFF.ROUTES[k]);
  assert.deepStrictEqual(missing, [],
    'add each to ROUTES in tools/lib/staff.js — until then a helper is refused it, which is safe but surprising');
});

test('the route table names no route that does not exist', () => {
  const routes = new Set(adminRoutes());
  const stale = Object.keys(STAFF.ROUTES).filter((k) => !routes.has(k));
  assert.deepStrictEqual(stale, []);
});

test('every permission a route asks for is a real one', () => {
  for (const [k, need] of Object.entries(STAFF.ROUTES)) {
    assert.ok(need === 'owner' || need === 'any' || STAFF.PERMISSIONS[need], `${k} → ${need}`);
  }
});

test('every admin route is registered before the 404 catch-all, or it can never answer', () => {
  const catchAll = src.indexOf('// ─── 404 catch-all');
  assert.notStrictEqual(catchAll, -1);
  const re = /app\.(get|post|put|patch|delete)\(\s*(\[[^\]]+\]|'[^']+'|FINANCES_PATH)\s*,\s*requireAdmin\b/g;
  let m;
  while ((m = re.exec(src))) assert.ok(m.index < catchAll, `${m[1]} ${m[2]} is after the 404 handler`);
});

test('the owner-only pages stay owner-only', () => {
  for (const k of ['GET /admin/staff', 'POST /admin/staff/:id', 'GET /admin/approvals', 'POST /admin/approvals/:id',
                   'GET /admin/activity', 'GET /admin/team', 'GET /admin/commission', 'POST /admin/commission/pay']) {
    assert.strictEqual(STAFF.ROUTES[k], 'owner', k);
  }
});

/* ── Permissions ──────────────────────────────────────────────────────────── */

const helper = (perms) => ({ kind: 'staff', id: 7, name: 'Ana', perms });

test('a typo or unknown value in a stored permission is off', () => {
  assert.deepStrictEqual(STAFF.normalizePerm('leads.view', 'yes'), { level: 'off' });
  assert.deepStrictEqual(STAFF.normalizePerm('leads.view', { level: 'ON' }), { level: 'off' });
  assert.deepStrictEqual(STAFF.normalizePerm('no.such', 'on'), { level: 'off' });
  assert.deepStrictEqual(STAFF.normalizePerm('leads.view', 'approval'), { level: 'off' },
    'a view has nothing to approve');
});

test('quote sending is never simply off: a quote a helper built goes to the owner', () => {
  assert.strictEqual(STAFF.normalizePerm('quotes.send', 'off').level, 'approval');
  assert.strictEqual(STAFF.normalizePerm('quotes.send', undefined).level, 'approval');
});

test('limits are kept only as real, non-negative numbers', () => {
  assert.deepStrictEqual(STAFF.normalizePerm('quotes.send', { level: 'on', maxTotal: 500 }), { level: 'on', maxTotal: 500 });
  assert.deepStrictEqual(STAFF.normalizePerm('quotes.send', { level: 'on', maxTotal: -1 }), { level: 'on' });
  assert.deepStrictEqual(STAFF.normalizePerm('quotes.send', { level: 'on', maxTotal: 'lots' }), { level: 'on' });
});

test('no preset opens Finances, the dashboard or certificate decisions', () => {
  for (const name of Object.keys(STAFF.PRESETS)) {
    const p = STAFF.presetPerms(name);
    for (const k of ['finances', 'dashboard.view', 'certificates.decide', 'payments.record', 'discounts.manage']) {
      assert.strictEqual(p[k].level, 'off', `${name} → ${k}`);
    }
  }
});

test('a training helper sees the work, drafts, and needs approval to reach a customer', () => {
  const t = helper(STAFF.presetPerms('training'));
  assert.ok(STAFF.mayUseRoute(t, 'GET', '/leads'));
  assert.ok(STAFF.mayUseRoute(t, 'POST', '/api/quotes|/api/quotes/:code'));
  assert.ok(STAFF.mayUseRoute(t, 'POST', '/quote/:code/message'), 'may write one; the handler holds it');
  assert.ok(!STAFF.mayUseRoute(t, 'GET', '/admin/finances'));
  assert.ok(!STAFF.mayUseRoute(t, 'GET', '/dashboard'));
  assert.ok(!STAFF.mayUseRoute(t, 'POST', '/quote/:code/mark-paid'));
  assert.ok(!STAFF.mayUseRoute(t, 'GET', '/admin/staff'), 'never the staff page');
  assert.ok(!STAFF.mayUseRoute(t, 'GET', '/no/such/route'), 'deny by default');
  assert.ok(STAFF.mayUseRoute(t, 'GET', '/my-day'));
  assert.ok(STAFF.mayUseRoute(t, 'HEAD', '/leads'), 'HEAD is the GET route');
});

test('the owner may use every route, and nobody else without a login', () => {
  const owner = { kind: 'owner' };
  for (const k of Object.keys(STAFF.ROUTES)) {
    const [m, p] = k.split(' ');
    assert.ok(STAFF.mayUseRoute(owner, m, p), k);
    assert.ok(!STAFF.mayUseRoute(null, m, p), k);
  }
});

test('a form of toggles is read back as a permission set, fail-closed', () => {
  const p = STAFF.permsFromForm({ 'perm_leads.view': 'on', 'perm_quotes.send': 'on', 'limit_quotes.send': '250',
                                  'perm_finances': 'approval', 'perm_quotes.discount': 'bogus' });
  assert.deepStrictEqual(p['leads.view'], { level: 'on' });
  assert.deepStrictEqual(p['quotes.send'], { level: 'on', maxTotal: 250 });
  assert.strictEqual(p.finances.level, 'off');
  assert.strictEqual(p['quotes.discount'].level, 'off');
  assert.strictEqual(p['customers.view'].level, 'off', 'an unposted toggle is off');
});

test('presets are recognised again after saving', () => {
  assert.strictEqual(STAFF.presetMatching(STAFF.presetPerms('supervised')), 'supervised');
  const custom = STAFF.presetPerms('supervised');
  custom.finances = { level: 'on' };
  assert.strictEqual(STAFF.presetMatching(custom), null);
});

/* ── Held quotes ──────────────────────────────────────────────────────────── */

test('a quote waits for the owner when the helper may not send it, with every reason', () => {
  const training = helper(STAFF.presetPerms('training'));
  const r = STAFF.quoteNeedsApproval(training, { total: 100, discountPct: 15 });
  assert.strictEqual(r.held, true);
  assert.strictEqual(r.reasons.length, 2, 'not allowed to send, and a discount');

  const supervised = helper(STAFF.presetPerms('supervised'));
  assert.strictEqual(STAFF.quoteNeedsApproval(supervised, { total: 499 }).held, false);
  assert.match(STAFF.quoteNeedsApproval(supervised, { total: 501 }).reasons[0], /\$500 limit/);
  assert.strictEqual(STAFF.quoteNeedsApproval(supervised, { total: 100, discountPct: 5 }).held, true,
    'supervised discounts still go to the owner');

  const trusted = helper(STAFF.presetPerms('trusted'));
  assert.strictEqual(STAFF.quoteNeedsApproval(trusted, { total: 5000, discountPct: 10 }).held, false);
  assert.match(STAFF.quoteNeedsApproval(trusted, { total: 5000, discountPct: 12 }).reasons[0], /10% limit/);
  assert.strictEqual(STAFF.quoteNeedsApproval({ kind: 'owner' }, { total: 1e6, discountPct: 90 }).held, false);
});

test('rounding noise is not a discount', () => {
  const supervised = helper(STAFF.presetPerms('supervised'));
  assert.strictEqual(STAFF.quoteNeedsApproval(supervised, { total: 100, discountPct: 0.3 }).held, false);
});

test('a held quote is invisible to the customer, Brevo and the studio', () => {
  for (const sig of ["app.get('/q/:code', async", "app.get(['/q/:code/pay/card'", "app.post('/q/:code/changes'",
                     "app.get('/q/:code/vcard'", "app.post('/q/:code/accept'", "app.post('/q/:code/certificate', orderRateLimit"]) {
    assert.match(route(sig), /status <> 'held'/, sig);
  }
  assert.match(src, /async function syncQuoteToBrevo[\s\S]{0,400}if \(q\.status === 'held'\) return out;/);
  assert.match(src, /async function syncQuoteToLumise[\s\S]{0,200}q\.status === 'held'/);
  assert.match(src, /async function syncQuoteContact[\s\S]{0,120}q\.status === 'held'/);
  assert.match(src, /async function brevoQuoteCatchUp[\s\S]{0,300}AND status <> 'held'/);
  assert.doesNotMatch(src, /status <> 'expired'(?! AND)/, "totals exclude held quotes too: NOT IN ('expired', 'held')");
});

test('a helper cannot edit a quote the customer already has when the edit needs approval', () => {
  const r = route("app.post(['/api/quotes', '/api/quotes/:code'], requireAdmin");
  assert.match(r, /if \(existingQuote && !wasHeld && gate\.held\)/);
  assert.ok(r.indexOf('if (existingQuote && !wasHeld && gate.held)') < r.indexOf('UPDATE quotes SET name=$2'),
    'refused before anything is written');
});

test('approving is claimed first, so a double press cannot send twice', () => {
  const r = route("app.post('/admin/approvals/:id', requireAdmin");
  assert.match(r, /SET status = 'processing' WHERE id = \$1 AND status = 'pending' RETURNING \*/);
  assert.ok(r.indexOf("'processing'") < r.indexOf('sendJobMessage'));
});

test('a helper in training writes a message; it is held, not sent', () => {
  const r = route("app.post('/quote/:code/message', requireAdmin");
  assert.ok(r.indexOf("actorLevel('customers.message') === 'approval'") < r.indexOf('sendJobMessage('));
});

/* ── Passwords and sessions ───────────────────────────────────────────────── */

test('passwords are salted scrypt, and only the right one verifies', () => {
  const h = STAFF.hashPassword('correct horse battery');
  assert.match(h, /^scrypt\$16384\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.notStrictEqual(h, STAFF.hashPassword('correct horse battery'), 'salted');
  assert.ok(STAFF.verifyPassword('correct horse battery', h));
  assert.ok(!STAFF.verifyPassword('correct horse batterx', h));
  assert.ok(!STAFF.verifyPassword('', h));
  assert.ok(!STAFF.verifyPassword('anything', 'not-a-hash'));
  assert.throws(() => STAFF.hashPassword('short'), /12/);
});

test('a generated password is long enough to be accepted', () => {
  const p = STAFF.generatePassword();
  assert.match(p, /^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  assert.ok(STAFF.verifyPassword(p, STAFF.hashPassword(p)));
});

test('a session is signed, expires, and carries the account and its version', () => {
  const key = 'k'.repeat(40);
  const s = STAFF.makeSession(12, 3, key);
  assert.deepStrictEqual(STAFF.readSession(s, key), { id: 12, version: 3 });
  assert.strictEqual(STAFF.readSession(s, 'x'.repeat(40)), null, 'wrong key');
  assert.strictEqual(STAFF.readSession(s.replace(/^12\./, '13.'), key), null, 'another account');
  assert.strictEqual(STAFF.readSession(s.replace(/\.3\./, '.4.'), key), null, 'another version');
  const old = STAFF.makeSession(12, 3, key, 1000, Date.now() - 5000);
  assert.strictEqual(STAFF.readSession(old, key), null, 'expired');
  assert.strictEqual(STAFF.readSession('', key), null);
  assert.strictEqual(STAFF.readSession(s, ''), null, 'no key, no session');
  assert.throws(() => STAFF.makeSession(1, 1, ''), /STAFF_SESSION_SECRET/);
});

test('staff sessions need their own secret, and without it staff sign-in is off, not signed with a stand-in', () => {
  assert.match(src, /function staffSessionKey\(\) \{\s*const k = process\.env\.STAFF_SESSION_SECRET \|\| '';\s*return k\.length >= 32 \? k : '';/);
  const r = route("app.post('/signin', signinRateLimit");
  assert.match(r, /if \(!staffSessionKey\(\)\)/);
  assert.match(r, /DUMMY_STAFF_HASH/, 'an unknown email costs the same time as a known one');
});

test('sign-in only ever redirects within the site', () => {
  assert.match(src, /function safeAdminPath\(raw, fallback = '\/dashboard'\) \{[\s\S]*?!s\.startsWith\('\/\/'\)/);
  const r = route("app.post('/signin', signinRateLimit");
  assert.doesNotMatch(r, /res\.redirect\(b\.to\)/);
});

test('disabling a helper or resetting their password ends their sessions', () => {
  const r = route("app.post('/admin/staff/:id', requireAdmin");
  assert.match(r, /SET active = FALSE, session_version = session_version \+ 1/);
  assert.match(r, /SET password_hash = \$2, session_version = session_version \+ 1/);
});

test('a helper without Finances never receives supplier costs or margins', () => {
  assert.match(src, /var CAT = \$\{JSON\.stringify\(actorLevel\('finances'\) === 'on' \? catalog : catalogWithoutCosts\(catalog\)\)\};/);
  assert.match(route("app.get('/api/quotes/prior', requireAdmin"), /margin: lastMg\.entered && actorLevel\('finances'\) === 'on'/);
});

/* ── Team numbers ─────────────────────────────────────────────────────────── */

test('reply time counts working hours only', () => {
  // Fri 2026-10-02 23:00 Chicago → Mon 2026-10-05 09:20 Chicago = 20 working minutes.
  assert.strictEqual(TEAM.businessMinutesBetween('2026-10-03T04:00:00Z', '2026-10-05T14:20:00Z'), 20);
  // Same morning, 10:00 → 10:30.
  assert.strictEqual(TEAM.businessMinutesBetween('2026-09-30T15:00:00Z', '2026-09-30T15:30:00Z'), 30);
  // A weekend only.
  assert.strictEqual(TEAM.businessMinutesBetween('2026-10-03T15:00:00Z', '2026-10-04T20:00:00Z'), 0);
  // 4pm Tuesday → 10am Wednesday: an hour each side.
  assert.strictEqual(TEAM.businessMinutesBetween('2026-09-29T21:00:00Z', '2026-09-30T15:00:00Z'), 120);
  // Across the November clock change: Fri 4pm CDT → Mon 10am CST.
  assert.strictEqual(TEAM.businessMinutesBetween('2026-10-30T21:00:00Z', '2026-11-02T16:00:00Z'), 120);
  assert.strictEqual(TEAM.businessMinutesBetween('2026-09-30T15:30:00Z', '2026-09-30T15:00:00Z'), 0, 'backwards is zero');
});

test('median of the answered leads', () => {
  assert.strictEqual(TEAM.median([]), null);
  assert.strictEqual(TEAM.median([30, 10, 20]), 20);
  assert.strictEqual(TEAM.median([10, 20, 30, 40]), 25);
});

test('commission is on money kept, before tax', () => {
  assert.deepStrictEqual(TEAM.commissionFor({ collected: 1100, total: 1100, tax: 100, pct: 3 }), { base: 1000, amount: 30 });
  assert.deepStrictEqual(TEAM.commissionFor({ collected: 550, total: 1100, tax: 100, pct: 3 }), { base: 500, amount: 15 },
    'a deposit earns its share');
  assert.deepStrictEqual(TEAM.commissionFor({ collected: -20, total: 100, tax: 0, pct: 3 }), { base: 0, amount: 0 },
    'refunded past zero earns nothing, and never owes');
  assert.deepStrictEqual(TEAM.commissionFor({ collected: 100, total: 100, tax: 0, pct: 0 }), { base: 0, amount: 0 });
});

test('commission is payable only once paid in full, 14 days on, with no open dispute', () => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  const day = 86400000;
  assert.strictEqual(TEAM.commissionState({ paidInFull: false, lastMoneyAt: now - 30 * day, now }), 'earning');
  assert.strictEqual(TEAM.commissionState({ paidInFull: true, lastMoneyAt: now - 13 * day, now }), 'waiting');
  assert.strictEqual(TEAM.commissionState({ paidInFull: true, lastMoneyAt: now - 14 * day, now }), 'payable');
  assert.strictEqual(TEAM.commissionState({ paidInFull: true, lastMoneyAt: now - 30 * day, disputeOpen: true, now }), 'on hold');
  assert.strictEqual(TEAM.commissionState({ alreadyPaid: true, now }), 'paid');
});

test('a payout is recomputed from the ledger under a lock, never taken from the form', () => {
  const r = route("app.post('/admin/commission/pay', requireAdmin");
  assert.match(r, /pg_advisory_xact_lock/);
  assert.match(r, /commissionLines\(staffId/);
  assert.match(r, /ON CONFLICT \(staff_id, quote_code\) DO NOTHING/);
  assert.doesNotMatch(r, /req\.body\.amount/);
});

test('the week starts on Monday in the shop\'s zone', () => {
  assert.strictEqual(TEAM.weekOf('2026-10-04T15:00:00Z'), '2026-09-28', 'a Sunday belongs to the week before');
  assert.strictEqual(TEAM.weekOf('2026-10-05T04:30:00Z'), '2026-09-28', 'Sunday 11:30pm in Chicago is still Sunday');
  assert.strictEqual(TEAM.weekOf('2026-10-05T15:00:00Z'), '2026-10-05');
});

/* ── Playbook ─────────────────────────────────────────────────────────────── */

test('playbook text is escaped before its light formatting is applied', () => {
  const at = src.indexOf('function kbRender(body)');
  const fn = src.slice(at, src.indexOf('\n}\n', at) + 2);
  assert.ok(fn.indexOf('escEmail(') < fn.indexOf('<ul>'), 'escape first, format second');
  assert.match(src, /b\.textContent = \(a\.shortcut \? '\/' \+ a\.shortcut \+ ' ' : ''\) \+ a\.title;/,
    'the reply picker builds buttons from text');
});

test('the starter playbook is marked for the owner to check', () => {
  assert.match(src, /VALUES \(\$1, \$2, \$3, \$4, \$5, \$6, TRUE\) ON CONFLICT DO NOTHING/);
  assert.match(src, /if \(c\.n > 0\) return;/, 'written once, into an empty playbook');
});
