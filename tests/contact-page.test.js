'use strict';

/* The quote form on a page of its own, and every way into it (owner,
 * 2026-10-17): "Get a Quote" landed on the heading above the homepage form,
 * "Get Design Help" in the middle of the long homepage, "Email us" on the
 * homepage, and every email link went nowhere because Cloudflare's Email
 * Obfuscation rewrote it to /cdn-cgi/l/email-protection, which only works when
 * its own script runs.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const JS = fs.readFileSync(path.join(PUBLIC, 'assets', 'js', 'quote-form.js'), 'utf8');

function pages() {
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'assets') walk(p); continue; }
      if (e.name.endsWith('.html')) out.push(path.relative(PUBLIC, p));
    }
  })(PUBLIC);
  return out.concat(['assets/data/site-nav.html']);
}
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');

/* ── links ────────────────────────────────────────────────────────────────── */

test('no page sends anyone to /#contact any more', () => {
  for (const rel of pages()) {
    assert.doesNotMatch(read(rel), /href="(?:\/|https:\/\/(?:www\.)?jtees\.net\/)#contact"/, rel);
  }
  assert.doesNotMatch(fs.readFileSync(path.join(ROOT, 'tools', 'page-blocks.js'), 'utf8'), /\/#contact/);
  const nav = JSON.parse(read('assets/data/site-nav.json'));
  const hrefs = nav.menu.flatMap((m) => m.items ? m.items : [m]).map((i) => i.href);
  assert.ok(hrefs.includes('/contact'), 'the menu has Get a Quote → /contact');
});

test('the homepage\'s own quote links land on the form, clear of the sticky header', () => {
  const home = read('index.html');
  // Nothing points at the old section any more: the shared footer's
  // "Location & hours" opens /contact, where the address and hours are.
  assert.deepStrictEqual([...home.matchAll(/href="#contact"[^>]*>([^<]*)/g)].map((m) => m[1]), []);
  assert.match(home, /href="#quote-form"/);
  assert.match(home, /#quote-form, #contact \{ scroll-margin-top: 150px; \}/);
});

test('every email link is kept from Cloudflare\'s rewrite', () => {
  for (const rel of pages()) {
    const html = read(rel);
    for (const m of html.matchAll(/<a [^>]*href="mailto:[^"]*"[^>]*>[\s\S]*?<\/a>/g)) {
      const before = html.slice(Math.max(0, m.index - 16), m.index);
      const after = html.slice(m.index + m[0].length, m.index + m[0].length + 17);
      assert.ok(before.endsWith('<!--email_off-->') && after.startsWith('<!--/email_off-->'), `${rel}: ${m[0].slice(0, 80)}`);
    }
  }
  assert.match(fs.readFileSync(path.join(ROOT, 'tools', 'page-blocks.js'), 'utf8'),
    /<!--email_off--><a href="mailto:\$\{EMAIL\}">\$\{EMAIL\}<\/a><!--\/email_off-->/, 'the generator writes it the same way');
});

test('"Email us" and "Email Now" start an email', () => {
  for (const rel of pages()) {
    assert.doesNotMatch(read(rel), /href="[^"m][^"]*">(?:✉️ Email Now|Email us)<\/a>/, rel);
  }
});

test('nothing promises curbside pickup, rush, or same-week turnaround', () => {
  for (const rel of pages()) {
    if (rel === 'sms-terms.html' || rel === 'sms-consent.html') continue;
    const text = read(rel);
    assert.doesNotMatch(text, /curbside/i, rel);
    assert.doesNotMatch(text, /Rush (?:Available|options are available|turnaround available)|rush job/i, rel);
    assert.doesNotMatch(text, /same[- ]week/i, rel);
  }
  assert.doesNotMatch(read('services/screen-printing.html'), /href="tel:[^"]*"[^>]*>[^<]*Get a Custom Quote/,
    '"Get a Custom Quote" opens the quote form, not the dialler');
});

test('/contact is served, listed in the sitemap, and carries the form first', () => {
  const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.match(server, /app\.get\('\/contact', \(req, res\) => \{\s*sendPage\(req, res, 'contact\.html'\);/, 'served through sendPage (seasonal menu)');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/www\.jtees\.net\/contact<\/loc>/);
  const page = read('contact.html');
  assert.ok(page.indexOf('data-jt-quote-form') < page.indexOf('class="ct-info"'), 'the form comes before the details');
  // Stamped with the script's hash (tools/lib/css-tag.js scriptTag), kept current by site-nav.js.
  const v = require('../tools/lib/css-tag').scriptTag('/assets/js/quote-form.js').v;
  for (const rel of ['contact.html', 'index.html']) {
    assert.ok(read(rel).includes(`<script src="/assets/js/quote-form.js?v=${v}" defer></script>`), rel + ': current quote-form.js stamp');
  }
});

/* ── the shared form script, run against a small fake page ─────────────────── */

function fakeEl(tag, props = {}) {
  const el = {
    tagName: tag, listeners: {}, style: {}, hidden: false, className: '', textContent: '', value: '', disabled: false,
    attrs: {}, children: [],
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); },
    dispatchEvent(e) { (this.listeners[e.type] || []).forEach((f) => f(e)); },
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
    focus() {}, closest() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    ...props,
  };
  return el;
}

