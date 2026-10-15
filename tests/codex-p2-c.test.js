/* Codex P2 backlog, backend chunk C (2026-10-11). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };

test('#123 the morning email goes out for approvals even with no live jobs', () => {
  assert.match(src, /if \(!live\.length && !ship && !healthHtml && !teamFirst\) return;/);
});
test('#124 a Cloudflare key-fetch failure names the service, route and reason', () => {
  const cf = fs.readFileSync(path.join(__dirname, '..', 'tools/lib/cf-access.js'), 'utf8');
  assert.match(cf, /Cloudflare Access GET \$\{where\}: HTTP \$\{res\.status\}/);
  assert.match(cf, /timed out/);
});
test('#123 the job page shows only the controls this account may use', () => {
  const p = after("app.get('/admin/production/:code'", 12000);
  assert.match(p, /const may = \(route\) => STAFF\.mayUseRoute\(currentActor\(\) \|\| OWNER_ACTOR, 'POST', route\);/);
  for (const g of ['st.manual && mayStep', '!mayStage ?', '!q.needed_by && mayTarget', 'q.email && mayEmail']) assert.ok(p.includes(g), g);
});
test('#125 only someone who may buy labels sees Buy', () => {
  assert.match(after('function shipRatesHtml(', 1600), /\$\{canBuy \? `<div class="ship-buy">/);
});
test('#125 a quote label bought but not saved is said, with its PDF', () => {
  assert.match(after("app.post('/admin/shipping/buy'", 4000), /catch \(e\) \{\s*console\.error\(`label for \$\{r\.ref\} bought but not saved:`/);
});
test('#125 the address cannot change while its label is being bought', () => {
  assert.match(after("app.post('/admin/shipping/buy'", 4000), /SET ship_label = jsonb_build_object\('buying', NOW\(\)\)/);
  assert.match(after("app.post('/admin/shipping/address'", 2500), /COALESCE\(\(ship_label->>'buying'\)::timestamptz, 'epoch'\) < NOW\(\) - INTERVAL '5 minutes'/);
});
