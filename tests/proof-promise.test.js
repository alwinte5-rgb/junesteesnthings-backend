'use strict';
/*
 * The site makes one promise about proofs, and it is the true one.
 *
 * Owner, 2026-10-29: orders built in the online designer print exactly as
 * submitted; a proof comes with designs we make for the customer (quotes)
 * and with Premium designs. Pages, FAQ rich results, staff canned replies and
 * the marketing guides all said "every order gets a proof", so a self-serve
 * buyer was promised a step that never happens.
 *
 * The wording is hand-written in a dozen places, so this scans for the
 * blanket phrasings instead of trusting one shared snippet.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Blanket promises: a proof on EVERY order, or before ANYTHING prints. */
const BLANKET = [
  /every order gets a proof/i,
  /proof for approval on every order/i,
  /review every order before it prints/i,
  /digital proof before anything is printed, and nothing goes to production/i,
  /seeing a proof before anything prints/i,
];

/* Where the blanket wording is still true: screen printing starts at 50 and is
   always quoted; the follow-up email goes to people who sent us their design;
   the canned reply keeps its old wording in `was` so live copies update. */
const ALLOWED = new Set([
  'public/services/screen-printing.html',
  'tools/lib/design-followups.js',
]);

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(html|json|js|md)$/.test(name)) out.push(p);
  }
  return out;
}

test('no page, reply or guide promises a proof on every order', () => {
  const files = walk(path.join(ROOT, 'public'), []).concat(walk(path.join(ROOT, 'tools', 'lib'), []));
  const hits = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (ALLOWED.has(rel)) continue;
    const s = fs.readFileSync(f, 'utf8');
    for (const re of BLANKET) if (re.test(s)) hits.push(rel + ': ' + re.source);
  }
  assert.deepStrictEqual(hits, []);
});

/* "7 to 14 days after proof approval" is true on the quoted print pages, but
   the holiday and gift pages sell to people who design it themselves too. */
test('holiday and gift pages start the clock at the order, or the proof if we design it', () => {
  const gen = fs.readFileSync(path.join(ROOT, 'tools', 'occasion-pages.js'), 'utf8');
  assert.ok(/7–14 after you order \(or approve your proof, if we design it\)/.test(gen));
  const data = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'data', 'occasion-pages.json'), 'utf8');
  assert.ok(!/after proof approval|after you approve the proof/.test(data));
});

test('the staff "proof" reply splits designer orders from designs we make', () => {
  const s = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const i = s.indexOf("shortcut: 'proof'");
  assert.ok(i > -1);
  const entry = s.slice(i, s.indexOf('kind:', i + 10));
  assert.ok(/If we are designing it for you, yes/.test(entry));
  assert.ok(/prints exactly as you made it/.test(entry));
  assert.ok(/was: \[`Yes\. We send a digital proof/.test(entry), 'old wording kept in was so live copies update');
});
