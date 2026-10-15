/* Reinstating an expired quote (owner, 2026-10-15). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('reinstate: only an expired, unaccepted, uncancelled quote; same prices, 14 more days; Cancel-and-restore permission', () => {
  const r = src.slice(src.indexOf("app.post('/admin/quote/:code/reinstate'"), src.indexOf("app.post('/admin/quote/:code/settle'"));
  assert.match(r, /if \(!quoteIsExpired\(q0\)\) return back\(/);
  assert.match(r, /SET valid_until = CURRENT_DATE \+ 14,\s*status = CASE WHEN viewed_at IS NOT NULL THEN 'viewed' ELSE 'sent' END/);
  assert.match(r, /accepted_at IS NULL AND cancelled_at IS NULL AND status NOT IN \('held', 'draft'\)/);
  assert.match(r, /snapshotQuote\(code, 'reinstate'/);
  assert.doesNotMatch(r, /items\s*=/, 'never re-prices the lines');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'tools', 'lib', 'staff.js'), 'utf8'),
    /'POST \/admin\/quote\/:code\/reinstate': 'quotes\.manage',/);
});
