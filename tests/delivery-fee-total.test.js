/* Codex #143: choosing local delivery puts the fee into the total and deposit
   on screen, the way the accept route charges it; pickup takes it back out. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const at = src.indexOf('function acceptDeliveryHtml(');
assert.ok(at > -1, 'acceptDeliveryHtml not found in server.js');
const fnSrc = src.slice(at, src.indexOf('\n}\n', at) + 2);
const acceptDeliveryHtml = vm.runInThisContext(`(function(SHIP, escEmail, DELIV, DELIVERY_CSS, SMS_PICKUP, SLOT_DAYS_SHOWN,
  DEPOSIT_PC, DEPOSIT_FULL_UNDER, CARD_FEE, round2){ return ${fnSrc.replace(/^function acceptDeliveryHtml/, 'function')}; })`)(
  { cleanShipTo: () => ({ zip: '60601' }) }, (x) => String(x), { slotProblem: () => '' }, '', 'the shop', 7,
  0.5, 100, 0.04, (n) => Math.round(n * 100) / 100);

function page(total, { local = true, options = false } = {}) {
  const html = acceptDeliveryHtml({ code: 'JT-TEST', ship_method: local ? 'local' : '' }, { query: {} }, { total });
  const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const els = {};
  const el = (id) => (els[id] ||= { id, innerHTML: '', textContent: '', value: id === 'qdzip' ? '60601' : '', style: {}, addEventListener() {} });
  const radios = [{ value: 'pickup', checked: !local, addEventListener(_, f) { this.f = f; } },
                  { value: 'local', checked: local, addEventListener(_, f) { this.f = f; } }];
  let answer = null;
  const ctx = {
    document: {
      getElementById: el,
      querySelector: (q) => (q.includes(':checked') ? radios.find((r) => r.checked) : el(q)),
      querySelectorAll: () => radios,
    },
    fetch: () => ({ then: (f) => ({ then: (g) => ({ catch() { g(answer); } }) }) }),
    window: {}, Array, Number, Math, String, JSON,
  };
  if (options) ctx.window.jtUpdate = () => { ctx.updated = (ctx.updated || 0) + 1; };
  return { run(a) { answer = a; vm.runInNewContext(script, ctx); }, els, radios, ctx };
}

test('a delivery fee is added to the total, the deposit and both pay amounts', () => {
  const p = page(300);
  p.run({ available: true, fee: 25, zone: { name: 'North' }, days: [] });
  assert.strictEqual(p.els.qtotal.innerHTML, '$325.00');
  assert.strictEqual(p.els.qdep.innerHTML, '$162.50', 'deposit is half the new total');
  assert.strictEqual(p.els.qdel.innerHTML, '$25.00');
  assert.strictEqual(p.els.qdelrow.style.display, '');
  assert.strictEqual(p.els.qpayc.innerHTML, '$169.00', 'card amount includes its 4% on the new deposit');
});

test('switching back to pickup takes the fee out again', () => {
  const p = page(300);
  p.run({ available: true, fee: 25, zone: { name: 'North' }, days: [] });
  p.radios[1].checked = false; p.radios[0].checked = true;
  p.radios[0].f();
  assert.strictEqual(p.els.qtotal.innerHTML, '$300.00');
  assert.strictEqual(p.els.qdelrow.style.display, 'none');
});

test('no delivery in that ZIP leaves the total at the pickup price', () => {
  const p = page(300);
  p.run({ available: false, message: 'Not in that area.' });
  assert.strictEqual(p.els.qtotal.innerHTML, '$300.00');
});

test('a quote with options recomputes through its own script, which reads the fee', () => {
  const p = page(300, { options: true });
  p.run({ available: true, fee: 25, zone: { name: 'North' }, days: [] });
  assert.strictEqual(p.ctx.window.jtDelivFee, 25);
  assert.ok(p.ctx.updated >= 1);
  assert.match(src, /var total = r2\(net \+ tax \+ dfee\);/, 'the options script adds it after tax');
});
