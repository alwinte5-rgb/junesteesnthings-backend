'use strict';
/* #470: with JT_PARTNERS off, //partners.html and /partners%2Ehtml skipped the
   /partners route and express.static served the page. The guard in server.js
   uses PARTNERS.isGatedPath, which answers for the path as static sees it. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const P = require('../tools/lib/partners');

const PUBLIC = path.join(__dirname, '..', 'public');
const TRICKS = ['/partners', '/partners.html', '//partners.html', '/partners%2Ehtml',
  '/partners%2ehtml', '/./partners.html', '/x/../partners.html', '///partners.html'];

function get(server, p) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    http.get({ host: '127.0.0.1', port, path: p }, (res) => { res.resume(); resolve(res.statusCode); })
      .on('error', reject);
  });
}

async function serve(guard) {
  const app = express();
  if (guard) app.use((req, res, next) => (P.isGatedPath(req.path) ? res.status(404).end() : next()));
  app.use(express.static(PUBLIC, { extensions: ['html'] }));
  return new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
}

test('isGatedPath sees through slashes, escapes, dot segments and case', () => {
  for (const p of [...TRICKS, '/PARTNERS.HTML', '/mail15', '//mail15.html', '/partners/']) {
    assert.equal(P.isGatedPath(p), true, p);
  }
  for (const p of ['/', '/partnership', '/contact.html', '/blog/partners-guide', '/%E0%A4%A', undefined]) {
    assert.equal(P.isGatedPath(p), false, String(p));
  }
});

test('without the guard, express.static hands out the gated page (the hole)', async () => {
  const s = await serve(false);
  try {
    assert.equal(await get(s, '//partners.html'), 200);
    assert.equal(await get(s, '/partners%2Ehtml'), 200);
  } finally { s.close(); }
});

test('with the guard, no spelling of the address reaches the page', async () => {
  const s = await serve(true);
  try {
    for (const p of TRICKS) assert.equal(await get(s, p), 404, p);
    assert.equal(await get(s, '/contact.html'), 200);
  } finally { s.close(); }
});

test('server.js runs the guard before the static files and the seasonal pages', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const guard = src.indexOf('PARTNERS.isGatedPath(req.path)');
  assert.ok(guard > 0, 'guard is wired');
  assert.ok(guard < src.indexOf('SEASONAL.isPage(rel)'), 'before the seasonal page handler');
  assert.ok(guard < src.indexOf("app.use(express.static(path.join(__dirname, 'public')"), 'before express.static');
});
