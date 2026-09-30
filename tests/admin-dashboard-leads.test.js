'use strict';

/* The back office's side menu, its dashboard, and the Leads page that tawk.to
 * chats now feed.
 *
 * Until 2026-09-28 the admin pages sat under a row of pills, enquiries lived on
 * a separate dark page that asked for the password in a pop-up and was built
 * around Clover and HubSpot (both switched off), and a tawk.to chat was an
 * email and nothing else. Now there is one menu, a dashboard, one Leads page
 * for every door an enquiry comes in by, and every chat lands there as a lead
 * that can be quoted in one click (an anonymous one points to tawk.to).
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const { tawkLead } = require('../tools/lib/chat-alert');

function lift(name) {
  let at = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  if (src.slice(at - 6, at) === 'async ') at -= 6;
  let i = src.indexOf('(', at);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}
function grab(startText, endText) {
  const at = src.indexOf(startText);
  assert.notStrictEqual(at, -1, `${startText} not found in server.js`);
  return src.slice(at, src.indexOf(endText, at) + endText.length);
}
function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

/* The shell, rendered: the menu, the document and both page shells. */
function shell() {
  const sandbox = { FINANCES_PATH: '/admin/finances', QUOTE_CSS: '', REVIEW_CSS: '', process: { env: {} } };
  vm.createContext(sandbox);
  vm.runInContext([
    grab('const ADMIN_NAV = [', '];'),
    grab('const STUDIO_ADMIN = ', "'/admin.php';"),
    grab('const ADMIN_ICONS = {', '};'),
    grab('const ADMIN_CSS = `', '\n`;'),
    grab('const ADMIN_BADGE_JS = `', '`;'),
    lift('escEmail'), lift('icon'), lift('adminNav'), lift('htmlDocument'), lift('adminPage'), lift('quotePage'),
  ].join('\n'), sandbox);
  return sandbox;
}

/* ── The menu ───────────────────────────────────────────────────────────── */

test('every admin page carries the side menu, with its own entry lit', () => {
  const html = shell().adminPage('Leads', '<p>body</p>', 'leads');
  assert.match(html, /<aside class="adm-side"/);
  const active = html.match(/<a class="adm-link is-active" href="([^"]+)" aria-current="page">/g) || [];
  assert.strictEqual(active.length, 1, 'exactly one entry is the current page');
  assert.match(active[0], /href="\/leads"/);
  for (const href of ['/dashboard', '/leads', '/quotes', '/production', '/orders', '/customers',
                      '/admin/reviews', '/admin/finances', '/discounts', '/quote/new']) {
    assert.ok(html.includes(`href="${href}"`), `the menu links ${href}`);
  }
  assert.match(html, /href="https:\/\/design\.jtees\.net\/admin\.php" target="_blank" rel="noopener"/,
    'and the way back to the studio');
  assert.match(html, /<p>body<\/p>/);
});

test('a page still passing the old "jobs" key lights Quotes', () => {
  const html = shell().adminPage('Quotes', '', 'jobs');
  assert.match(html, /<a class="adm-link is-active" href="\/quotes"/);
});

test('the badges start hidden and are filled in after the page loads', () => {
  const html = shell().adminPage('Dashboard', '', 'dashboard');
  for (const b of ['leads', 'late', 'reviews']) {
    assert.ok(html.includes(`<span class="adm-badge" data-badge="${b}" hidden></span>`), `${b} badge`);
  }
  assert.match(html, /fetch\('\/admin\/nav-counts',\{credentials:'same-origin',cache:'no-store'\}\)/);
  assert.match(html, /\.catch\(function\(\)\{\}\)/, 'a failed count shows no badge, never an error');
});

test('a title is escaped, in the tab and in the phone header', () => {
  const html = shell().adminPage('<b>Jo & Co</b>', '', 'customers');
  assert.doesNotMatch(html, /<b>Jo/);
  assert.match(html, /<title>&lt;b&gt;Jo &amp; Co&lt;\/b&gt;<\/title>/);
});

test('the customer shell never carries the menu', () => {
  /* quotePage renders /q/:code and the review form: Books and the enquiries
     inbox must never be in front of a customer. */
  const html = shell().quotePage('Your quote', '<p>hi</p>');
  assert.doesNotMatch(html, /adm-side|adm-link|nav-counts|New quote/);
  assert.match(html, /<div class="wrap"><p>hi<\/p><\/div>/);
});

