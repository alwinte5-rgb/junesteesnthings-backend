/* Codex P2 backlog, backend chunk G (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#159 replies: unchecked ones hidden from helpers, staff notes never reach a customer', () => {
  assert.match(after("app.get('/admin/api/playbook/replies'", 1200), /owner \? '' : ' AND NOT needs_review'/);
  const fn = after('function customerReplyText(', 300);
  const customerReplyText = new Function(`${fn.slice(0, fn.indexOf('\n}') + 2)}; return customerReplyText;`)();
  assert.strictEqual(customerReplyText('Hi **there**.\n\n(For you: never agree to a discount yourself.)'), 'Hi there.');
});
test('#159 the rush reply promises no rush before the method is known', () => {
  const r = after("shortcut: 'rush'", 900);
  assert.doesNotMatch(r, /rush it for an extra fee/);
  assert.match(r, /Only DTF can be rushed: screen printing, embroidery and cutouts cannot/);
  // A live copy at the embroidery-only wording, or the first one, still updates.
  const fix = after("const r = KB_ADDED.find((x) => x.shortcut === 'rush');", 2400);
  assert.match(fix, /if \(r\) \{ r\.was\.push\(r\.body\); r\.body = current; \}/);
});
test('#159 a reply too long for a text says so when chosen', () => {
  assert.match(src, /and a text holds 300: shorten it, or send it as an email\./);
});
test('#224 a trained helper moves to their own track\'s preset', () => {
  assert.match(after('function nextPresetFor(s)', 600), /track === 'sales' \? 'supervised' : STAFF\.presetForTrack\(track\)/);
});
test('#177/#161 hiring: questions kept after the decision, prompts snapshotted, fresh name on round 2', () => {
  assert.match(after('function hireVideoCallCard(', 2600), /kept for the record/);
  assert.match(src, /answers\.prompts = Object\.fromEntries\(HIRING\.roleOf\(row\.role\)\.written/);
  assert.match(after('async function openRound2(', 1200), /COALESCE\(\(SELECT p\.name FROM hiring_tests p WHERE p\.id = \$6\), \$2\)/);
});
