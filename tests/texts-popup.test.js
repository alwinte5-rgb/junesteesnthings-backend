'use strict';

/* The "10% off for joining our texts" popup on jtees.net (2026-10-18).
 *
 * The popup is a copy of the /texts sign-up form that posts to /texts, so
 * what must hold is that the copy keeps matching the real thing:
 *   - the consent wording is word for word what tools/lib/sms-consent.js
 *     records as agreed to;
 *   - the field names are the ones the /texts handler reads, and its source
 *     ('popup') is one the campaign counts;
 *   - it is on the site's pages, but not the contact, SMS or 404 pages, and
 *     never in the snippets design.jtees.net takes (it has its own popup).
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const NAV = require('../tools/site-nav');
const REINTRO = require('../tools/lib/reintro');
const { TRANSACTIONAL_TEXT, MARKETING_TEXT } = require('../tools/lib/sms-consent');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');
const JS = read('assets/js/texts-popup.js');
// The script's strings, joined across its + concatenations, entities decoded.
const flat = JS.replace(/'\s*\+\s*\n?\s*'/g, '').replace(/"\s*\+\s*\n?\s*'/g, '').replace(/'\s*\+\s*\n?\s*"/g, '')
  .replace(/\\'/g, "'").replace(/&amp;/g, '&');

test('the consent boxes say exactly what the server records', () => {
  assert.ok(flat.includes(TRANSACTIONAL_TEXT), 'order-updates wording');
  assert.ok(flat.includes(MARKETING_TEXT), 'deals wording');
});

test('it posts the /texts form the server reads, from a counted source', () => {
  assert.match(JS, /<form method="POST" action="\/texts">/);
  for (const name of ['phone', 'email', 'sms_transactional', 'sms_marketing']) {
    assert.match(JS, new RegExp(`name="${name}"`), name);
  }
  assert.match(JS, /name="src" value="popup"/);
  assert.strictEqual(REINTRO.cleanSource('popup'), 'popup', 'popup sign-ups are counted as their own source');
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /app\.post\(REINTRO\.SIGNUP_PATH,/, 'the /texts handler it posts to');
  // Only a sign-up the server accepted turns the popup off: the thank-you page
  // sets the flag, the popup's own submit does not.
  assert.match(server, /localStorage\.setItem\('jt_tx_joined'/);
  assert.ok(!/setItem\(KEY_JOINED|store\.set\(KEY_JOINED/.test(JS), 'popup submit does not mark them joined');
});

test('it waits, asks once a fortnight, and never after a sign-up or mid-quote', () => {
  assert.match(JS, /ARM_MS = 6000/);
  assert.match(JS, /AGAIN_MS = 14 \* 86400000/);
  assert.match(JS, /if \(store\.get\(KEY_JOINED\)\) return;/);
  assert.match(JS, /if \(shown \|\| !armed \|\| \(!PREVIEW && busy\(\)\)\) return;/);
  assert.doesNotThrow(() => new Function(JS), 'the script parses');
  // Safari reports a point a few pixels inside the page on exit, not <= 0.
  assert.ok(!/e\.clientY <= 0/.test(JS), 'exit is not limited to clientY <= 0');
  assert.ok(!/addEventListener\('mouseout'/.test(JS), 'no mouseout trigger: moving onto an embedded map is not leaving');
  assert.match(JS, /popup=preview/, 'the owner preview link');
  // The logo it shows is a real, small file.
  const logo = JS.match(/var LOGO = '([^']+)'/)[1];
  const file = path.join(PUBLIC, logo);
  assert.ok(fs.existsSync(file), logo + ' exists');
  assert.ok(fs.statSync(file).size < 20 * 1024, logo + ' is small');
});

test('it is on the site pages, not contact, SMS or 404, and not in the shared snippets', () => {
  const v = require('../tools/lib/css-tag').scriptTag('/assets/js/texts-popup.js').v;
  const tag = `<script src="/assets/js/texts-popup.js?v=${v}" defer></script>`;
  for (const rel of NAV.pages()) {
    const html = read(rel);
    if (NAV.NO_POPUP.has(rel)) assert.ok(!html.includes('texts-popup.js'), rel + ': no popup');
    else assert.ok(html.includes(tag), rel + ': current popup script');
  }
  for (const rel of ['contact.html', 'sms-consent.html', '404.html']) assert.ok(NAV.NO_POPUP.has(rel), rel);
  assert.ok(!read('sms-terms.html').includes('texts-popup.js'), 'sms-terms.html: no popup');
  for (const rel of ['assets/data/site-nav.html', 'assets/data/site-footer.html']) {
    assert.ok(!read(rel).includes('texts-popup'), rel + ': design.jtees.net never gets this popup');
  }
});

/* ── the script itself, run against a small stand-in page ─────────────────── */