test('the phone drawer needs no script: a checkbox and two labels', () => {
  const html = shell().adminPage('Orders', '', 'orders');
  assert.match(html, /<input type="checkbox" id="adm-menu" class="adm-toggle"/);
  assert.match(html, /<label for="adm-menu" class="adm-burger"/);
  assert.match(html, /<label for="adm-menu" class="adm-scrim">/);
  const css = grab('const ADMIN_CSS = `', '\n`;');
  assert.match(css, /\.adm-toggle:checked ~ \.adm \.adm-side\{transform:none;visibility:visible;/);
});

/* Parked 102% off the left edge, the closed menu's 40px shadow fell across
   every page on a phone, as a grey band down the left side. */
test('the closed phone menu is hidden, and only the open one casts a shadow', () => {
  const css = grab('const ADMIN_CSS = `', '\n`;');
  const closed = css.match(/\.adm-side\{position:fixed;[^}]*\}/);
  assert.ok(closed, 'the phone rule for the menu');
  assert.match(closed[0], /visibility:hidden/, 'hidden, so its links cannot be tabbed to either');
  assert.doesNotMatch(closed[0], /box-shadow/);
  assert.match(css, /\.adm-side\{transform:none;visibility:visible;box-shadow:8px 0 40px/);
});

/* ── The routes ─────────────────────────────────────────────────────────── */

test('the dashboard, the Leads page and the menu counts are admin only', () => {
  for (const r of ["app.get('/dashboard', requireAdmin", "app.get('/leads', requireAdmin",
                   "app.get('/admin/nav-counts', requireAdmin"]) {
    assert.ok(src.includes(r), r);
  }
  assert.match(route("app.get('/admin/nav-counts', requireAdmin"), /res\.set\('Cache-Control', 'no-store'\)/,
    'counts about customers are never cached');
  assert.match(route("app.get('/dashboard', requireAdmin"), /res\.set\('Cache-Control', 'no-store'\)/);
});

test('each count fails on its own, to zero', () => {
  const r = route("app.get('/admin/nav-counts', requireAdmin");
  assert.strictEqual((r.match(/\.catch\(\(\) => \{\}\)/g) || []).length, 6,
    'leads, reviews, late jobs, certificates, approvals waiting and unread team chat');
});

test('the old enquiries page forwards to the new one', () => {
  assert.match(src, /app\.get\('\/admin', requireAdmin, \(_req, res\) => res\.redirect\('\/leads'\)\);/);
  assert.doesNotMatch(src, /prompt\('Admin password:'\)/, 'no password pop-up left anywhere');
});

test('signing in from the studio lands on the dashboard', () => {
  const r = route("app.get('/admin/sso'");
  assert.match(r, /String\(req\.query\.to \|\| '\/dashboard'\)/);
  assert.match(r, /: '\/dashboard';/);
});

test('dismissing a lead returns to the page it came from, and nowhere else', () => {
  const r = route("app.post('/lead/:id/dismiss', requireAdmin");
  assert.match(r, /\['\/leads', '\/quotes'\]\.includes\(/);
  assert.match(r, /res\.redirect\(back\)/);
  assert.doesNotMatch(r, /res\.redirect\(req\.body/, 'never to an address the form sends');
});

test('the lead card posts its way back with each dismiss', () => {
  const card = lift('leadCardHtml');
  assert.strictEqual((card.match(/\$\{backField\}/g) || []).length, 2, 'Too late and Not a job both carry it');
  assert.match(card, /value="Too late — past the date they needed it"/);
});

/* ── Reviews waiting ────────────────────────────────────────────────────── */

test('a review is waiting only until it is approved or hidden', () => {
  /* approved = FALSE is both "never looked at" and "hidden on purpose"; the
     badge counted the hidden ones as waiting. */
  const sql = grab('const REVIEWS_WAITING_SQL = `', '`;');
  assert.match(sql, /moderated_at IS NULL/);
  assert.match(sql, /deleted_at IS NULL/);
  assert.match(src, /UPDATE reviews SET approved=\$2, moderated_at=NOW\(\) WHERE id=\$1/,
    'approving and hiding are both a decision');
  assert.match(src, /ALTER TABLE reviews ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ/);
});

/* ── tawk.to chats as leads ─────────────────────────────────────────────── */

test('a chat that left an email becomes a lead', () => {
  const l = tawkLead({ event: 'chat:start', chatId: 'abc123',
    visitor: { name: 'Dana Reed', email: 'Dana@Example.com', city: 'Chicago' },
    message: { text: 'Hi, can you do 40 hoodies by the 12th?' } });
  assert.deepStrictEqual(l, { source: 'chat', ref: 'tawk:chat:abc123', chatRef: 'abc123', name: 'Dana Reed',
    email: 'dana@example.com', description: 'Hi, can you do 40 hoodies by the 12th?' });
});

test('an anonymous chat is a lead too, with no email', () => {
  /* The first real chat after leads went live gave no name and no email, and
     was kept as an alert email only: the owner watched the Leads page and it
     never came. */
  assert.deepStrictEqual(
    tawkLead({ event: 'chat:start', chatId: 'x', visitor: { name: 'V1560169545827106', email: '' },
               message: { text: 'Hi! we chatted on here on Friday' } }),
    { source: 'chat', ref: 'tawk:chat:x', chatRef: 'x', name: 'Chat visitor', email: '',
      description: 'Hi! we chatted on here on Friday' });
  assert.strictEqual(tawkLead({ event: 'chat:start', chatId: 'x', visitor: { email: 'not an email' } }).email, '',
    'something that is not an address is not kept as one');
  assert.strictEqual(tawkLead({ event: 'chat:start', chatId: 'x' }).email, '', 'no visitor block at all');
  assert.strictEqual(tawkLead({ event: 'ticket:create', ticket: { id: 't1', message: 'hello' } }).email, '');
  assert.strictEqual(tawkLead({ event: 'chat:start', visitor: { email: 'a@b.co' } }), null, 'no chat id, no key');
  assert.strictEqual(tawkLead({ event: 'ticket:create', requester: { email: 'a@b.co' }, ticket: {} }), null,
    'no ticket id, no key');
});

test("an anonymous chat's card sends the owner to tawk.to, and no card opens on a separator", () => {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext([
    grab('const LEAD_SOURCES = {', '};'),
    lift('escEmail'), lift('pill'), lift('ageInWords'), lift('leadCardHtml'),
  ].join('\n'), sandbox);
  const contactLine = (html) => html.match(/margin-top:8px;font-size:12\.5px">([\s\S]*?)<\/div>/)[1].trim();
  const base = { id: 7, created_at: new Date().toISOString(), description: 'hi', phone: '' };

  const anon = contactLine(sandbox.leadCardHtml({ ...base, source: 'chat', name: 'Chat visitor', email: '' }));
  assert.match(anon, /^<a href="https:\/\/dashboard\.tawk\.to\/"[^>]*>No email left — answer in tawk\.to<\/a>$/);

  const named = contactLine(sandbox.leadCardHtml({ ...base, source: 'chat', name: 'Dana', email: 'dana@example.com' }));
  assert.match(named, /^<a href="mailto:dana@example\.com">dana@example\.com<\/a> &middot; <a href="https:\/\/dashboard\.tawk\.to\/"[^>]*>answer in tawk\.to<\/a>$/);

  const phoneOnly = contactLine(sandbox.leadCardHtml({ ...base, source: 'form', name: 'Lee', email: '', phone: '3125550123' }));
  assert.strictEqual(phoneOnly, '<a href="tel:3125550123">3125550123</a>', 'a form lead with only a phone');
});

test("tawk's placeholder name is not a name", () => {
  const l = tawkLead({ event: 'chat:start', chatId: 'c1', visitor: { name: 'V1560169545827106', email: 'a@b.co' } });
  assert.strictEqual(l.name, 'Chat visitor');
});

test('every offline message becomes a lead, subject and message together', () => {
  const l = tawkLead({ event: 'ticket:create', requester: { name: 'Sam', email: 'sam@x.org' },
    ticket: { id: 't-9', humanId: 42, subject: 'Team shirts', message: 'Need 25 by Friday' } });
  assert.deepStrictEqual(l, { source: 'offline', ref: 'tawk:ticket:t-9', chatRef: '42', name: 'Sam',
    email: 'sam@x.org', description: 'Team shirts — Need 25 by Friday' });
});

test('other tawk events are not leads', () => {
  for (const event of ['chat:end', 'chat:transcript_created', '', undefined]) {
    assert.strictEqual(tawkLead({ event, chatId: 'c', visitor: { email: 'a@b.co' } }), null, String(event));
  }
  assert.strictEqual(tawkLead(null), null);
});

test('a very long message is clipped rather than refused', () => {
  const l = tawkLead({ event: 'chat:start', chatId: 'c2', visitor: { email: 'a@b.co' },
    message: { text: 'x'.repeat(5000) } });
  assert.ok(l.description.length <= 1500);
});

test('the webhook keeps a chat once however often tawk sends it, and says so when it cannot', () => {
  const save = lift('saveChatLead');
  assert.match(save, /ON CONFLICT \(dedupe_key\) WHERE dedupe_key IS NOT NULL DO NOTHING/,
    'keyed on the chat or ticket id; the WHERE repeats the partial index predicate');
  assert.match(save, /VALUES \(\$1, '', \$2, \$3, \$4, \$5, \$6\)/, 'phone is NOT NULL, so a chat stores it empty');
  const hook = route("app.post('/webhooks/tawk'");
  assert.ok(hook.indexOf('alertOwnerOfChat(req.body)') < hook.indexOf('tawkLead(req.body)'),
    'the alert still goes first');
  assert.match(hook, /reportError\('tawk-lead', err/, 'tawk has been answered already, so a failed save goes to the digest');
  assert.match(hook, /UPDATE submissions SET brevo_synced_at = NOW\(\) WHERE id = \$1/,
    'Brevo already has a chat on its own list, so the catch-up leaves it alone');
});

test('embroidery requests say what they are, and old ones are back-filled', () => {
  assert.match(src, /VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,'embroidery'\)/);
  assert.match(src, /SET source = 'embroidery'\s+WHERE source = 'form' AND description LIKE 'EMBROIDERY REQUEST:%'/);
});
