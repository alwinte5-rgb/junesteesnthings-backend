'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'js', 'jt-chat.js'), 'utf8');

/* Just enough DOM for jt-chat.js to build its panel. */
function fakeDom() {
  const make = (tag) => ({
    tagName: tag.toUpperCase(), style: {}, children: [], attrs: {}, textContent: '', value: '',
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); return c; },
    focus() {},
  });
  const body = make('body');
  const document = {
    readyState: 'complete', body,
    createElement: make,
    createTextNode: (t) => ({ textContent: t }),
    querySelector: () => null,
    addEventListener() {},
  };
  return { document, body };
}

function all(node, out = []) {
  for (const c of node.children || []) { out.push(c); all(c, out); }
  return out;
}
const text = (n) => (n.textContent || '') + (n.children || []).map(text).join('');

/* A page with the panel built and a fake Tawk. */
function page({ tawk = {}, storage = {}, ongoing = false } = {}) {
  const calls = { minimize: 0, maximize: 0, hide: 0, show: 0, attrs: [] };
  const T = Object.assign({
    minimize() { calls.minimize++; },
    maximize() { calls.maximize++; },
    hideWidget() { calls.hide++; },
    showWidget() { calls.show++; },
    isChatOngoing: () => ongoing,
    setAttributes(a, cb) { calls.attrs.push(a); if (cb) cb(); },
    addEvent() {},
  }, tawk);
  const { document, body } = fakeDom();
  const window = {
    Tawk_API: T,
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
  };
  vm.runInNewContext(SRC, { window, document, console: { warn() {}, log() {} }, setTimeout, Tawk_API: T });
  const nodes = all(body);
  const form = nodes.find((n) => n.tagName === 'FORM');
  const inputs = form.children.filter((n) => n.tagName === 'INPUT');
  const err = form.children.find((n) => n.attrs.role === 'alert');
  const submit = (name, email) => {
    inputs[0].value = name; inputs[1].value = email;
    form.onsubmit({ preventDefault() {} });
  };
  const button = (label) => nodes.find((n) => n.tagName === 'BUTTON' && ((n.textContent || '') + (n.innerHTML || '')).includes(label));
  return { window, T, calls, form, err, submit, storage, inputs, button, nodes };
}

test('name and email are checked before a chat starts', () => {
  const check = page().window.__jtChatCheckDetails;
  assert.equal(check('Kim Lee', 'kim@example.com'), '');
  assert.equal(check('Kim Lee', 'user@example.xn--p1ai'), '', 'punycode top-level domain');
  assert.match(check('', 'kim@example.com'), /your name/);
  assert.match(check('x'.repeat(61), 'kim@example.com'), /60 characters/);
  for (const bad of ['', 'kim', 'kim@', 'kim@example', 'kim lee@example.com', `${'a'.repeat(110)}@example.com`]) {
    assert.match(check('Kim Lee', bad), /valid email/, bad);
  }
});

test("Tawk's bubble is hidden until a chat is chosen, and shown for a chat already going", () => {
  const p = page();
  p.T.onLoad();
  assert.equal(p.calls.hide, 1);
  const q = page({ ongoing: true });
  q.T.onLoad();
  assert.equal(q.calls.show, 1);
});

test('opening the chat without details closes it and asks for name and email first', () => {
  const p = page();
  p.T.onChatMaximized();
  assert.equal(p.calls.minimize, 1);
  assert.equal(p.form.style.display, 'flex');
  p.window.jtOpenChat();
  assert.equal(p.calls.maximize, 0, 'a "Text us" link gets the same step');
});

test('valid details go to Tawk, are remembered, and the chat opens', () => {
  const p = page();
  p.window.jtOpenChat();
  p.submit('Kim Lee', 'kim@example.com');
  assert.deepEqual(p.calls.attrs[0], { name: 'Kim Lee', email: 'kim@example.com' });
  assert.equal(p.storage['jt-chat-details'], '1');
  assert.equal(p.calls.maximize, 1);
  assert.equal(p.calls.show, 1);
  p.T.onChatMaximized();
  assert.equal(p.calls.minimize, 0, 'not asked twice');
  assert.ok(!JSON.stringify(p.storage).includes('kim'), 'only the flag is stored, never the details');
});