/* A page holding one quote form, the way the homepage has it. */
function harness({ scriptSrc, origin, replies }) {
  const fields = {
    name: fakeEl('input', { value: 'Jane Smith' }),
    phone: fakeEl('input', { value: '(773) 555-0100' }),
    email: fakeEl('input', { value: 'jane@example.com' }),
    description: fakeEl('textarea', { value: '24 reunion shirts' }),
    photo_url: fakeEl('input'),
  };
  const status = fakeEl('span', { className: 'form-status' });
  const btn = fakeEl('button', { textContent: 'Send Request' });
  const form = fakeEl('form', {
    elements: fields,
    querySelector: (sel) => (sel === '.form-status' ? status : sel === 'button[type="submit"]' ? btn : null),
    reset() { this.wasReset = true; },
  });
  const calls = [];
  const queue = replies.slice();
  const sandbox = {
    window: {}, URL, Promise, Date, setTimeout, JSON, Event: function (t) { this.type = t; },
    location: { href: origin + '/collection.php', origin },
    FormData: function () { return { forEach: (cb) => Object.keys(fields).forEach((k) => cb(fields[k].value, k)) }; },
    document: {
      currentScript: { src: scriptSrc }, readyState: 'complete', head: { appendChild() {} },
      getElementById: (id) => (id === 'quote-form' ? form : null), querySelectorAll: () => [],
      createElement: () => fakeEl('script'),
    },
    fetch: (url, opts) => {
      calls.push({ url, opts });
      if (url.endsWith('/api/form-token')) return Promise.resolve({ ok: true, json: async () => ({ token: 'tok-' + calls.length }) });
      if (url.endsWith('/api/config')) return Promise.resolve({ ok: true, json: async () => ({}) });
      const r = queue.shift();
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
  };
  sandbox.window.gtag = () => {};
  vm.createContext(sandbox);
  vm.runInContext(JS, sandbox);
  const submit = async () => {
    form.dispatchEvent({ type: 'submit', preventDefault() {} });
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  };
  return { form, fields, status, btn, calls, submit };
}

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('loaded by design.jtees.net, the form sends to www.jtees.net with a fresh token', async () => {
  const h = harness({ scriptSrc: 'https://www.jtees.net/assets/js/quote-form.js', origin: 'https://design.jtees.net', replies: [reply(200, { ok: true })] });
  await h.submit();
  const post = h.calls.find((c) => c.url.endsWith('/submit'));
  assert.ok(post, 'it posted');
  assert.strictEqual(post.url, 'https://www.jtees.net/submit');
  const body = JSON.parse(post.opts.body);
  assert.strictEqual(body.email, 'jane@example.com');
  assert.match(body._token, /^tok-/);
  const tokenCalls = h.calls.filter((c) => c.url === 'https://www.jtees.net/api/form-token');
  assert.strictEqual(tokenCalls.length, 2, 'one at load, one fresh at send');
  assert.match(h.status.textContent, /We got it/);
  assert.ok(h.form.wasReset, 'cleared only after a confirmed save');
  assert.strictEqual(h.btn.disabled, false);
  assert.strictEqual(h.btn.textContent, 'Send Request');
});

test('on jtees.net itself the paths stay relative', async () => {
  const h = harness({ scriptSrc: 'https://www.jtees.net/assets/js/quote-form.js', origin: 'https://www.jtees.net', replies: [reply(200, {})] });
  await h.submit();
  assert.ok(h.calls.some((c) => c.url === '/submit'));
});

test('a refusal is shown, never a success', async () => {
  const h = harness({ scriptSrc: 'https://www.jtees.net/assets/js/quote-form.js', origin: 'https://design.jtees.net', replies: [reply(400, { error: 'Please enter a valid email address.' })] });
  await h.submit();
  assert.match(h.status.className, /\berror\b/);
  assert.strictEqual(h.status.textContent, 'Please enter a valid email address.');
  assert.ok(!h.form.wasReset, 'what they typed is kept');
});

test('the hourly limit says how to reach us now', async () => {
  const h = harness({ scriptSrc: 'https://www.jtees.net/assets/js/quote-form.js', origin: 'https://design.jtees.net', replies: [reply(429, {})] });
  await h.submit();
  assert.match(h.status.textContent, /call or text us at \(773\) 900-4592/);
});

test('a network failure is reported, and the button comes back', async () => {
  const h = harness({ scriptSrc: 'https://www.jtees.net/assets/js/quote-form.js', origin: 'https://design.jtees.net', replies: [new Error('offline')] });
  await h.submit();
  assert.match(h.status.textContent, /Something went wrong/);
  assert.strictEqual(h.btn.disabled, false);
});

test('a bad phone number is caught before anything is sent', async () => {
  const h = harness({ scriptSrc: 'https://www.jtees.net/assets/js/quote-form.js', origin: 'https://www.jtees.net', replies: [] });
  h.fields.phone.value = '555-01';
  await h.submit();
  assert.match(h.status.textContent, /10-digit phone/);
  assert.ok(!h.calls.some((c) => c.url.endsWith('/submit')));
});

test('a blank name or order description is caught before anything is sent', async () => {
  const h = harness({ scriptSrc: 'https://www.jtees.net/assets/js/quote-form.js', origin: 'https://www.jtees.net', replies: [] });
  h.fields.name.value = '  ';
  await h.submit();
  assert.match(h.status.textContent, /your name/);
  h.fields.name.value = 'Jane';
  h.fields.description.required = true;
  h.fields.description.value = '';
  await h.submit();
  assert.match(h.status.textContent, /about your order/);
  assert.ok(!h.calls.some((c) => c.url.endsWith('/submit')));
});

test('the drawn form lets the browser enforce required fields too', () => {
  assert.doesNotMatch(JS, /novalidate/);
});

test('a failed /api/config is asked again, not remembered as empty', () => {
  assert.match(JS, /getJSON\('\/api\/config'\)\.catch\(function \(\) \{ config = null; return \{\}; \}\)/);
  assert.match(JS, /if \(!r\.ok\) throw new Error/);
});

test('Turnstile is not loaded a second time on a page that already loads it', () => {
  assert.match(JS, /script\[src\*="challenges\.cloudflare\.com\/turnstile\/v0\/api\.js"\]/);
});

test('a second press while sending does not send twice', async () => {
  let release;
  const slow = new Promise((r) => { release = r; });
  const h = harness({ scriptSrc: 'https://www.jtees.net/assets/js/quote-form.js', origin: 'https://www.jtees.net', replies: [slow] });
  h.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  h.form.dispatchEvent({ type: 'submit', preventDefault() {} });
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  release(reply(200, {}));
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
  assert.strictEqual(h.calls.filter((c) => c.url.endsWith('/submit')).length, 1);
});

test('the drawn form is static markup with the fields /submit reads', () => {
  const start = JS.indexOf('function markup(p)');
  const fn = JS.slice(start, JS.indexOf('\n  }\n', start));
  for (const name of ['name', 'phone', 'email', 'description', 'photo_url', 'website', 'heard_from', 'heard_rep', 'sms_transactional', 'sms_marketing']) {
    assert.match(fn, new RegExp(`name="${name}"`), name);
  }
  // Only the generated id prefix and the script's own origin are joined in.
  const joined = [...fn.matchAll(/'\s*\+\s*([a-zA-Z_.]+)\s*\+\s*'/g)].map((m) => m[1]);
  assert.deepStrictEqual([...new Set(joined)].sort(), ['p', 'site']);
});
