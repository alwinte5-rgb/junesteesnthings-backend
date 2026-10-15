'use strict';

/* A photo sent with an enquiry carries onto the quote made from it, and so
 * into production (owner, 2026-10-15). Before this the website form's photo
 * and any picture texted before there was a job stayed on the lead: the quote
 * and the job page only take files from quote_photos.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../tools/lib/lead-files');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const C = 'dhjtzewsx';
const IMG = `https://res.cloudinary.com/${C}/image/upload/v1700000000/quote_requests/abc123.jpg`;
const TXT = `https://res.cloudinary.com/${C}/image/upload/v1700000001/job_messages/pic9.png`;
const PDF = `https://res.cloudinary.com/${C}/raw/upload/v1700000002/job_messages/f00d.pdf`;

test('only our own files, in the enquiry folders, are taken', () => {
  assert.deepStrictEqual(L.sourceOf(IMG, C, L.LEAD_FOLDERS),
    { url: IMG, type: 'image', format: 'jpg', publicId: 'quote_requests/abc123' });
  assert.deepStrictEqual(L.sourceOf(PDF, C, [L.TEXT_FOLDER]),
    { url: PDF, type: 'raw', format: 'pdf', publicId: 'job_messages/f00d.pdf' }, 'raw ids keep their extension');
  assert.strictEqual(L.sourceOf(IMG.replace(C, 'someoneelse'), C, L.LEAD_FOLDERS), null, 'another account');
  assert.strictEqual(L.sourceOf(IMG.replace('quote_requests', 'grad_orders'), C, L.LEAD_FOLDERS), null, 'another folder');
  assert.strictEqual(L.sourceOf(IMG.replace('/upload/', '/upload/c_fill,w_9/'), C, L.LEAD_FOLDERS), null, 'a transformed copy');
  assert.strictEqual(L.sourceOf('https://evil.example/x.jpg', C, L.LEAD_FOLDERS), null);
  assert.strictEqual(L.sourceOf(IMG, '', L.LEAD_FOLDERS), null, 'no Cloudinary set up');
});

test('the form photo first, then what they texted, once each, named for the job page', () => {
  const files = L.leadFiles({ lead: { photo_url: IMG }, cloud: C,
    texts: [[{ url: TXT, name: 'Text picture 1.png' }], [{ url: TXT, name: 'again' }, { url: PDF, name: 'logo<b>.pdf' }]] });
  assert.deepStrictEqual(files.map((f) => f.name), ['Photo sent with the enquiry.jpg', 'Text picture 1.png', 'logob.pdf']);
  assert.deepStrictEqual(L.leadFiles({ lead: { photo_url: '' }, texts: [null, 'x', [{}]], cloud: C }), []);
  const many = Array.from({ length: 15 }, (_, i) => [{ url: TXT.replace('pic9', 'p' + i), name: '' }]);
  assert.strictEqual(L.leadFiles({ lead: {}, texts: many, cloud: C }).length, L.MAX_FILES);
});

test('files only go to the same customer, by email or phone', () => {
  assert.ok(L.samePerson({ email: 'Kim@Example.com' }, { email: 'kim@example.com' }));
  assert.ok(L.samePerson({ phone: '(773) 555-0100', email: '' }, { phone: '+1 773 555 0100', email: '' }));
  assert.ok(!L.samePerson({ email: 'kim@example.com', phone: '7735550100' }, { email: 'lee@example.com', phone: '3125550100' }));
  assert.ok(!L.samePerson({ email: '', phone: '' }, { email: '', phone: '' }), 'two blanks are not a match');
});

/* carryLeadFiles against a fake pool, Cloudinary and download. */
function lift(name) {
  let at = src.indexOf(`async function ${name}(`);
  assert.ok(at > 0, name);
  let depth = 0;
  for (let i = src.indexOf('{', src.indexOf(')', at)); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

async function carry({ lead, quote, texts = [], failFetch = false }) {
  const sql = [];
  const added = [];
  const uploads = [];
  const sandbox = {
    LEADFILES: L, QPHOTOS: { ...require('../tools/lib/quote-photos'), cloudName: () => C },
    pool: { query: async (q, args) => {
      sql.push(q);
      if (/FROM submissions/.test(q)) return { rows: lead ? [lead] : [] };
      if (/FROM quotes WHERE code/.test(q)) return { rows: quote ? [quote] : [] };
      if (/FROM sms_messages/.test(q)) return { rows: texts.map((media) => ({ media })) };
      if (/UPDATE quotes SET customer_photos/.test(q)) { added.push(args); return { rows: [] }; }
      return { rows: [] };
    } },
    cloudinary: {
      utils: { private_download_url: (id, fmt, o) => `https://api.cloudinary.com/dl?${id}.${fmt}&${o.resource_type}` },
      uploader: { upload_stream: (opts, cb) => ({ end: () => { uploads.push(opts); cb(null, { secure_url:
        `https://res.cloudinary.com/${C}/${opts.resource_type}/upload/v1/quote_photos/${opts.public_id || 'new' + uploads.length + '.jpg'}` }); } }) },
    },
    fetch: async (url) => (failFetch ? { ok: false, status: 404 } : { ok: true, arrayBuffer: async () => new ArrayBuffer(8), url }),
    AbortSignal, Buffer, crypto: require('node:crypto'),
    reportError: async () => {}, console: { error() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(lift('addCustomerFile') + '\n' + lift('carryLeadFiles'), sandbox);
  const n = await sandbox.carryLeadFiles('AB12CD', 7);
  return { n, sql, added, uploads };
}

test('the enquiry photo and texted files are copied onto the quote', async () => {
  const r = await carry({ lead: { photo_url: IMG, phone: '7735550100', email: 'kim@example.com', created_at: '2026-10-14' },
    quote: { phone: '', email: 'kim@example.com' }, texts: [[{ url: PDF, name: 'logo.pdf' }]] });
  assert.strictEqual(r.n, 2);
  assert.deepStrictEqual(r.uploads.map((u) => [u.folder, u.resource_type]), [['quote_photos', 'image'], ['quote_photos', 'raw']]);
  assert.match(r.uploads[1].public_id, /^[0-9a-f]{20}\.pdf$/);
  assert.deepStrictEqual(r.added.map((a) => [a[0], a[2]]), [['AB12CD', 'Photo sent with the enquiry.jpg'], ['AB12CD', 'logo.pdf']]);
  /* What it adds is a real quote photo: the job page will show it. */
  const QP = require('../tools/lib/quote-photos');
  for (const a of r.added) assert.ok(QP.photoUrlOk(a[1], C), a[1]);
});

test('another customer\'s lead gives nothing; a failed copy is skipped, not fatal', async () => {
  const other = await carry({ lead: { photo_url: IMG, phone: '7735550100', email: 'kim@example.com', created_at: '2026-10-14' },
    quote: { phone: '3125550100', email: 'lee@example.com' } });
  assert.strictEqual(other.n, 0);
  assert.strictEqual(other.uploads.length, 0);
  const failed = await carry({ lead: { photo_url: IMG, phone: '', email: 'kim@example.com', created_at: '2026-10-14' },
    quote: { phone: '', email: 'kim@example.com' }, failFetch: true });
  assert.strictEqual(failed.n, 0);
  assert.ok(!failed.sql.some((q) => /sms_messages/.test(q)), 'no phone, no text lookup');
});

test('it runs once, for a new quote made from a lead, without holding up the save', () => {
  const at = src.indexOf('carryLeadFiles(code, q.from_submission_id)');
  assert.ok(at > 0);
  const before = src.slice(at - 200, at);
  assert.match(before, /if \(!QUOTE_CODE_RE\.test\(editing\) && q\.from_submission_id\) \{\s*$/);
  assert.doesNotMatch(src.slice(at - 10, at), /await/, 'in the background');
  /* The texts query, as Postgres receives it: the backslash must arrive. */
  const fn = lift('carryLeadFiles');
  const lit = fn.slice(fn.indexOf('`SELECT media'), fn.indexOf('LIMIT 20`') + 'LIMIT 20`'.length);
  assert.ok(vm.runInThisContext(lit).includes("regexp_replace(phone, '\\D', '', 'g')"));
});
