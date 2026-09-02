'use strict';

/* An address from somebody who did NOT buy.
 *
 * Checkout already upserted a Brevo contact for anyone who got that far — but
 * it sent the email and nothing else. So a customer who typed their address,
 * reached the payment step and left had that address written into a pending
 * order row and nowhere a person markets from. The contact existed; it just had
 * no address on it. Issue #12.
 *
 * The rule that matters most here is about ERASURE. `updateEnabled` means Brevo
 * overwrites whatever it is handed, so a later, thinner call — a designer login
 * six months on, which knows an email and nothing else — would blank the
 * address that checkout captured. Absent has to beat empty.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const DESIGNER = path.join(ROOT, 'Lumise/Lumise-Product-Designer-PHP-ver2.0/lumise');

/* The attribute builder, lifted from the route so this tests what ships. */
const route = src.slice(src.indexOf("app.post('/api/crm-contact'"));
const build = vm.runInThisContext(`((body, source) => {
  const req = { body };
  ${route.slice(route.indexOf('const attrs = { SOURCE: source };'), route.indexOf('await brevo.post'))}
  return attrs;
})`);

test('a full billing block becomes Brevo attributes', () => {
  const a = build({
    first_name: 'Ada', last_name: 'Lovelace', address: '229 Broadway',
    city: 'Chicago', state: 'IL', zip: '60601', country: 'US', phone: '7735551234',
  }, 'order');
  assert.strictEqual(a.FIRSTNAME, 'Ada');
  assert.strictEqual(a.LASTNAME, 'Lovelace');
  assert.strictEqual(a.ADDRESS, '229 Broadway');
  assert.strictEqual(a.CITY, 'Chicago');
  assert.strictEqual(a.STATE, 'IL');
  assert.strictEqual(a.ZIP, '60601');
  assert.strictEqual(a.COUNTRY, 'US');
  assert.strictEqual(a.SMS, '7735551234');
  assert.strictEqual(a.SOURCE, 'order');
});

test('an email-only caller sends NO address attributes at all', () => {
  /* The erasure case. A designer login knows an email and nothing else; if it
     sent ADDRESS:'' Brevo would wipe the address checkout had captured. */
  const a = build({}, 'designer-login');
  assert.deepStrictEqual(Object.keys(a), ['SOURCE'],
    'nothing but SOURCE may be sent when there is no address');
});

test('blank and whitespace fields are dropped, not sent as empty', () => {
  const a = build({ address: '   ', city: '', zip: null, first_name: undefined }, 'x');
  assert.deepStrictEqual(Object.keys(a), ['SOURCE']);
});

test('a partial address sends only the parts that exist', () => {
  const a = build({ city: 'Chicago', zip: '60601' }, 'saved-cart');
  assert.deepStrictEqual(Object.keys(a).sort(), ['CITY', 'SOURCE', 'ZIP']);
});

test('oversized values are clamped rather than rejected', () => {
  /* Losing the contact entirely over a long street name would be worse than
     storing a truncated one. */
  const a = build({ address: 'x'.repeat(500), country: 'UNITED STATES' }, 'order');
  assert.strictEqual(a.ADDRESS.length, 120);
  assert.strictEqual(a.COUNTRY, 'UN', 'country is a 2-letter code');
});

/* ── the designer half has to actually send it ───────────────────────────── */

const auth = fs.readFileSync(path.join(DESIGNER, 'jt-auth.php'), 'utf8');
const conn = fs.readFileSync(path.join(DESIGNER, 'php_connector.php'), 'utf8');

test('jt_crm_contact accepts an address and omits empties', () => {
  const fn = auth.slice(auth.indexOf('function jt_crm_contact'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /\$address = null/, 'optional, so existing callers are unchanged');
  assert.match(body, /if \(\$v !== ''\) \$payload\[\$f\] = \$v;/,
    'an empty field must not be sent — it would erase the stored one');
});

test('checkout passes the billing block, before payment', () => {
  /* Before payment is the whole point: a customer who pays is captured
     anyway, a customer who abandons is the one this exists for. */
  assert.match(conn, /jt_crm_contact\(strtolower\(trim\(\$_POST\['email'\]\)\), 'order', \$jt_addr\)/);
  assert.match(conn, /foreach \(array\('first_name', 'last_name', 'address', 'city',/);
});

test('the address is only sent once validation has passed', () => {
  /* jt_validate_billing() runs earlier in process_checkout, so what reaches
     the CRM is an address the shop would have shipped to. */
  const vIdx = conn.indexOf('jt_validate_billing');
  const cIdx = conn.indexOf("jt_crm_contact(strtolower");
  assert.ok(vIdx > -1 && cIdx > vIdx, 'validation must come first');
});
