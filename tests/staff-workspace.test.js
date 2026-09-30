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
  assert.ok(STAFF.mayUseRoute(t, 'GET', '/admin/leads'));
  assert.ok(STAFF.mayUseRoute(t, 'POST', '/admin/api/quotes|/admin/api/quotes/:code'));
  assert.ok(STAFF.mayUseRoute(t, 'POST', '/admin/quote/:code/message'), 'may write one; the handler holds it');
  assert.ok(!STAFF.mayUseRoute(t, 'GET', '/admin/finances'));
  assert.ok(!STAFF.mayUseRoute(t, 'GET', '/admin/dashboard'));
  assert.ok(!STAFF.mayUseRoute(t, 'POST', '/admin/quote/:code/mark-paid'));
  assert.ok(!STAFF.mayUseRoute(t, 'GET', '/admin/staff'), 'never the staff page');
  assert.ok(!STAFF.mayUseRoute(t, 'GET', '/no/such/route'), 'deny by default');
  assert.ok(STAFF.mayUseRoute(t, 'GET', '/admin/my-day'));
  assert.ok(STAFF.mayUseRoute(t, 'HEAD', '/admin/leads'), 'HEAD is the GET route');
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

/* A DRAFT (2026-09-30) is kept out of every one of these in the same place. */
test('a held quote is invisible to the customer, Brevo and the studio', () => {
  for (const sig of ["app.get('/q/:code', async", "app.get(['/q/:code/pay/card'", "app.post('/q/:code/changes'",
                     "app.get('/q/:code/vcard'", "app.post('/q/:code/accept'", "app.post('/q/:code/certificate', orderRateLimit"]) {
    assert.match(route(sig), /status NOT IN \('held', 'draft'\)/, sig);
  }
  assert.match(src, /async function syncQuoteToBrevo[\s\S]{0,400}if \(q\.status === 'held' \|\| q\.status === 'draft'\) return out;/);
  assert.match(src, /async function syncQuoteToLumise[\s\S]{0,200}q\.status === 'held'/);
  assert.match(src, /async function syncQuoteContact[\s\S]{0,120}q\.status === 'held'/);
  assert.match(src, /async function brevoQuoteCatchUp[\s\S]{0,300}AND status NOT IN \('held', 'draft'\)/);
  assert.doesNotMatch(src, /status <> 'expired'(?! AND)/, "totals exclude held quotes too: NOT IN ('expired', 'held')");
});

test('a helper cannot edit a quote the customer already has when the edit needs approval', () => {
  const r = route("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin");
  /* A draft is not with the customer, so a helper may keep working on it. */
  assert.match(r, /if \(existingQuote && !wasHeld && !wasDraft && gate\.held\)/);
  assert.ok(r.indexOf('if (existingQuote && !wasHeld && !wasDraft && gate.held)') < r.indexOf('UPDATE quotes SET name=$2'),
    'refused before anything is written');
});

test('approving is claimed first, so a double press cannot send twice', () => {
  const r = route("app.post('/admin/approvals/:id', requireAdmin");
  assert.match(r, /SET status = 'processing' WHERE id = \$1 AND status = 'pending' RETURNING \*/);
  assert.ok(r.indexOf("'processing'") < r.indexOf('sendJobMessage'));
});

