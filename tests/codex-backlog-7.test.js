/* Codex backlog fixes, backend batch 7 (2026-10-11). Delivery totals: delivery-fee-total.test.js. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#109 a download cut off mid-stream is handled, never an uncaught error', () => {
  assert.ok(!/fromWeb\([^)]*\)\.pipe\(res\)/.test(src), 'no bare .pipe(res) on a web stream');
  assert.ok((src.match(/pipeline\(Readable\.fromWeb\(r\.body\), res, \(e\) =>/g) || []).length >= 2);
});

test('#108 exempt sales show on the tax card even when every one is documented', () => {
  const card = after('Sales tax position</h2>', 1400);
  assert.match(card, /tile\('Exempt sales in ' \+ viewName/);
  assert.ok(card.indexOf('Exempt sales in') < card.indexOf('exemptUndocumented > 0'), 'outside the warning');
});

test('#158 a failed read after claiming the results email clears the claim', () => {
  const f = after('async function tellOwnerHiring(', 4500);
  const claim = f.indexOf('SET owner_told_at = NOW()');
  const tryAt = f.indexOf('try {');
  assert.ok(claim > -1 && tryAt > claim && tryAt < f.indexOf('await hireRounds(firstId)'));
  assert.match(f, /catch \(err\) \{[\s\S]*owner_told_at = NULL/);
});
