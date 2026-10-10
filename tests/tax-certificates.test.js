'use strict';

/* Sales-tax exemption certificates (tools/lib/tax-certificates.js, and the
 * routes by /admin/certificates in server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * Illinois taxes the retailer on gross receipts. An exempt sale is reported as
 * a receipt and then deducted, and the deduction holds only if the buyer's
 * certificate can be produced for it. Until 2026-09-28 the only evidence was a
 * free-text box nothing required, and a customer could pay an untaxed quote
 * with nothing on file. Now an E-number or resale exemption takes no payment
 * until a certificate is on file, and a refused one locks payment again.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const T = require('../tools/lib/tax-certificates');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

/* A file whose first bytes say what it is, padded past the minimum size. */
const PDF = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(200, 0x20)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200)]);
const TODAY = '2026-09-28';
const good = (over = {}) => ({ kind: 'e_number', number: 'E9998-1234-07', holder: 'Lincoln High School',
  expires_on: '2029-06-30', file_b64: PDF.toString('base64'), file_name: 'letter.pdf', ...over });

/* ── what a certificate is ─────────────────────────────────────────────────── */

test('a complete E-number certificate is accepted, and stored as its own bytes say', () => {
  const { cert, error } = T.validateCertificate(good(), { today: TODAY });
  assert.strictEqual(error, undefined);
  assert.strictEqual(cert.kind, 'e_number');
  assert.strictEqual(cert.number, 'E9998-1234-07');
  assert.strictEqual(cert.expires_on, '2029-06-30');
  assert.strictEqual(cert.file_type, 'application/pdf');
  assert.ok(Buffer.isBuffer(cert.file) && cert.file.equals(PDF));
  assert.match(cert.file_sha256, /^[0-9a-f]{64}$/);
});

test('the file type is read from the bytes, never from the name', () => {
  assert.strictEqual(T.validateCertificate(good({ file_name: 'x.pdf', file_b64: PNG.toString('base64') }),
    { today: TODAY }).cert.file_type, 'image/png');
  const html = Buffer.concat([Buffer.from('<html><script>'), Buffer.alloc(200, 0x20)]);
  assert.match(T.validateCertificate(good({ file_name: 'cert.pdf', file_b64: html.toString('base64') }),
    { today: TODAY }).error, /PDF, JPG, PNG or WebP/, 'a page dressed as a PDF is refused');
});

test('a data: URL prefix from the browser is stripped, not stored', () => {
  const { cert } = T.validateCertificate(good({ file_b64: 'data:application/pdf;base64,' + PDF.toString('base64') }),
    { today: TODAY });
  assert.ok(cert.file.equals(PDF));
});

test('what a buyer gets wrong is said in words they can act on', () => {
  const err = (over) => T.validateCertificate(good(over), { today: TODAY }).error;
  assert.match(err({ kind: 'bogus' }), /Choose which kind/);
  assert.match(err({ number: '' }), /Enter the number/);
  assert.match(err({ number: '12345678' }), /starts with E/, 'an E-number starts with E');
  assert.match(err({ holder: ' ' }), /organisation or business/);
  assert.match(err({ expires_on: '' }), /expiry date/, 'an exemption letter carries an expiry');
  assert.match(err({ expires_on: '2026-09-27' }), /expired/);
  assert.match(err({ expires_on: '2026-02-30' }), /expiry date as it appears/, 'not a real day');
  assert.match(err({ file_b64: '' }), /Attach the certificate/);
  assert.match(err({ file_b64: '@@@' }), /did not arrive intact/);
  assert.match(err({ file_b64: Buffer.alloc(20).toString('base64') }), /empty/);
  assert.match(err({ file_b64: Buffer.alloc(T.MAX_FILE_BYTES + 1, 0x25).toString('base64') }), /larger than 8 MB/);
});

test('a certificate that expires today still stands today', () => {
  assert.strictEqual(T.validateCertificate(good({ expires_on: TODAY }), { today: TODAY }).error, undefined);
});

