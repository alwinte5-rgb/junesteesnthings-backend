'use strict';

/* The back office menu in sections (owner, 2026-10-18: "too many tabs ... most
 * of these can become one. I just don't wanna lose them in the process").
 *
 * Twenty-eight menu entries became eight sections, and nine pages that had no
 * entry at all got one. These tests keep it that way: every page has a home in
 * the menu, every entry sits in exactly one section, a section stays short
 * enough to read as tabs, and a helper is never offered a page that would
 * refuse them.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const STAFF = require('../tools/lib/staff');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function grab(startText, endText) {
  const at = src.indexOf(startText);
  assert.notStrictEqual(at, -1, `${startText} not found in server.js`);
  return src.slice(at, src.indexOf(endText, at) + endText.length);
}
function lift(name) {
  const at = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', src.indexOf(')', at)); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced braces reading ' + name);
}

/* The menu tables and the functions that read them, run with a chosen actor. */
function menu(actor) {
  const sandbox = { FINANCES_PATH: '/admin/finances', STAFF, PARTNERS: { on: () => true },
    process: { env: {} }, currentActor: () => actor };
  vm.createContext(sandbox);
  vm.runInContext([
    grab('const ADMIN_NAV = [', '];'), grab('const ADMIN_SECTIONS = [', '];'),
    grab('const STUDIO_ADMIN = ', "'/admin.php';"), grab('const ADMIN_ICONS = {', '};'),
    lift('escEmail'), lift('icon'), "function clockChip() { return ''; }", lift('navItemsFor'), lift('navSectionsFor'),
    lift('adminNav'), lift('notifyBell'), lift('sectionTabs'),
    'this.NAV = ADMIN_NAV; this.SECTIONS = ADMIN_SECTIONS;',
  ].join('\n'), sandbox);
  return sandbox;
}
const OWNER = { kind: 'owner', id: null, name: 'Owner', perms: null };

/* Pages that are deliberately not menu entries, each with the reason. Anything
   else under /admin that answers a GET without a :param must be in the menu. */
const NOT_A_MENU_PAGE = {
  '/admin/sso': 'the studio sign-in handoff, not a page',
  '/admin/inventory': 'JSON from Clover, not a page',
  '/admin/data': 'JSON kept for old readers',
  '/admin/nav-counts': 'the menu badges, JSON',
  '/admin/go': 'the menu Go to box',
  '/admin/find': 'the Go to box and dashboard search',
  '/admin/customer': 'one customer, reached from a search',
  '/admin/quote/new': 'the New quote button on every page',
  '/admin/campaign/sign': 'a printable sign, opened from the campaign page',
  '/admin/delivery/new': 'booking for one job, opened from that job',
  '/admin/hiring/test': 'a role guide, opened from Hiring',
  '/admin/notifications/settings': 'email settings, opened from Notifications',
  '/admin/tax.csv': 'a download on Exports',
  '/admin/mailbox/new': 'the New conversation button on Mailbox and on each order and task',
  '/admin/training/attempts': "one helper's tries at one quiz, opened from Training",
};
const isData = (p) => /^\/admin\/api\//.test(p) || /\.(csv|json)$/.test(p);

