'use strict';

/* The books app, served at jtees.net/books.
 *
 * `books` is a separate Railway service with NO public domain — its only
 * address is books.railway.internal. This proxy is the single door to it, which
 * means the door has to be built correctly: every failure below produces a page
 * that half works, which is worse than one that plainly does not.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const PROXY = (() => {
  const i = src.indexOf("app.use('/books'");
  assert.notStrictEqual(i, -1, 'the /books proxy should exist');
  return src.slice(i, i + 3200);
})();

test('the proxy is mounted BEFORE the body parsers', () => {
  /* Once express.json has consumed the stream, forwarding a POST means
     re-serialising what was parsed — which silently changes multipart bodies
     and anything the parser did not recognise. Mounted first, `req` is still
     an untouched stream and is piped through as it arrived. */
  const proxyAt = src.indexOf("app.use('/books'");
  const jsonAt = src.indexOf('app.use(express.json(');
  const urlencodedAt = src.indexOf('app.use(express.urlencoded(');

  assert.ok(proxyAt < jsonAt, 'the proxy must come before express.json');
  assert.ok(proxyAt < urlencodedAt, 'the proxy must come before express.urlencoded');
});

test('the /books prefix is NOT stripped', () => {
  /* Next is configured with basePath "/books", so it generates its own asset,
     route and auth-callback URLs already carrying the prefix. Rewriting
     /books/x to /x serves the first page and then hands the browser links to
     /_next/... that do not exist on this domain. */
  assert.match(PROXY, /BOOKS_ORIGIN \+ req\.originalUrl/,
    'originalUrl keeps the prefix; req.url inside app.use() has it stripped');
});

test('hop-by-hop headers are not relayed', () => {
  /* They describe THIS connection. Forwarding Connection or
     Transfer-Encoding to another server is a protocol error that some proxies
     tolerate and others do not, which makes it an intermittent bug. */
  for (const h of ['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade']) {
    assert.match(PROXY, new RegExp(`'${h}'`), `${h} should be dropped`);
  }
});

test('forwarded proto and host are set, so redirects point somewhere real', () => {
  /* Without these Next sees books.railway.internal and puts that hostname in a
     302. The browser cannot resolve it, and the symptom is a login that
     appears to hang. */
  assert.match(PROXY, /x-forwarded-proto'\] = 'https'/);
  assert.match(PROXY, /x-forwarded-host'\] = req\.headers\.host/);
});

test('redirects are passed through, not followed', () => {
  /* A 302 from the books app is an instruction for the browser. Following it
     here returns the destination's body under the original URL, which breaks
     every login round trip in a way that looks like a caching bug. */
  assert.match(PROXY, /redirect: 'manual'/);
});

test('multiple Set-Cookie headers stay multiple', () => {
  /* Iterating a Headers object joins them with a comma, producing one
     malformed cookie. The session then silently fails to set and the user is
     logged out on every navigation. getSetCookie is the only correct reader. */
  assert.match(PROXY, /getSetCookie/,
    'set-cookie must be read as a list');
  assert.match(PROXY, /if \(k === 'set-cookie'\) continue;/,
    'and must be skipped in the plain header loop, or it is set twice');
});

test('upstream content-length and encoding are not copied', () => {
  /* They describe the upstream body. Copied onto a response whose body has
     been decoded and re-streamed, they disagree with what is actually sent and
     the browser truncates the page. */
  for (const h of ['content-encoding', 'content-length']) {
    assert.match(PROXY, new RegExp(`'${h}'`), `${h} should be dropped`);
  }
});

test('a body is only forwarded when there is one', () => {
  /* fetch rejects a GET that carries a body, so proxying a plain page view
     would throw rather than render. */
  assert.match(PROXY, /const hasBody = !\['GET', 'HEAD'\]\.includes\(req\.method\)/);
  assert.match(PROXY, /duplex: hasBody \? 'half' : undefined/,
    'undici requires duplex when the body is a stream');
});

test('a dead books service does not read as a broken jtees.net', () => {
  assert.match(PROXY, /AbortSignal\.timeout\(/, 'a hung upstream must not hang this app');
  assert.match(PROXY, /status\(502\)/, 'an upstream failure is a 502, not a 500');
  assert.match(PROXY, /if \(!res\.headersSent\)/,
    'the stream may already have started; writing a second status throws');
  assert.doesNotMatch(PROXY, /res\.send\(err/, 'never return the upstream error to the browser');
});

test('an unconfigured environment says so instead of guessing a host', () => {
  /* BOOKS_ORIGIN is absent on any environment without a books service. A
     default of books.railway.internal would make every /books request hang for
     the full timeout rather than answer immediately. */
  assert.match(PROXY, /if \(!BOOKS_ORIGIN\)/);
  assert.match(src, /const BOOKS_ORIGIN = process\.env\.BOOKS_ORIGIN \|\| ''/);
});