test('a resale certificate (CRT-61) needs no expiry date', () => {
  const { cert, error } = T.validateCertificate(good({ kind: 'resale', number: '1234-5678', expires_on: '' }),
    { today: TODAY });
  assert.strictEqual(error, undefined);
  assert.strictEqual(cert.expires_on, null);
});

test('numbers are kept in one form, however they were typed', () => {
  assert.strictEqual(T.normaliseNumber('e_number', ' e9998–1234 07 ').value, 'E9998-123407');
  assert.strictEqual(T.normaliseNumber('resale', 'ab-1234').value, 'AB-1234');
});

/* ── when a quote needs one ────────────────────────────────────────────────── */

test('only a quote the shop left untaxed, for a reason that needs one, needs a certificate', () => {
  assert.strictEqual(T.quoteNeedsCertificate({ taxable: true }), false);
  assert.strictEqual(T.quoteNeedsCertificate({ taxable: null, tax: 0 }), false,
    'a quote from before the flag was never put to the question');
  assert.strictEqual(T.quoteNeedsCertificate({ taxable: false, tax_exempt_reason: 'e_number' }), true);
  assert.strictEqual(T.quoteNeedsCertificate({ taxable: false, tax_exempt_reason: 'resale' }), true);
  assert.strictEqual(T.quoteNeedsCertificate({ taxable: false, tax_exempt_reason: null }), true,
    'no reason given is treated as the usual one');
  assert.strictEqual(T.quoteNeedsCertificate({ taxable: false, tax_exempt_reason: 'out_of_state' }), false);
  assert.strictEqual(T.quoteNeedsCertificate({ taxable: false, tax_exempt_reason: 'other' }), false);
});

test('payment is locked with nothing on file, a refused one or an expired one; open with any other', () => {
  const q = { taxable: false, tax_exempt_reason: 'e_number' };
  assert.strictEqual(T.quotePayLocked(q, null, TODAY), true);
  assert.strictEqual(T.lockReason(null, TODAY), 'missing');
  assert.strictEqual(T.quotePayLocked(q, { status: 'pending', expires_on: '2029-01-01' }, TODAY), false,
    'the customer can pay while the shop has yet to look');
  assert.strictEqual(T.quotePayLocked(q, { status: 'approved', expires_on: null }, TODAY), false);
  assert.strictEqual(T.quotePayLocked(q, { status: 'rejected', expires_on: '2029-01-01' }, TODAY), true);
  assert.strictEqual(T.lockReason({ status: 'rejected' }, TODAY), 'rejected');
  assert.strictEqual(T.quotePayLocked(q, { status: 'approved', expires_on: '2026-09-01' }, TODAY), true);
  assert.strictEqual(T.lockReason({ status: 'approved', expires_on: '2026-09-01' }, TODAY), 'expired');
  assert.strictEqual(T.quotePayLocked({ taxable: true }, null, TODAY), false);
});

test('a DATE from Postgres is read as the day it was stored, whatever the zone', () => {
  assert.strictEqual(T.isoDay(new Date(2029, 5, 30)), '2029-06-30');
  assert.strictEqual(T.isoDay('2029-06-30T05:00:00.000Z'), '2029-06-30');
  assert.strictEqual(T.isoDay(null), '');
});

test('an exempt sale is documented by the evidence its reason needs', () => {
  const approved = { status: 'approved' };
  const refused = { status: 'rejected' };
  const doc = (q, c) => T.exemptionDocumented({ taxable: false, ...q }, c);
  assert.strictEqual(doc({ tax_exempt_reason: 'e_number' }, approved), true);
  assert.strictEqual(doc({ tax_exempt_reason: 'e_number' }, { status: 'pending' }), true);
  assert.strictEqual(doc({ tax_exempt_reason: 'e_number', tax_exempt_ref: 'E1234' }, null), false,
    'a typed number is not the certificate');
  assert.strictEqual(doc({ tax_exempt_reason: 'resale' }, refused), false);
  assert.strictEqual(doc({ tax_exempt_reason: 'out_of_state', tax_exempt_ref: 'shipped to Gary, IN' }, null), true);
  assert.strictEqual(doc({ tax_exempt_reason: 'out_of_state' }, null), false);
  assert.strictEqual(doc({ tax_exempt_reason: null, tax_exempt_ref: 'E1234' }, null), true, 'older sales: either kind');
  assert.strictEqual(doc({ tax_exempt_reason: null }, approved), true);
  assert.strictEqual(doc({ tax_exempt_reason: null }, null), false);
});

