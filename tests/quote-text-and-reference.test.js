/* Quote by text beside email, and the customer's picture on the quote form
   (owner, 2026-10-19). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };
const fnSrc = (name) => {
  const i = src.indexOf(`function ${name}(`);
  assert.ok(i > -1, name);
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j + 2);
};
const SMS = require('../tools/lib/sms-templates');
const STAFF = require('../tools/lib/staff');
const QPHOTOS = require('../tools/lib/quote-photos');

test('a helper who may email the quote may text it, and nobody else', () => {
  assert.strictEqual(STAFF.permForRoute('POST', '/admin/quote/:code/text'), STAFF.permForRoute('POST', '/admin/quote/:code/email'));
});

test('the text route refuses what the email route refuses, and records only a sent text', () => {
  const r = after("app.post('/admin/quote/:code/text', requireAdmin", 2600);
  assert.match(r, /actorLevel\('quotes\.view'\) !== 'on'/);
  assert.match(r, /q\.status === 'held' \|\| q\.status === 'draft' \|\| q\.cancelled_at/);
  assert.match(r, /Number\(q\.paid_amount\) > 0/);
  assert.match(r, /const status = await textQuote\(q\);/);
  const t = fnSrc('textQuote');
  assert.match(t, /kind: 'transactional'/);
  const sent = t.indexOf("if (status === 'sent')");
  assert.ok(sent > -1 && t.indexOf('sent_to_customer_at') > sent, 'marked sent only after the text went');
});

test('"Email and text it": same permission and refusals, each part reported as it went', () => {
  assert.strictEqual(STAFF.permForRoute('POST', '/admin/quote/:code/send'), STAFF.permForRoute('POST', '/admin/quote/:code/email'));
  const r = after("app.post('/admin/quote/:code/send', requireAdmin", 2400);
  assert.match(r, /actorLevel\('quotes\.view'\) !== 'on'/);
  assert.match(r, /q\.status === 'held' \|\| q\.status === 'draft' \|\| q\.cancelled_at/);
  assert.match(r, /Number\(q\.paid_amount\) > 0/);
  assert.ok(r.indexOf('Number(q.paid_amount) > 0') < r.indexOf('emailQuote(q)'), 'refused before anything goes');
  assert.match(r, /await emailQuote\(q\)[\s\S]*await textQuote\(q\)/, 'the text goes even when the email did not');
  assert.match(r, /r\.ok && status === 'sent' \? 'ok' : 'err'/, 'success only when both went');
});

test('the send buttons show only to someone allowed to press them', () => {
  const ready = after("const mayEmail = !!q.email && STAFF.mayUseRoute(actor, 'POST', '/admin/quote/:code/email');", 4000);
  assert.match(ready, /mayEmail && textByShop && STAFF\.mayUseRoute\(actor, 'POST', '\/admin\/quote\/:code\/send'\)/);
  assert.match(ready, /\$\{mayEmail \? `<form method="POST" action="\/admin\/quote\/\$\{code\}\/email"/, 'no Email button a helper is refused on');
  assert.doesNotMatch(ready.slice(0, ready.indexOf('Copy message')), /\$\{q\.email \? `<form method="POST" action="\/admin\/quote\/\$\{code\}\/email"/);
  assert.match(src, /const mayBoth = !!q\.email && mayEmail && textWay === 'shop' && may\('\/admin\/quote\/:code\/send'\);/);
});

test('the quote text is plain, branded, linked and carries the opt-out', () => {
  const m = SMS.T.quote({ first: 'Ethan', what: '70 tees — “black”', until: 'Nov 2', link: 'https://www.jtees.net/q/AB12CD' });
  assert.strictEqual(m.template, 'quote');
  const body = m.body;
  assert.match(body, /^June's Tees: Hi Ethan, your quote for /);
  assert.ok(body.includes('jtees.net/q/AB12CD'), body);
  assert.ok(body.endsWith('Reply STOP to opt out.'), body);
  assert.ok(/^[\x20-\x7E]+$/.test(body), 'plain characters only: ' + body);
  assert.match(SMS.T.quote({ first: '', what: '', until: '', link: 'x' }).body, /^June's Tees: Hi, your quote for your order is ready/);
});

test('no text button for a quote the route would refuse', () => {
  assert.match(fnSrc('quoteTextWay'), /\['held', 'draft'\]\.includes\(q\.status\) \|\| q\.cancelled_at \|\| Number\(q\.paid_amount\) > 0\) return ''/);
  assert.match(fnSrc('quoteTextControl'), /onsubmit="this\.querySelector\('button'\)\.disabled=true"/);
  assert.match(fnSrc('textQuote'), /ref: `quote-text:\$\{q\.code\}:r\$\{q\.revision \|\| 1\}:/);
});

test('a quote text that is not delivered un-sends a quote that went no other way', () => {
  const r = fnSrc('recordSmsDelivery');
  assert.match(r, /rows\[0\]\.template === 'quote'/);
  assert.match(r, /SET sent_to_customer_at = NULL[\s\S]*emailed_at IS NULL AND accepted_at IS NULL/);
});

const card = (lead, quote) => {
  const ctx = { QPHOTOS: { ...QPHOTOS, cloudName: () => 'shop' }, fmtDate: () => 'Oct 19',
    escEmail: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') };
  vm.runInNewContext(fnSrc('leadPhotoTile') + fnSrc('quoteReferenceCard') + '; this.out = quoteReferenceCard(args);', Object.assign(ctx, { args: { lead, quote } }));
  return ctx.out;
};
const leadPhoto = 'https://res.cloudinary.com/shop/image/upload/v1/quote_requests/abc.jpg';
const jobFile = 'https://res.cloudinary.com/shop/image/upload/v1/quote_photos/xyz.png';

test('the quote form shows what the customer sent, escaped', () => {
  const html = card({ id: 7, description: 'Logo <b>front</b>', photo_url: leadPhoto, created_at: '2026-10-19' }, null);
  assert.ok(html.includes('What they sent'));
  assert.ok(html.includes(leadPhoto), 'the lead photo is shown');
  assert.ok(html.includes('Logo &lt;b&gt;front&lt;/b&gt;') && !html.includes('<b>front'), 'the request is escaped');
});

test('the lead photo is a small thumbnail of the original', () => {
  const html = card({ id: 7, description: '', photo_url: leadPhoto, created_at: '2026-10-19' }, null);
  assert.ok(html.includes('/image/upload/c_fit,w_240,h_240,q_auto,f_auto/v1/quote_requests/abc.jpg'), html);
  assert.ok(html.includes(`href="${leadPhoto}"`));
});

test('the lead photo stays beside other files until its copy is on the job', () => {
  const other = card({ id: 7, description: '', photo_url: leadPhoto, created_at: '2026-10-19' },
    { customer_photos: [{ url: jobFile, name: 'logo.png' }] });
  assert.ok(other.includes('xyz.png') && other.includes('abc.jpg'), 'their later artwork does not hide the enquiry photo');
  const copied = card({ id: 7, description: '', photo_url: leadPhoto, created_at: '2026-10-19' },
    { customer_photos: [{ url: jobFile, name: 'Photo sent with the enquiry.jpg' }] });
  assert.ok(copied.includes('xyz.png') && !copied.includes('abc.jpg'), 'shown once when copied');
});

test('a lead photo that is not ours, and an empty enquiry, show nothing', () => {
  assert.strictEqual(card({ id: 1, description: '', photo_url: 'https://evil.example/x.jpg' }, null), '');
  assert.strictEqual(card({ id: 1, description: '', photo_url: 'https://res.cloudinary.com/someoneelse/image/upload/v1/x.jpg' }, null), '');
  assert.strictEqual(card(null, null), '');
});
