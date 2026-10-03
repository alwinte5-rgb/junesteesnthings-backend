/**
 * jtees.net -> www.jtees.net, page loads only.
 *
 * Run: node tests/apex-redirect.test.js
 *
 * Both hosts served the same pages, splitting search ranking. The redirect
 * must never move a POST, a webhook or an API call (a 301 on a POST turns it
 * into a GET and the body is lost), nor the staff host. The middleware is
 * pulled out of server.js and run, so the test cannot drift from it.
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const m = /app\.use\(\(req, res, next\) => \{\n  const host = String\(req\.headers\.host[\s\S]*?\n\}\);/.exec(src);
assert.ok(m, 'apex redirect middleware found in server.js');
const before = src.indexOf(m[0]) < src.indexOf('app.use(express.static(');
assert.ok(before, 'runs before static files');

function run(STAFF_HOST, req) {
  let mw;
  new Function('app', 'STAFF_HOST', m[0])({ use: (fn) => { mw = fn; } }, STAFF_HOST);
  const out = { next: false, status: 0, to: '' };
  mw({ method: 'GET', path: '/', originalUrl: '/', ...req, headers: { host: req.host } },
     { redirect: (s, to) => { out.status = s; out.to = to; } }, () => { out.next = true; });
  return out;
}

let r = run('staff.jtees.net', { host: 'jtees.net', path: '/services/embroidery.html', originalUrl: '/services/embroidery.html?utm_source=g' });
assert.deepStrictEqual([r.status, r.to], [301, 'https://www.jtees.net/services/embroidery.html?utm_source=g']);
r = run('staff.jtees.net', { host: 'JTEES.NET:443' });
assert.strictEqual(r.to, 'https://www.jtees.net/');
console.log('ok   jtees.net page loads move to www, path and query kept');

assert.ok(run('staff.jtees.net', { host: 'www.jtees.net' }).next, 'www is served');
assert.ok(run('staff.jtees.net', { host: 'staff.jtees.net' }).next, 'staff host is served');
assert.ok(run('jtees.net', { host: 'jtees.net' }).next, 'apex is never moved when it is the staff host');
console.log('ok   www and the staff host are untouched');

assert.ok(run('s', { host: 'jtees.net', method: 'POST', path: '/submit' }).next, 'POST is answered where it lands');
assert.ok(run('s', { host: 'jtees.net', path: '/api/shop-feed' }).next, '/api is not moved');
assert.ok(run('s', { host: 'jtees.net', path: '/webhooks/stripe' }).next, '/webhooks is not moved');
assert.ok(run('s', { host: 'jtees.net', method: 'HEAD' }).status === 301, 'HEAD is moved like GET');
console.log('ok   POSTs, API calls and webhooks are never redirected');
