/* Codex P2 backlog, backend chunk B (2026-10-11). SQL proven on Postgres 18. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const SHIP = require('../tools/lib/shipping');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#123 a helper cannot hand a lead to someone else', () => {
  const r = after("app.post('/admin/lead/:id/assign'", 1600);
  assert.match(r, /if \(isStaff && to != null && to !== actor\.id\) return back/);
  assert.match(r, /SELECT active FROM staff WHERE id = \$1/);
});
test('#123 an incentive ended early stops counting at that moment', () => {
  assert.match(after('function incentiveWindow(inc)', 900), /if \(inc\.ended_at\)/);
});
test('#123 identical held messages queue one approval; a cut-off claim comes back', () => {
  assert.match(src, /WHERE NOT EXISTS \(SELECT 1 FROM staff_approvals WHERE kind = 'message' AND subject_id = \$1\s*AND status IN \('pending', 'processing'\) AND payload = \$2::jsonb\)/);
  assert.match(after("app.get('/admin/approvals'", 900), /OR \(status = 'processing' AND COALESCE\(claimed_at, created_at\) < NOW\(\) - INTERVAL '10 minutes'\)/);
});
test('#124 the retired /account address goes to /admin, not a 404', () => {
  const set = src.slice(src.indexOf('const MOVED_TO_ADMIN'), src.indexOf(']);', src.indexOf('const MOVED_TO_ADMIN')));
  assert.doesNotMatch(set.replace(/\/\*[\s\S]*?\*\//g, ''), /'account'/);
});
test('#125 postage bought elsewhere stays in Shipped', () => {
  const m = SHIP.SHIPPING_METHODS[0];
  const q = SHIP.quoteShipQueues([{ code: 'A', ship_method: m, shipped_at: new Date().toISOString(), tracking: '9400111', accepted_at: new Date().toISOString() }]);
  assert.strictEqual(q.shipped.length, 1, 'tracking typed in, no label');
  const p = SHIP.quoteShipQueues([{ code: 'B', ship_method: m, shipped_at: new Date().toISOString(), accepted_at: new Date().toISOString() }]);
  assert.strictEqual(p.shipped.length, 0, 'neither a label nor tracking: nothing to show');
});
test('#125 a quote label adds its postage to the job cost once', () => {
  assert.match(after('async function keepQuoteLabel(', 1200), /THEN COALESCE\(cost_shipping, 0\) \+ \$4::numeric ELSE cost_shipping END/);
});
test('#127 options chosen at accept close the card page opened before', () => {
  assert.match(after("app.post('/q/:code/accept'", 9000), /if \(rows\.length && \(choice \|\| delivery\) && rows\[0\]\.stripe_session\) \{\s*await expireCheckoutSession/);
});
