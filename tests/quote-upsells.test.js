/* Upsell ideas on the quote form (the owner, 2026-10-06). The behaviour is
   driven in a real browser by ~/.local/share/jtees-e2e/run-upsell.cjs (32
   checks); these pin the wiring that run depends on. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the ideas are worked out from the same priceLine() call the totals use', () => {
  assert.match(src, /var r = priceLine\(plArgs\);/);
  assert.match(src, /upInfo\.push\(\{ L: L, isOpt: isOpt, qty: qty,/);
  /* An idea that throws must never take the totals down with it. */
  assert.match(src, /try \{ renderUpsells\(upInfo\); \} catch \(e\) \{/);
});

test('Apply & save saves at once: a new quote as a draft, never sent', () => {
  assert.match(src, /var btn = UP_CAN_DRAFT \? document\.getElementById\('qfdraft'\) : document\.getElementById\('qfgo'\);/);
  assert.match(src, /if \(upsellReturn\) return res\.redirect\(303, `\/admin\/quote\/\$\{code\}\/edit\?up=1`\);/);
  /* An edit returns to the form BEFORE anything is emailed. */
  const ret = src.indexOf('if (upsellReturn && existingQuote && !wasDraft) return res.redirect');
  assert.ok(ret > -1 && ret < src.indexOf('const emailed = (!existingQuote || wasDraft) && q.email ? await emailQuote(q) : null;'));
});

test('every upsell is named in the quote history and kept on the quote', () => {
  assert.match(src, /snapshotQuote\(editing, upsellsApplied\.length \? 'upsell: ' \+ upsellsApplied\[upsellsApplied\.length - 1\] : 'edit'/);
  assert.match(src, /upsell_log = COALESCE\(upsell_log, '\[\]'::jsonb\) \|\| \$3::jsonb/);
  assert.match(src, /ADD COLUMN IF NOT EXISTS upsell_ideas JSONB/);
  assert.match(src, /ADD COLUMN IF NOT EXISTS upsell_log JSONB/);
});

test('a helper sees no Apply button on an accepted or paid job', () => {
  assert.match(src, /const upLocked = isEdit && !isOwner\(\) && !!\(existing\.accepted_at \|\| Number\(existing\.paid_amount \|\| 0\) > 0\);/);
  assert.match(src, /i\.apply && !UP_LOCKED \?/);
});

test('ideas are escaped before they reach the page', () => {
  assert.match(src, /'<span style="font-size:13\.5px">' \+ upEsc\(i\.text\) \+ '<\/span>'/);
  assert.match(src, /<li style="margin:3px 0">\$\{escEmail\(t\)\}<\/li>/);
});