test('Tawk refusing the details: chat still opens, nothing remembered, details sent again on load', () => {
  let n = 0;
  const p = page({ tawk: { setAttributes(a, cb) { n++; cb(n === 1 ? new Error('no') : undefined); } } });
  p.submit('Kim Lee', 'kim@example.com');
  assert.equal(p.calls.maximize, 1);
  assert.equal(p.storage['jt-chat-details'], undefined);
  assert.ok(p.window.__jtChatState().pending);
  p.T.onLoad();
  assert.equal(n, 2);
  assert.equal(p.storage['jt-chat-details'], '1');
  assert.equal(p.window.__jtChatState().pending, null);
});

test('Tawk not loaded at all: the visitor is told and given the text number, not a dead close', () => {
  const p = page({ tawk: { maximize: undefined, setAttributes: undefined } });
  p.submit('Kim Lee', 'kim@example.com');
  assert.match(text(p.err), /could not load[\s\S]*\(773\) 900-4592/);
  assert.equal(p.err.style.display, 'block');
  assert.notEqual(p.form.style.display, 'none');
  assert.equal(p.storage['jt-chat-details'], undefined);
});

test('a bad entry shows what to fix and sends nothing', () => {
  const p = page();
  p.submit('Kim Lee', 'not-an-email');
  assert.match(p.err.textContent, /valid email/);
  assert.equal(p.calls.attrs.length, 0);
  assert.equal(p.calls.maximize, 0);
});

test('a chat under way, or one an agent started, is never closed on the visitor', () => {
  const p = page({ ongoing: true });
  p.T.onChatMaximized();
  assert.equal(p.calls.minimize, 0);
  const q = page();
  q.T.onChatMessageAgent();
  q.T.onChatMaximized();
  assert.equal(q.calls.minimize, 0);
  assert.equal(q.calls.show, 1, 'the bubble comes back when an agent writes');
});

test('a page hook already on a Tawk event still runs', () => {
  let ran = 0;
  const p = page({ tawk: { onChatMaximized() { ran++; }, onLoad() { ran++; } } });
  p.T.onChatMaximized();
  p.T.onLoad();
  assert.equal(ran, 2);
});

test('the FAQ covers quotes, ordering, groups, pickup by appointment, and care', () => {
  for (const q of ['How do I get a quote?', 'How do I order?', 'Family reunion, church & group orders?', 'Where are you, and can I pick up?', 'How do I care for my shirt?']) {
    assert.ok(SRC.includes(q), q);
  }
  assert.match(SRC, /ring the intercom for June's Tees, come up to the 4th floor, and have a seat in the lobby/);
  assert.doesNotMatch(SRC, /can also do curbside pickup/, 'no answer promises walk-up pickup');
});

test('the name and email form is the first thing in the panel when it opens (2026-10-15)', () => {
  const p = page();
  assert.equal(p.form.style.display, 'flex', 'there before any button is pressed');
  const feed = p.nodes.find((n) => (n.children || []).includes(p.form));
  assert.equal(feed.children[0], p.form, 'at the top, above the greeting and answers');
  assert.match(text(p.form), /What’s your name and email\?/);
  assert.ok(text(p.form).includes('Start chat'), 'its own button, in the card');
  const done = page({ storage: { 'jt-chat-details': '1' } });
  assert.equal(done.form.style.display, 'none', 'not asked again once given');
});

test('a quick answer never sends what was typed: only Start chat does', () => {
  const p = page();
  p.inputs[0].value = 'Kim Lee'; p.inputs[1].value = 'kim@example.com';
  p.button('How do I order?').onclick();
  assert.equal(p.calls.attrs.length, 0);
  assert.equal(p.calls.maximize, 0);
});

test('details typed in the card, then the big button: same as Start chat', () => {
  const p = page();
  p.inputs[0].value = 'Kim Lee'; p.inputs[1].value = 'kim@example.com';
  p.button('Chat with a real person').onclick();
  assert.deepEqual(p.calls.attrs[0], { name: 'Kim Lee', email: 'kim@example.com' });
  assert.equal(p.calls.maximize, 1);
});

test('a chat already going is never asked for details when the panel opens', () => {
  const p = page();
  p.T.onChatMessageAgent();
  p.button('Chat with us').onclick();
  assert.equal(p.form.style.display, 'none');
});

test('"Chat with a real person" without details points at the form instead of opening Tawk', () => {
  const p = page();
  p.button('Chat with a real person').onclick();
  assert.equal(p.calls.maximize, 0);
  assert.match(p.err.textContent, /name and email to start/);
  p.submit('Kim Lee', 'kim@example.com');
  assert.equal(p.calls.maximize, 1);
  assert.equal(p.form.style.display, 'none');
});
