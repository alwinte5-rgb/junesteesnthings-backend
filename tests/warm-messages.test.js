/* Warm texts with a link, reminders by text, and texts that become leads
 * (server.js, tools/lib/sms-templates.js). Owner, 2026-10-05.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { T, isGsm7 } = require('../tools/lib/sms-templates');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function liftFn(name) {
  let at = src.indexOf(`function ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  if (src.slice(at - 6, at) === 'async ') at -= 6;
  let i = src.indexOf('(', at);
  for (let paren = 0; i < src.length; i++) {
    if (src[i] === '(') paren++;
    else if (src[i] === ')' && --paren === 0) { i++; break; }
  }
  let depth = 0;
  for (i = src.indexOf('{', i); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

const worst = { code: 'ABCDEFGHIJ', first: 'Christopher Alexander', link: 'https://www.jtees.net/q/ABCDEFGHIJ',
                amount: 12345.67, stillDue: 9999.99, due: 9999.99, tracking: '9400 1000 0000 0000 0000 00',
                orderId: 1234567, ref: 'ABCDEFGHIJ', when: 'Thursday Oct 9, 2-4pm', window: '2-4pm' };

test('every order text is warm, links to the website, and fits two segments', () => {
  for (const [name, build] of Object.entries(T)) {
    const m = build({ ...worst, restoreUrl: 'https://design.jtees.net/r/abc' });
    assert.ok(isGsm7(m.body), `${name} is not GSM-7: ${m.body}`);
    assert.ok(m.body.length <= 306, `${name} is ${m.body.length} chars`);
    assert.match(m.body, /https:\/\/(www|design)\.jtees\.net/, `${name} has no website link`);
    assert.match(m.body, /Reply STOP to opt out\.$/, `${name} has no opt-out`);
  }
});

test('order texts greet by first name and link to the order itself', () => {
  for (const name of ['paymentReceived', 'inProduction', 'readyForPickup', 'shipped', 'quoteFollowup',
                      'depositReminder', 'balanceReminder', 'pickupReminder']) {
    const body = T[name](worst).body;
    assert.match(body, /Christopher/, `${name} does not use their name`);
    assert.doesNotMatch(body, /Alexander/, `${name} uses their whole name`);
    assert.match(body, /https:\/\/www\.jtees\.net\/q\/ABCDEFGHIJ/, `${name} does not link to the order`);
  }
  assert.match(T.inProduction({ code: 'AB' }).body, /^June's Tees: Good news! /, 'no name, no dangling comma');
});

test('the new reminders each have their own dedupe key', () => {
  const keys = ['quoteFollowup', 'depositReminder', 'balanceReminder', 'pickupReminder'].map((n) => T[n](worst).template);
  assert.strictEqual(new Set(keys).size, keys.length);
});

test('reminders only text in the daytime, Chicago time', () => {
  const { inTextingHours } = vm.runInThisContext(`(function () { ${liftFn('inTextingHours')} return { inTextingHours }; })`)();
  assert.strictEqual(inTextingHours(new Date('2026-10-05T14:00:00Z')), true, '9am Chicago');
  assert.strictEqual(inTextingHours(new Date('2026-10-05T13:59:00Z')), false, '8:59am');
  assert.strictEqual(inTextingHours(new Date('2026-10-05T22:59:00Z')), true, '5:59pm');
  assert.strictEqual(inTextingHours(new Date('2026-10-05T23:00:00Z')), false, '6pm (owner, 2026-10-05)');
  const sweep = src.slice(src.indexOf('if (inTextingHours()) {'), src.indexOf('if (inTextingHours()) {') + 400);
  for (const s of ['sendQuoteFollowUps', 'sendDepositReminders', 'sendBalanceReminders', 'sendPickupReminders']) {
    assert.ok(sweep.includes(s), `${s} runs outside texting hours`);
  }
});

/* textToLead against a fake pool that answers by the SQL it is given. */
function textLead({ jobs = [], open = [], known = [] } = {}) {
  const calls = [];
  const pool = { query: async (sql, args) => {
    calls.push({ sql, args });
    if (/FROM quotes/.test(sql)) return { rows: jobs };
    if (/INSERT INTO lead_notes/.test(sql)) return { rows: [] };
    if (/INSERT INTO submissions/.test(sql)) return { rows: [{ id: 77 }] };
    if (/WHERE dedupe_key = \$1/.test(sql)) return { rows: [] };
    if (/source = 'text'/.test(sql)) return { rows: open };
    if (/name NOT LIKE/.test(sql)) return { rows: known };
    return { rows: [] };
  } };
  const ctx = vm.createContext({ pool });
  vm.runInContext(liftFn('textToLead') + ';this.f = textToLead;', ctx);
  return { f: ctx.f, calls };
}

test('a text from someone with no job becomes a lead, ready to quote', async () => {
  const { f, calls } = textLead();
  assert.deepStrictEqual({ ...(await f('+17735550100', 'Do you do hoodies?', 'SM1')) }, { lead: 77 });
  const ins = calls.find((c) => /INSERT INTO submissions/.test(c.sql));
  assert.match(ins.sql, /'text'\)/);
  assert.match(ins.sql, /ON CONFLICT \(dedupe_key\) WHERE dedupe_key IS NOT NULL DO NOTHING/, 'Twilio retries add nothing');
  assert.deepStrictEqual([...ins.args], ['Text from (773) 555-0100', '+17735550100', 'Do you do hoodies?', 'sms:SM1']);
});

test('a text from a customer with a job goes to the job, not Leads', async () => {
  const { f, calls } = textLead({ jobs: [{ code: 'AB12CD' }] });
  assert.deepStrictEqual({ ...(await f('+17735550100', 'When is it ready?', 'SM2')) }, { quote: 'AB12CD' });
  assert.ok(!calls.some((c) => /INSERT/.test(c.sql)));
});

test('a second text while the lead is open is a note on it, not a second lead', async () => {
  const { f, calls } = textLead({ open: [{ id: 5 }] });
  assert.deepStrictEqual({ ...(await f('+17735550100', 'Also need 20 hats', 'SM3')) }, { lead: 5 });
  assert.ok(calls.some((c) => /INSERT INTO lead_notes/.test(c.sql) && c.args[0] === 5));
  assert.ok(!calls.some((c) => /INSERT INTO submissions/.test(c.sql)));
});

test('a known name is used rather than the number', async () => {
  const { f, calls } = textLead({ known: [{ name: 'Tom Koleno' }] });
  await f('+17735550100', 'hi', 'SM4');
  assert.strictEqual(calls.find((c) => /INSERT INTO submissions/.test(c.sql)).args[0], 'Tom Koleno');
});

test('phone matching compares digits, with the backslash surviving the template string', () => {
  assert.match(liftFn('textToLead'), /regexp_replace\(COALESCE\(phone, ''\), '\\\\D', '', 'g'\)/);
});