test('every admin page has a home in the menu', () => {
  const { NAV } = menu(OWNER);
  const hrefs = new Set(NAV.map((n) => n.href));
  const pages = [...new Set([...src.matchAll(/^app\.get\(\[?'(\/admin\/[^']*)'/gm)].map((m) => m[1]))]
    .filter((p) => !p.includes(':') && !isData(p));
  assert.ok(pages.length > 30, 'the route scan should see the back office');
  const orphans = pages.filter((p) => !hrefs.has(p) && !NOT_A_MENU_PAGE[p]);
  assert.deepStrictEqual(orphans, [],
    'a page reachable only by its URL is exactly what the owner asked to end: give it a menu entry and a section, or say here why not');
});

test('every entry is in exactly one section, and every section entry exists', () => {
  const { NAV, SECTIONS } = menu(OWNER);
  const keys = NAV.map((n) => n.key);
  assert.strictEqual(new Set(keys).size, keys.length, 'a menu key used twice');
  const placed = SECTIONS.flatMap((s) => s.items);
  for (const k of keys) {
    assert.strictEqual(placed.filter((x) => x === k).length, 1, `${k} must sit in exactly one section`);
  }
  for (const k of placed) assert.ok(keys.includes(k), `section lists ${k}, which is not a menu entry`);
});

test('a section stays short enough to read as one row of tabs', () => {
  for (const s of menu(OWNER).SECTIONS) {
    assert.ok(s.items.length <= 8, `${s.label} has ${s.items.length} pages; split it`);
  }
  assert.ok(menu(OWNER).SECTIONS.length <= 8, 'the point was fewer things in the menu');
});

test('the owner sees every section but My work, and every formerly hidden page', () => {
  const html = menu(OWNER).adminNav('dashboard');
  assert.doesNotMatch(html, /<span>My work<\/span>/);
  for (const href of ['/admin/approvals', '/admin/activity', '/admin/staff', '/admin/commission', '/admin/exports',
                      '/admin/campaign', '/admin/delivery/settings', '/admin/work-schedule', '/admin/training/paths']) {
    assert.ok(html.includes(`href="${href}"`), `the menu links ${href}`);
  }
  assert.doesNotMatch(html, /href="\/admin\/my-day"|href="\/admin\/clock"/, 'no helper-only pages for the owner');
});

test('the open section is the one holding the page, and a section sums its badges', () => {
  const html = menu(OWNER).adminNav('approvals');
  const open = html.match(/<details class="adm-sec" open>/g) || [];
  assert.strictEqual(open.length, 1, 'one section open');
  assert.match(html, /<details class="adm-sec" open><summary class="adm-link is-here">.*?<span>Team<\/span>/s);
  assert.match(html, /data-badge-group="approvals"/, 'a closed Team section still shows waiting approvals');
  assert.match(html, /data-badge-group="jobnotes,mail,chat"/, 'and a closed Today section shows mail and chat');
});

test('every page in a section shows the section as tabs, with this one lit', () => {
  const tabs = menu(OWNER).sectionTabs('exports');
  assert.match(tabs, /^<nav class="sec-tabs" aria-label="Money">/);
  for (const label of ['Finances', 'Certificates', 'Exports', 'Staff pay']) assert.ok(tabs.includes(`>${label}`), label);
  assert.match(tabs, /<a class="sec-tab is-active" href="\/admin\/exports" aria-current="page">Exports/);
  assert.strictEqual(menu(OWNER).sectionTabs('no-such-page'), '', 'a page outside the menu gets no tabs');
});

for (const preset of Object.keys(STAFF.PRESETS)) test(`a ${preset} helper sees only pages their permissions open, starting with My work`, () => {
  const perms = STAFF.presetPerms(preset);
  assert.ok(perms && Object.keys(perms).length, `${preset} preset has permissions`);
  const helper = { kind: 'staff', id: 7, name: 'Ana', perms };
  const m = menu(helper);
  const html = m.adminNav('myday');
  assert.match(html, /<span>My work<\/span>/);
  for (const n of m.navItemsFor(helper)) {
    assert.ok(STAFF.mayUseRoute(helper, 'GET', n.href), `${n.href} offered but refused`);
    assert.ok(!n.ownerOnly, `${n.key} is the owner's`);
  }
  for (const href of ['/admin/staff', '/admin/commission', '/admin/exports', '/admin/hiring']) {
    assert.ok(!html.includes(`href="${href}"`), `${href} must not be offered to a helper`);
  }
});

test('the Go to box: a page by name first, then Find, and only pages this person may open', () => {
  const go = src.slice(src.indexOf("app.get('/admin/go'"), src.indexOf('\n});', src.indexOf("app.get('/admin/go'")));
  assert.match(go, /navItemsFor\(actor\)/, 'matched against the same menu the person sees');
  assert.match(go, /\.slice\(0, 120\)/, 'the query is capped');
  assert.match(go, /encodeURIComponent\(q\)/);
  assert.match(go, /STAFF\.mayUseRoute\(actor, 'GET', '\/admin\/find'\)/, 'a helper without search is not sent to a page that refuses them');
  assert.strictEqual(STAFF.permForRoute('GET', '/admin/go'), 'any');
  assert.match(go, /n\.label\.toLowerCase\(\) === want/, 'whole names only');
  assert.doesNotMatch(go, /startsWith|includes\(want\)/, 'a customer called Mark must not land on Marketing calendar');
});
