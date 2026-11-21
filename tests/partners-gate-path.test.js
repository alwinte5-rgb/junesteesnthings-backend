'use strict';
/* #470: with JT_PARTNERS off, //partners.html and /partners%2Ehtml skipped the
   /partners route and express.static served the page. The guard in server.js
   uses PARTNERS.isGatedPath, which answers for the path as static sees it.
   No server is started: the file static would send is worked out the way its
   `send` module does it (decode once, join to the root, normalize). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../tools/lib/partners');

const PUBLIC = path.join(__dirname, '..', 'public');
const PAGE = path.join(PUBLIC, 'partners.html');
const TRICKS = ['/partners.html', '//partners.html', '/partners%2Ehtml', '/partners%2ehtml',
  '/./partners.html', '/x/../partners.html', '///partners.html', '/%2Fpartners.html'];

/* The file express.static (send) would serve for a request path, or null. */
function staticFile(reqPath) {
  let p;
  try { p = decodeURIComponent(reqPath); } catch { return null; }
  if (p.includes('\0')) return null;
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) return null;
  return fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

test('every trick spelling reaches the gated page through the static files (the hole)', () => {
  for (const p of TRICKS) assert.equal(staticFile(p), PAGE, p);
});

test('isGatedPath catches every one of them', () => {
  for (const p of [...TRICKS, '/partners', '/PARTNERS.HTML', '/mail15', '//mail15.html', '/partners/']) {
    assert.equal(P.isGatedPath(p), true, p);
  }
  for (const p of ['/', '/partnership', '/contact.html', '/blog/partners-guide', '/%E0%A4%A', undefined]) {
    assert.equal(P.isGatedPath(p), false, String(p));
  }
  assert.ok(staticFile('/contact.html'), 'other pages are still served');
});

test('server.js runs the guard before the static files and the seasonal pages', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const guard = src.indexOf('PARTNERS.isGatedPath(req.path)');
  assert.ok(guard > 0, 'guard is wired');
  assert.ok(guard < src.indexOf('SEASONAL.isPage(rel)'), 'before the seasonal page handler');
  assert.ok(guard < src.indexOf("app.use(express.static(path.join(__dirname, 'public')"), 'before express.static');
});