test('a helper in training writes a message; it is held, not sent', () => {
  const r = route("app.post('/admin/quote/:code/message', requireAdmin");
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

/* Signing in is Cloudflare Access (tools/lib/cf-access.js); the app keeps no
   password. These pin down what requireAdmin will and will not accept. */
const requireAdminSrc = src.slice(src.indexOf('async function requireAdmin('),
  src.indexOf('\n}\n', src.indexOf('async function requireAdmin(')));

test('there is no password: only a verified Cloudflare pass signs anyone in', () => {
  assert.match(requireAdminSrc, /CF_ACCESS\.verifyAccessToken\(req\.get\('cf-access-jwt-assertion'\), cfAccess, cfKeyFor\)/);
  for (const gone of ['Basic ', 'ADMIN_PASSWORD', 'cookie', 'checkStamp']) {
    assert.ok(!requireAdminSrc.includes(gone), `requireAdmin must not accept ${gone}`);
  }
  assert.ok(!src.includes("app.post('/signin'"), 'no password form to post to');
  assert.ok(!/app\.(get|post)\('\/admin\/account/.test(src), 'no password to change');
});

test('without Cloudflare configured, every staff page is refused, never opened', () => {
  assert.ok(requireAdminSrc.indexOf('if (!cfAccess) return res.status(503)') < requireAdminSrc.indexOf('verifyAccessToken'));
});

test('the owner is named by OWNER_EMAILS, a helper by an active staff row, anyone else is refused', () => {
  assert.ok(requireAdminSrc.indexOf('cfAccess.owners.includes(email)') < requireAdminSrc.indexOf('staffByEmail(email)'));
  assert.match(requireAdminSrc, /if \(!staff\) return notOnTeam\(req, res, email\);/);
  assert.match(requireAdminSrc, /if \(!STAFF\.mayUseRoute\(staff, req\.method, req\.route && req\.route\.path\)\) return refuseStaff/);
  const lookup = src.slice(src.indexOf('async function staffByEmail('), src.indexOf('\n}\n', src.indexOf('async function staffByEmail(')));
  assert.match(lookup, /WHERE lower\(email\) = \$1/);
  assert.match(lookup, /if \(!s \|\| !s\.active\) return null;/);
});

test('a state-changing request from another site is refused before anything else', () => {
  assert.ok(requireAdminSrc.indexOf('fromAnotherSite(req)') < requireAdminSrc.indexOf('verifyAccessToken'));
});

test('a page reached around Cloudflare is sent to the guarded address, never to one from the request', () => {
  assert.match(requireAdminSrc, /res\.redirect\(`\$\{PUBLIC_BASE_URL\}\$\{adminPathFor\(req\.originalUrl\)\}`\)/);
  assert.match(src, /function safeAdminPath\(raw, fallback = '\/admin\/dashboard'\) \{[\s\S]*?!s\.startsWith\('\/\/'\)/);
});

test('every staff route lives under /admin, where Cloudflare guards it', () => {
  const re = /app\.(get|post|put|patch|delete)\(\s*(\[[^\]]+\]|'[^']+'|FINANCES_PATH)\s*,\s*requireAdmin\b/g;
  let m, n = 0;
  while ((m = re.exec(src))) {
    const paths = m[2] === 'FINANCES_PATH' ? ['/admin/finances'] : m[2].replace(/[[\]']/g, '').split(',').map((x) => x.trim());
    for (const p of paths) { n++; assert.ok(p === '/admin' || p.startsWith('/admin/'), `${m[1]} ${p} is outside /admin`); }
  }
  assert.ok(n > 80, `only ${n} staff routes found — the pattern stopped matching`);
});

test('old staff addresses forward into /admin, and only within the site', () => {
  const grab = (sig) => src.slice(src.indexOf(sig), src.indexOf('\n}\n', src.indexOf(sig)) + 2);
  const moved = src.slice(src.indexOf('const MOVED_TO_ADMIN'), src.indexOf(']);', src.indexOf('const MOVED_TO_ADMIN')) + 3);
  // eslint-disable-next-line no-new-func
  const adminPathFor = new Function(`${grab('function safeAdminPath(')}\n${moved}\n${grab('function adminPathFor(')}\nreturn adminPathFor;`)();
  assert.strictEqual(adminPathFor('/quotes'), '/admin/quotes');
  assert.strictEqual(adminPathFor('/quote/new'), '/admin/quote/new');
  assert.strictEqual(adminPathFor('/leads?x=1'), '/admin/leads?x=1');
  assert.strictEqual(adminPathFor('/admin/reviews'), '/admin/reviews');
  assert.strictEqual(adminPathFor('//evil.example.com/quotes'), '/admin');
  assert.strictEqual(adminPathFor('https://evil.example.com'), '/admin');
  assert.strictEqual(adminPathFor('/blog'), '/admin', 'a public page is not a staff address');
  assert.match(src, /app\.get\('\/admin\/sso', \(req, res\) => res\.redirect\(adminPathFor\(/);
});

test('helpers are added without a password, and an owner email cannot be a helper', () => {
  const r = route("app.post('/admin/staff', requireAdmin");
  assert.match(r, /VALUES \(\$1, \$2, '!', \$3, \$4\)/);
  assert.match(r, /cfAccess\.owners\.includes\(email\)/);
  assert.ok(!r.includes('generatePassword'));
});

test('disabling a helper locks them out on their next click', () => {
  assert.match(route("app.post('/admin/staff/:id', requireAdmin"), /SET active = FALSE WHERE id = \$1/);
});

test('a helper without Finances never receives supplier costs or margins', () => {
  assert.match(src, /var CAT = \$\{JSON\.stringify\(actorLevel\('finances'\) === 'on' \? catalog : catalogWithoutCosts\(catalog\)\)\};/);
  assert.match(route("app.get('/admin/api/quotes/prior', requireAdmin"), /margin: lastMg\.entered && actorLevel\('finances'\) === 'on'/);
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

test('playbook search takes a question in plain words: any word, as a prefix, best match first', () => {
  const at = src.indexOf('function kbMatch(p)');
  const fn = src.slice(at, src.indexOf('\n}\n', at) + 2);
  assert.match(fn, /plainto_tsquery/, 'user text is never parsed as tsquery syntax');
  assert.match(fn, /' & ', ' \| '/, 'words are ORed, not ANDed');
  assert.match(fn, /:\*/, 'each word matches as a prefix');
  assert.match(fn, /NULLIF\(/, 'a question of only stop words is no query, not an error');
  assert.doesNotMatch(src, /websearch_to_tsquery\(/, 'no search left that needs every word');
  assert.match(route("app.get('/admin/api/playbook/replies'"), /kbMatch\(1\)\.rank\} DESC/);
  assert.match(route("app.get('/admin/playbook', requireAdmin"), /order = 'rank DESC, title'/);
});

test('team chat: a helper reaches only their own conversation', () => {
  const at = src.indexOf('function chatThreadFor(');
  const fn = src.slice(at, src.indexOf('\n}\n', at));
  assert.match(fn, /a\.kind === 'staff'\) return a\.id;/, 'a helper\'s thread is always their own, whatever they send');
  assert.match(fn, /roster\.some\(\(r\) => r\.id === id\)/, 'the owner may only open a real helper');
  for (const r of ['GET /admin/team-chat', 'POST /admin/team-chat', 'GET /admin/api/team-chat']) {
    assert.strictEqual(STAFF.ROUTES[r], 'any', r);
  }
});

test('team chat lines are text, never markup', () => {
  const page = route("app.get('/admin/team-chat', requireAdmin");
  assert.match(page, /escEmail\(j\.body\)/);
  assert.match(page, /el\.textContent = m\.body/);
  assert.doesNotMatch(page, /innerHTML/);
  const send = route("app.post('/admin/team-chat', requireAdmin");
  assert.match(send, /body\.length > TEAM_CHAT_MAX/, 'length is capped');
  assert.match(send, /interval '10 seconds'/, 'a double click does not post twice');
  assert.match(send, /who\.active/, 'the owner cannot write to a disabled helper');
});

test('sales credit: a helper can never take a sale credited to someone else, and paid credit is fixed', () => {
  const fn = src.slice(src.indexOf('async function setSalesCredit('), src.indexOf('\n}\n', src.indexOf('async function setSalesCredit(')));
  assert.match(fn, /if \(isStaff\) return \{ ok: false, msg: 'Only the owner can mark a sale as their own\.' \}/);
  assert.match(fn, /isStaff && cur != null && cur !== actor\.id/);
  assert.match(fn, /if \(q\.paid\) return/, 'no change once commission on it is paid');
  assert.match(fn, /credited_to IS NOT DISTINCT FROM \$3[\s\S]*NOT EXISTS \(SELECT 1 FROM commission_payouts/,
    'the same rules again in the UPDATE, against a race');
  assert.strictEqual(STAFF.ROUTES['POST /admin/quote/:code/credit'], 'quotes.view');
});

test('commission, the scorecard and incentives follow the sales credit, not who pressed send', () => {
  assert.match(src.slice(src.indexOf('async function commissionLines(')), /WHERE q\.credited_to = \$1/);
  const score = src.slice(src.indexOf('async function helperScore('), src.indexOf('\n}\n', src.indexOf('async function helperScore(')));
  assert.match(score, /credited_to = \$1 AND accepted_at/);
  assert.match(score, /WHERE q\.credited_to = \$1 AND p\.created_at/);
});

test('bonuses and incentives are the owner\'s; a helper sees only their own earnings', () => {
  for (const r of ['POST /admin/bonuses', 'POST /admin/bonuses/:id/delete', 'POST /admin/incentives',
                   'POST /admin/incentives/:id/end', 'POST /admin/incentives/:id/award']) {
    assert.strictEqual(STAFF.ROUTES[r], 'owner', r);
  }
  assert.strictEqual(STAFF.ROUTES['GET /admin/my-earnings'], 'any');
  const page = route("app.get('/admin/my-earnings', requireAdmin");
  assert.match(page, /WHERE id = \$1', \[actor\.id\]/, 'the id is the signed-in helper, never the query');
  const award = route("app.post('/admin/incentives/:id/award', requireAdmin");
  assert.match(award, /incentiveProgress\(i, staffId\) < Number\(i\.target\)/, 'checked against the ledger, not the page');
  assert.match(award, /ON CONFLICT \(incentive_id, staff_id\)/, 'awarded once');
  const pay = route("app.post('/admin/commission/pay', requireAdmin");
  assert.match(pay, /paid_at IS NULL FOR UPDATE/, 'bonuses are locked while they are paid');
});

test('period edges are midnight on the shop\'s clock, not UTC', () => {
  assert.strictEqual(TEAM.localMidnight('2026-09-28', 'America/Chicago'), '2026-09-28T05:00:00.000Z');
  assert.strictEqual(TEAM.localMidnight('2026-01-15', 'America/Chicago'), '2026-01-15T06:00:00.000Z');
  assert.strictEqual(TEAM.localMidnight('2026-12-31', 'America/Chicago', 1), '2027-01-01T06:00:00.000Z');
  assert.strictEqual(TEAM.localMidnight('nope'), null);
});

test('a custom line with a typed price goes to the owner unless discounts are fully the helper\'s', () => {
  const sup = { kind: 'staff', perms: STAFF.presetPerms('supervised') };
  const g = STAFF.quoteNeedsApproval(sup, { total: 50, customPriced: 1 });
  assert.ok(g.held && g.reasons.some((r) => /no catalogue price/.test(r)));
  const open = { kind: 'staff', perms: { ...STAFF.presetPerms('supervised'), 'quotes.discount': { level: 'on' } } };
  assert.ok(!STAFF.quoteNeedsApproval(open, { total: 50, customPriced: 1 }).held);
  assert.ok(!STAFF.quoteNeedsApproval({ kind: 'owner' }, { total: 50, customPriced: 3 }).held);
});

test('a helper\'s discount is measured against catalogue price, not a typed garment price', () => {
  assert.match(src, /catalogueSum \+= priceLine\(\{ \.\.\.priceArgs, blankOverride: null, unitOverride: null \}\)\.lineTotal/);
  assert.match(src, /const listSubtotal = round2\(Math\.max\(catalogueSum,/);
});

test('nothing a helper can reach moves a quote out of held, except the owner\'s Approve', () => {
  assert.match(route("app.post('/admin/quote/:code/uncancel'"), /WHERE code = \$1 AND status <> 'held' RETURNING/);
  assert.match(route("app.post('/admin/quote/:code/mark-paid'"), /if \(q\.status === 'held'\) return/);
  assert.match(src, /UPDATE quotes SET status = 'accepted', accepted_at = COALESCE\(accepted_at, NOW\(\)\)\n      WHERE code = \$1 AND status <> 'held'/);
});

test('no customer message about a held quote, whose link the customer cannot open', () => {
  const fn = src.slice(src.indexOf('async function sendJobMessage('));
  assert.match(fn.slice(0, 800), /if \(q && q\.status === 'held'\) return 'held';/);
  assert.ok(src.includes("  held: 'This quote is still waiting for approval"));
});

test('costs, margin and monthly profit on the boards need Finances', () => {
  assert.match(src, /if \(VIEW !== 'work' \|\| actorLevel\('finances'\) !== 'on'\) return '';\n          const mg = quoteMargin\(q\);/);
  assert.match(src, /\$\{VIEW !== 'money' \|\| actorLevel\('finances'\) !== 'on' \? '' : `/);
});

test('a receipt is a customer email: a helper whose messages need approval cannot send one', () => {
  assert.match(route("app.post('/admin/quote/:code/receipt'"), /if \(actorLevel\('customers\.message'\) !== 'on'\)/);
});

test('a flash message goes before the #fragment, where the page can read it', () => {
  const m = /const back = \(res, path, key, msg\) => \{[\s\S]*?\n\};/.exec(src);
  assert.ok(m);
  let to = null;
  const back = new Function('encodeURIComponent', `${m[0]}; return back;`)(encodeURIComponent);
  back({ redirect: (u) => { to = u; } }, '/admin/staff#staff-5', 'ok', 'Saved.');
  assert.strictEqual(to, '/admin/staff?ok=Saved.#staff-5');
  back({ redirect: (u) => { to = u; } }, '/x?a=1', 'err', 'No');
  assert.strictEqual(to, '/x?a=1&err=No');
});

test('releasing a held quote starts the customer\'s clock then, keeping its days of validity', () => {
  const fn = src.slice(src.indexOf('async function releaseHeldQuote('), src.indexOf('\n}\n', src.indexOf('async function releaseHeldQuote(')));
  assert.match(fn, /created_at = NOW\(\)/);
  assert.match(fn, /CURRENT_DATE \+ GREATEST\(1, valid_until - created_at::date\)/);
});
