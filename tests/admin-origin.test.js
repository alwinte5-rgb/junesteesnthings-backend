/* Admin forms and the cross-site guard (2026-09-30).
 *
 * Run: node --test tests/*.test.js
 *
 * From 2026-09-25 every admin form save was refused with a bare "Forbidden".
 * helmet's default Referrer-Policy is no-referrer, and under it a browser sends
 * `Origin: null` on a form POST even to its own site (Safari 26 and Chrome both
 * do; run-admin-post.cjs on the e2e harness drives a real one). The guard read
 * null as another website. What these guard:
 *
 * 1. The pages ask for same-origin, so the site's own forms carry their Origin.
 * 2. A null Origin is let through only when Sec-Fetch-Site, which no page
 *    script can set, says the request came from this very origin.
 * 3. Everything the guard refused before, it still refuses.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error('unbalanced');
}
const sites = src.match(/^const SITE_ORIGINS = .*;$/m)[0];
const fromAnotherSite = vm.runInNewContext(`${sites}\n${lift('fromAnotherSite')}\nfromAnotherSite`);
const req = (headers) => ({ headers });

test('the pages ask browsers for same-origin, not no-referrer', () => {
  assert.match(src, /app\.use\(helmet\(\{[\s\S]{0,900}referrerPolicy: \{ policy: 'same-origin' \}/);
});

test('this site\'s own forms pass, with or without a real Origin', () => {
  assert.strictEqual(fromAnotherSite(req({ origin: 'https://www.jtees.net' })), false);
  assert.strictEqual(fromAnotherSite(req({ origin: 'https://jtees.net' })), false);
  assert.strictEqual(fromAnotherSite(req({ origin: 'null', 'sec-fetch-site': 'same-origin' })), false,
    'Safari and Chrome under no-referrer: the quote form that was refused');
  assert.strictEqual(fromAnotherSite(req({})), false, 'no Origin is not a browser form, as before');
});

test('another website is still refused, however it dresses up', () => {
  assert.strictEqual(fromAnotherSite(req({ origin: 'https://evil.example.com' })), true);
  assert.strictEqual(fromAnotherSite(req({ origin: 'null', 'sec-fetch-site': 'cross-site' })), true);
  assert.strictEqual(fromAnotherSite(req({ origin: 'null' })), true, 'nothing vouches for a bare null');
  assert.strictEqual(fromAnotherSite(req({ origin: 'null', 'sec-fetch-site': 'same-site' })), true,
    'same-site would admit every jtees.net subdomain, not the three listed');
  assert.strictEqual(fromAnotherSite(req({ origin: 'http://www.jtees.net' })), true, 'plain http is not this site');
});

test('both guarded doors use the one rule', () => {
  assert.match(src, /app\.post\('\/signout', \(req, res\) => \{\n  if \(fromAnotherSite\(req\)\) return res\.status\(403\)\.send\('Forbidden'\);/);
  assert.match(src, /if \(!\['GET', 'HEAD'\]\.includes\(req\.method\) && fromAnotherSite\(req\)\) \{\n    return res\.status\(403\)\.send\('Forbidden'\);/);
  assert.doesNotMatch(src, /origin && !SITE_ORIGINS\.includes\(origin\)/, 'a copy of the old null-blind check survives');
});