test('the SQL rule names exactly the reasons that need a certificate', () => {
  const at = src.indexOf('const EXEMPT_DOCUMENTED_SQL = `');
  const sql = src.slice(at, src.indexOf('`;', at));
  const listed = (when) => (sql.match(new RegExp(`WHEN q\\.tax_exempt_reason IN \\(([^)]*)\\) THEN ${when}`)) || [])[1];
  const needs = Object.keys(T.EXEMPT_REASONS).filter((k) => T.EXEMPT_REASONS[k].certificate);
  const noNeed = Object.keys(T.EXEMPT_REASONS).filter((k) => !T.EXEMPT_REASONS[k].certificate);
  assert.deepStrictEqual(listed('EXISTS').split(',').map((s) => s.trim().replace(/'/g, '')), needs);
  assert.deepStrictEqual(listed('NULLIF').split(',').map((s) => s.trim().replace(/'/g, '')), noNeed);
  assert.match(sql, /c\.status <> 'rejected'/, 'a refused certificate documents nothing');
});

/* ── the routes ────────────────────────────────────────────────────────────── */

test('the card route refuses a quote whose certificate is missing, refused or expired', () => {
  const r = route("app.get(['/q/:code/pay/card', '/q/:code/pay/balance', '/q/:code/pay/full']");
  const cancel = r.indexOf('if (q.cancelled_at) return');
  const lock = r.indexOf('TAXCERT.quotePayLocked(q, await certificateFor(q))');
  const charge = r.indexOf('const t = quoteTotals(q);');
  assert.ok(lock > cancel && lock < charge, 'checked before any amount is worked out or charged');
});

test('the quote page shows the upload instead of every way to pay while locked', () => {
  const page = route("app.get('/q/:code'");
  assert.match(page, /const certLock = needsCert && TAXCERT\.quotePayLocked\(q, cert\);/);
  assert.match(page, /\(paid && balanceDue > 0 && !stopAsking && !certLock\)/, 'the balance card, card and Zelle alike');
  assert.match(page, /: accepted \? certLock \? '' : `/, 'the deposit card');
  assert.match(page, /\$\{certCard\}/);
  assert.match(page, /certificateFor\(q\)\.catch\(\(\) => null\)/, 'a failed lookup keeps payment waiting, never the page down');
});

test('the customer upload is guarded like paying: code budget, rate limit, and only where one is needed', () => {
  const r = route("app.post('/q/:code/certificate', orderRateLimit");
  assert.match(r, /quoteMissBudget\.exhausted\(req\)/);
  assert.match(r, /quoteMissBudget\.miss\(req\)/);
  assert.match(r, /if \(q\.cancelled_at\)/);
  assert.match(r, /if \(!TAXCERT\.quoteNeedsCertificate\(q\)\)/);
  assert.match(r, /TAXCERT\.validateCertificate\(req\.body\)/);
  assert.match(r, /cert\.status === 'rejected'/, 'a refused certificate sent again is refused again');
});

test('the shop attaches one only to an untaxed quote, and it counts as approved', () => {
  const r = route("app.post('/admin/quote/:code/certificate', requireAdmin");
  assert.match(r, /if \(q\.taxable !== false\)/);
  assert.match(r, /source: 'shop'/);
  const keep = route('async function keepCertificate(');
  assert.match(keep, /CASE WHEN \$11::boolean THEN 'approved' ELSE 'pending' END/);
  assert.match(keep, /ON CONFLICT \(file_sha256, number\) DO UPDATE/, 'the same certificate twice is one row');
  assert.match(keep, /ELSE tax_certificates\.status END/, 'anyone but the shop leaves a decision as it was');
  const attach = src.slice(src.indexOf('async function attachCertificate('));
  assert.match(attach, /const row = await keepCertificate\(cert, opts\);/);
  assert.match(attach, /if \(row\.status !== 'rejected'\)/, 'a refused one is never attached');
});

test('the file goes only to an admin, uncached and unsniffed', () => {
  const r = route("app.get('/admin/certificates/:id/file', requireAdmin");
  assert.match(r, /'X-Content-Type-Options': 'nosniff'/);
  assert.match(r, /'Cache-Control': 'no-store, private'/);
  assert.match(r, /'Content-Type': f\.file_type/, 'the type the bytes said when stored');
});

test('refusing needs a reason, and the way back goes only to known pages', () => {
  const r = route("app.post('/admin/certificates/:id/review', requireAdmin");
  assert.match(r, /if \(!approve && !note\)/);
  assert.match(r, /\/\^\\\/\(certificates\|production\\\/\[A-Z0-9\]\{6\}\)\$\/\.test/);
  assert.doesNotMatch(r, /res\.redirect\(b\.back\)/);
});

test('uploads get a larger JSON limit on their own paths only, mounted first', () => {
  const big = src.indexOf("app.use(['/q/:code/certificate', '/admin/quote/:code/certificate', '/api/tax-certificates']");
  const general = src.indexOf("app.use(express.json({\n  limit: '1mb'");
  assert.ok(big > 0 && general > big, 'the general 1mb parser would otherwise read the body first');
});

test('the menu, its badge and the dashboard all see what is waiting', () => {
  assert.match(src, /\{ key: 'certificates', href: '\/admin\/certificates', label: 'Certificates', icon: 'cert', badge: 'certificates' \}/);
  assert.match(route("app.get('/admin/nav-counts', requireAdmin"), /CERTS_WAITING_SQL\).then\(\(\{ rows \}\) => \{ out\.certificates = rows\[0\]\.n; \}\)/);
  assert.match(route("app.get('/admin/dashboard', requireAdmin"), /one\(CERTS_WAITING_SQL, 'certificates'\)/);
});

test('the builder asks why, and only an untaxed quote keeps the answer', () => {
  assert.match(src, /<select name="tax_exempt_reason"/);
  assert.match(src, /const exemptReason = taxable \? null : \(TAXCERT\.EXEMPT_REASONS\[reasonIn\] \? reasonIn : null\);/);
  assert.match(src, /tax_exempt_ref=\$18, tax_exempt_reason=\$19,/, 'the edit stores it');
  assert.match(src, /taxable,tax_exempt_ref,tax_exempt_reason,\s*\n\s*from_submission_id[,)]/, 'and so does a new quote');
});

test('the tax file says what each deduction stands on, in columns added at the end', () => {
  const r = route("app.get('/admin/tax.csv', requireAdmin");
  assert.match(r, /'exempt', 'exempt_ref', 'source', 'exempt_reason', 'certificate', 'certificate_status'\]/);
  assert.match(r, /LEFT JOIN tax_certificates c ON c\.id = q\.tax_certificate_id/);
  assert.match(r, /LEFT JOIN tax_certificates c ON c\.id = u\.tax_certificate_id/, 'studio sales name theirs too');
  assert.match(r, /const exempt = !!u\.cert_number && u\.cert_status !== 'rejected';/,
    'exempt while its certificate stands, taxable once refused');
  assert.match(r, /exempt \? 'exempt' : '', '', u\.channel,\s*\n\s*exempt \? \(u\.cert_kind \|\| ''\) : '',[\s\S]*?u\.cert_status \|\| ''\],/,
    'studio rows fill the same six columns, in the same order');
});

/* ── the design studio's exempt orders ─────────────────────────────────────── */

test('what the studio is told: the decision and the certificate, never the file', () => {
  const s = T.certificateSummary({ id: '12', status: 'approved', review_note: null, kind: 'e_number',
    number: 'E9998-1234-07', holder: 'Lincoln High School', expires_on: '2029-06-30', file: Buffer.from('x') }, TODAY);
  assert.deepStrictEqual(s, { id: 12, status: 'approved', review_note: '', kind: 'e_number',
    number: 'E9998-1234-07', holder: 'Lincoln High School', expires_on: '2029-06-30',
    label: 'E-number E9998-1234-07 · Lincoln High School', usable: true });
  assert.strictEqual(T.certificateSummary({ id: 3, status: 'rejected', kind: 'resale', number: 'AB-1234',
    holder: 'X', expires_on: null }, TODAY).usable, false, 'refused');
  assert.strictEqual(T.certificateSummary({ id: 3, status: 'pending', kind: 'resale', number: 'AB-1234',
    holder: 'X', expires_on: '2026-09-01' }, TODAY).usable, false, 'expired');
  assert.strictEqual(T.certificateSummary(null), null);
});

test('only the studio can send, read or claim a certificate, and it never lands on a quote', () => {
  for (const sig of ["app.post('/api/tax-certificates', requireInternalKey",
                     "app.get('/api/tax-certificates/:id', requireInternalKey",
                     "app.post('/api/tax-certificates/:id/orders', requireInternalKey"]) {
    assert.ok(src.includes(sig), sig);
  }
  const send = route("app.post('/api/tax-certificates', requireInternalKey");
  assert.match(send, /TAXCERT\.validateCertificate\(b\)/);
  assert.match(send, /keepCertificate\(v\.cert, \{ source: 'studio', email \}\)/);
  assert.doesNotMatch(send, /attachCertificate/, 'a studio certificate is on no quote');
  assert.match(send, /if \(refusal\) return res\.status\(409\)/, 'a refused or expired one cannot take the tax off');
  const why = route('function studioCertificateRefusal(');
  assert.match(why, /why === 'rejected'/);
  assert.match(why, /why === 'expired'/);
});

test('a paid studio order is recorded once, and the shop told once, only while it waits', () => {
  const r = route("app.post('/api/tax-certificates/:id/orders', requireInternalKey");
  assert.match(r, /\/\^\[0-9\]\{1,12\}\$\/\.test\(orderRef\)/, 'an order number, nothing else');
  assert.match(r, /ON CONFLICT \(order_ref\) DO NOTHING\s*\n\s*RETURNING order_ref/);
  assert.match(r, /if \(made\.length\) \{[\s\S]*if \(cert\.status === 'pending'\) \{\s*\n\s*notifyStudioCertificate/);
  assert.match(r, /res\.json\(\{ ok: true, certificate: TAXCERT\.certificateSummary\(cert\) \}\)/,
    'answers with the decision as it stands, so one already made reaches the order at once');
  assert.match(src, /CREATE TABLE IF NOT EXISTS studio_exemptions \(\s*\n\s*order_ref\s+TEXT PRIMARY KEY/,
    'the ON CONFLICT target is the table\'s primary key');
});

test('a certificate nobody paid with is never put in front of the shop', () => {
  assert.match(src, /const CERT_IN_USE_SQL = `\(c\.source <> 'studio'/);
  assert.match(src, /const CERTS_WAITING_SQL = `SELECT COUNT\(\*\)::int AS n FROM tax_certificates c\s*\n\s*WHERE c\.status = 'pending' AND \$\{CERT_IN_USE_SQL\}`/);
  const page = route("app.get('/admin/certificates', requireAdmin");
  assert.match(page, /WHERE \$\{CERT_IN_USE_SQL\}/);
  assert.match(page, /FROM studio_exemptions s WHERE s\.certificate_id = c\.id/, 'and the card names the studio order');
});

test('deciding a certificate tells the studio, which reads the decision back', () => {
  const r = route("app.post('/admin/certificates/:id/review', requireAdmin");
  assert.match(r, /pushCertificateDecisionToStudio\(id\)\.catch\(\(\) => \{\}\)/, 'never holds up the redirect');
  const push = route('async function pushCertificateDecisionToStudio(');
  assert.match(push, /FROM studio_exemptions WHERE certificate_id = \$1/, 'only when a studio order is on it');
  assert.match(push, /jt-tax-decision\.php/);
  assert.match(push, /JSON\.stringify\(\{ certificate_id: id \}\)/, 'an id only: the studio asks what was decided');
  assert.match(push, /if \(!r\.ok\) throw/);
});

test('an exempt studio payment names its certificate, and its refunds carry it back out', () => {
  const rec = route('async function recordUnlinkedPayment(');
  assert.match(rec, /session\.metadata\?\.jt_exempt_cert/);
  assert.match(rec, /\/\^\[1-9\]\[0-9\]\{0,15\}\$\/\.test/, 'a positive integer or nothing');
  assert.match(rec, /tax_portion, resolved_at, tax_certificate_id, created_at\)/);
  assert.match(rec, /\$17::bigint,/);
  assert.strictEqual((src.match(/taxCertificateId: u\.tax_certificate_id/g) || []).length, 2, 'the refund and the chargeback');
  assert.strictEqual((src.match(/amount, tax_portion, tax_certificate_id\n/g) || []).length, 2,
    'both read the certificate off the payment they reverse');
});

test('the ST-1 deduction counts studio sales while their certificate stands', () => {
  const pos = route('async function taxPositionByMonth(');
  assert.match(pos, /FROM unlinked_payments u JOIN tax_certificates c ON c\.id = u\.tax_certificate_id\s*\n\s*WHERE c\.status <> 'rejected'/);
  assert.match(pos, /exemptGross = round2\(byPeriod\[r\.period\]\.exemptGross \+ Number\(r\.exempt_gross\)\)/,
    'added to the quotes\' figure, not written over it');
});

test('studio uploads that lead to no sale are capped site-wide, per day', () => {
  const L = T.STUDIO_UNUSED_DAILY;
  assert.strictEqual(T.studioUploadsFull({ n: 0, bytes: 0 }), false);
  assert.strictEqual(T.studioUploadsFull({ n: L.count - 1, bytes: 1000 }), false, 'one under the count');
  assert.strictEqual(T.studioUploadsFull({ n: L.count, bytes: 1000 }), true, 'at the count');
  assert.strictEqual(T.studioUploadsFull({ n: 2, bytes: String(L.bytes) }), true,
    'at the size, as node-pg returns a bigint: a string');
  assert.strictEqual(T.studioUploadsFull(undefined), false, 'no row reads as nothing sent');
  assert.ok(L.count >= 10 && L.bytes >= 10 * T.MAX_FILE_BYTES, 'far above what a real buyer sends');

  const send = route("app.post('/api/tax-certificates', requireInternalKey");
  const cap = send.indexOf('TAXCERT.studioUploadsFull(load)');
  assert.ok(cap > 0 && cap < send.indexOf('keepCertificate('), 'checked before anything is stored');
  assert.match(send, /WHERE c\.source = 'studio' AND c\.created_at > NOW\(\) - INTERVAL '24 hours'\s*\n\s*AND NOT \$\{CERT_IN_USE_SQL\}/,
    'counts only the studio\'s, only the last day\'s, and only those on no paid order');
  assert.match(send, /WHERE file_sha256 = \$1 AND number = \$2/, 'one already on file is never turned away');
  assert.match(send, /return res\.status\(429\)\.json\(\{ error: /, 'refused in words the buyer sees');
});

test('the board holds an exempt studio order only once it is a sale', () => {
  const at = src.indexOf('function studioExemptChip(');
  const chip = new Function('money', src.slice(at, src.indexOf('\n}\n', at) + 2) + '\nreturn studioExemptChip;')(
    (n) => '$' + Number(n).toFixed(2));
  assert.strictEqual(chip({ tax_exempt: 'pending', paid: 0 }), '',
    'unpaid: its certificate is not on /admin/certificates yet, so there is nothing to check');
  assert.match(chip({ tax_exempt: 'pending', paid: 120 }), /Tax certificate to check &mdash; don&rsquo;t produce/);
  assert.match(chip({ tax_exempt: 'refused', paid: 120, tax_due: 12.3 }), /Exemption refused &mdash; \$12\.30 tax due/);
  assert.match(chip({ tax_exempt: 'refused', paid: 132.3, tax_due: 0 }), /^<span[^>]*>Exemption refused<\/span>$/,
    'once the tax is paid, nothing is due');
  assert.match(chip({ tax_exempt: 'approved', paid: 120 }), /Tax-exempt/);
  assert.strictEqual(chip({ tax_exempt: '', paid: 120 }), '', 'an ordinary order');
});