const vm = require('node:vm');

function el() {
  const e = {
    listeners: {}, style: {}, value: '', checked: false, disabled: false, parentNode: null, children: [],
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    fire(t, ev) { (this.listeners[t] || []).forEach((f) => f(ev)); },
    querySelector() { return el(); }, querySelectorAll() { return []; },
    appendChild(c) { this.children.push(c); c.parentNode = this; }, removeChild() {},
    focus() {}, closest() { return null; },
  };
  return e;
}

function run({ search = '', stored = {}, now = 0 } = {}) {
  const writes = [], tracked = [], timers = [];
  const root = el(), body = el(), head = el(), doc = el();
  Object.assign(doc, { readyState: 'complete', documentElement: root, body, head, activeElement: null,
    createElement: () => el(), getElementById: () => null });
  root.clientWidth = 1200;
  const win = {
    JTTextsPopup: false, innerWidth: 1200, innerHeight: 800, scrollY: 0,
    matchMedia: () => ({ matches: true }),
    addEventListener() {}, removeEventListener() {},
    jtTrack: (n) => tracked.push(n),
  };
  const ctx = {
    window: win, document: doc, location: { search, pathname: '/' },
    localStorage: { getItem: (k) => (k in stored ? stored[k] : null), setItem: (k, v) => writes.push([k, v]) },
    setTimeout: (f) => { timers.push(f); }, Date: { now: () => now }, parseInt,
  };
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  vm.runInContext(JS, ctx);
  return { body, root, doc, writes, tracked, timers };
}

test('?popup=preview opens it at once, records nothing, and ignores the rules', () => {
  const r = run({ search: '?popup=preview', stored: { jt_tx_joined: '1' } });
  assert.strictEqual(r.body.children.length, 1, 'the dialog is on the page');
  assert.deepStrictEqual(r.writes, [], 'nothing stored');
  assert.deepStrictEqual(r.tracked, [], 'nothing counted');
});

test('without preview it waits, then opens only on a real top exit', () => {
  const r = run({ now: 1e12 });
  assert.strictEqual(r.body.children.length, 0, 'nothing on load');
  r.timers.forEach((f) => f()); // the 6-second wait passes
  r.root.fire('mouseleave', { clientX: 0, clientY: 20 });
  assert.strictEqual(r.body.children.length, 0, 'leaving by the left edge does not count');
  r.root.fire('mouseleave', { clientX: 600, clientY: 400 });
  assert.strictEqual(r.body.children.length, 0, 'leaving mid-page, not heading up, does not count');
  r.doc.fire('mousemove', { clientY: 300 });
  r.doc.fire('mousemove', { clientY: 150 });
  r.root.fire('mouseleave', { clientX: 600, clientY: 150 });
  assert.strictEqual(r.body.children.length, 1, 'a quick flick up through the top quarter opens it');
  assert.ok(r.writes.some(([k]) => k === 'jt_tx_pop_seen'), 'marked seen');
  assert.deepStrictEqual(r.tracked, ['texts_popup_shown']);
});

test('a visitor who signed up is never asked', () => {
  const r = run({ stored: { jt_tx_joined: '1' } });
  r.timers.forEach((f) => f());
  r.root.fire('mouseleave', { clientX: 600, clientY: 5 });
  assert.strictEqual(r.body.children.length, 0);
});
