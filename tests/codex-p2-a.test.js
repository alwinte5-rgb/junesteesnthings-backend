/* Codex P2 backlog, backend chunk A (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#27 marketing email is not sent without a working unsubscribe link', () => {
  assert.match(after('async function sendEmail(', 900), /if \(marketing && !unsubSecret\(\)\) \{\s*throw new Error/);
});
test('#108 an exemption reference must be a string', () => {
  assert.match(after("app.post('/admin/quotes/:code/exemption'", 800), /typeof b\.tax_exempt_ref !== 'string'\) return res\.redirect\(back\)/);
});
test('#108 undocumented exempt sales are counted once across months', () => {
  assert.match(after('async function taxPositionByMonth(', 9000), /COUNT\(DISTINCT p\.quote_code\) FILTER \(WHERE NOT \$\{EXEMPT_DOCUMENTED_SQL\}\) AS n/);
});
test('#34 a photo that uploads on retry takes its failure back off', () => {
  assert.match(src, /if \(upFailedNames\[file\.name\] > 0\) \{\s*upFailedNames\[file\.name\]--; upFailed = Math\.max\(0, upFailed - 1\);/);
});
test('#35 a failed catalogue fetch is told apart from an empty one', () => {
  const g = after('async function getCatalog()', 1500);
  assert.equal((g.match(/failed: true/g) || []).length, 2);
  assert.match(src, /const catalogNote = catalog\.failed\s*\?/);
  assert.match(src, /The designer answered, but has no/);
});
test('#108 excluding a session excludes its charge in the backfill', () => {
  const t = fs.readFileSync(path.join(__dirname, '..', 'tools/backfill-unlinked.js'), 'utf8');
  assert.match(t, /if \(typeof s\.payment_intent === 'string'\) EXCLUDE\.add\(s\.payment_intent\);/);
});
