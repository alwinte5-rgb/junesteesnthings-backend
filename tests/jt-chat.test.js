'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'js', 'jt-chat.js'), 'utf8');

/* The script with no DOM ready yet: the panel is never built, which is the
   state the Tawk hook must survive (Tawk can load before the page). */
function load({ tawk = {}, storage = {} } = {}) {
  const window = {
    Tawk_API: tawk,
    localStorage: { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); } },
  };
  const document = { readyState: 'loading', addEventListener() {} };
  vm.runInNewContext(SRC, { window, document, console, setTimeout });
  return window;
}

test('name and email are checked before a chat starts', () => {
  const check = load().__jtChatCheckDetails;
  assert.equal(check('Kim Lee', 'kim@example.com'), '');
  assert.match(check('', 'kim@example.com'), /your name/);
  assert.match(check('K', 'kim@example.com'), /your name/);
  assert.match(check('x'.repeat(61), 'kim@example.com'), /60 characters/);
  for (const bad of ['', 'kim', 'kim@', 'kim@example', 'kim lee@example.com', `${'a'.repeat(110)}@example.com`]) {
    assert.match(check('Kim Lee', bad), /valid email/, bad);
  }
});

test('a page hook already on onChatMaximized still runs', () => {
  let ran = 0;
  const w = load({ tawk: { onChatMaximized() { ran++; } } });
  w.Tawk_API.onChatMaximized();
  assert.equal(ran, 1);
});

test('before the panel exists the chat is never closed on the visitor', () => {
  let minimized = 0;
  const w = load({ tawk: { minimize() { minimized++; } } });
  w.Tawk_API.onChatMaximized();
  assert.equal(minimized, 0);
});

test('the FAQ covers quotes, ordering, groups, pickup directions and care', () => {
  for (const q of ['How do I get a quote?', 'How do I order?', 'Family reunion, church & group orders?', 'Where are you, and can I pick up?', 'How do I care for my shirt?']) {
    assert.ok(SRC.includes(q), q);
  }
  assert.match(SRC, /by appointment, so please call or text \(773\) 900-4592/);
  assert.match(SRC, /ring the intercom for June's Tees, come up to the 4th floor, and have a seat in the lobby/);
});

test('the visitor’s details only ever go to Tawk, never into the page as HTML or into storage', () => {
  const form = SRC.slice(SRC.indexOf('form.onsubmit'), SRC.indexOf('gate = function'));
  assert.match(form, /Tawk_API\.setAttributes\(\{ name: nameIn\.value\.trim\(\), email: emailIn\.value\.trim\(\) \}/);
  assert.doesNotMatch(form, /innerHTML/);
  assert.match(SRC, /localStorage\.setItem\(DONE_KEY, '1'\)/);
  assert.doesNotMatch(SRC, /localStorage\.setItem\([^)]*(name|email)/i);
});

test('a chat already under way, or the script’s own open, is never stopped', () => {
  const hook = SRC.slice(SRC.indexOf('window.Tawk_API.onChatMaximized = function'), SRC.indexOf('window.Tawk_API.onChatMaximized = function') + 400);
  assert.match(hook, /if \(passing \|\| detailsGiven\(\) \|\| chatOngoing\(\) \|\| !gate\) return;/);
});
