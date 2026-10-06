/* The job page (/admin/production/:code) holds everything about an order, and
   the owner could not find a way to it (2026-10-06): the Quotes board had no
   link at all and the dashboard's rows went elsewhere. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('a Quotes board card opens the job page from its name and an Open job button', () => {
  const card = src.slice(src.indexOf('return `<div class="card" id="q-${q.code}">'));
  const top = card.slice(0, 900);
  assert.match(top, /<a href="\/admin\/production\/\$\{q\.code\}"\s+style="color:#0B1F4B;text-decoration:none"><b>/);
  assert.match(card.slice(0, card.indexOf('>View as customer</a>')), /href="\/admin\/production\/\$\{q\.code\}">Open job<\/a>/);
});

test('a Production board card opens the job page from its name', () => {
  assert.match(src, /<a href="\/admin\/production\/\$\{q\.code\}" class="kcard-name">/);
  assert.match(src, /class="kbtn kbtn-link" href="\/admin\/production\/\$\{q\.code\}">Open job<\/a>/);
});

test('the dashboard finds an order: a quote code opens its job page, else a customer search', () => {
  assert.match(src, /<form method="get" action="\/admin\/find"/);
  const find = src.slice(src.indexOf("app.get('/admin/find'"));
  const body = find.slice(0, find.indexOf('\n});'));
  assert.match(body, /if \(QUOTE_CODE_RE\.test\(code\)\)/);
  assert.match(body, /res\.redirect\(`\/admin\/production\/\$\{code\}`\)/);
  assert.match(body, /res\.redirect\(`\/admin\/customer\?q=\$\{encodeURIComponent\(q\)\}`\)/, 'the search term is encoded');
  assert.doesNotMatch(src, /href: `\/admin\/quotes#q-\$\{escEmail\(q\.code\)\}`/, 'owed rows open the job, not the board');
});

test('Orders: the customer\'s name opens the job page; the customer page lists jobs by their job page', () => {
  assert.match(src, /<a href="\/admin\/production\/\$\{o\.code\}"><b>\$\{escEmail\(o\.name \|\| 'no name'\)\}<\/b><\/a>/);
  const cust = src.slice(src.indexOf("app.get('/admin/customer', requireAdmin"));
  assert.match(cust.slice(0, cust.indexOf('\n});')), /<td><a href="\/admin\/production\/\$\{r\.code\}">/);
});
