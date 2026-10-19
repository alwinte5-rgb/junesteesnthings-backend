/* Codex P2 backlog, backend chunk H (2026-10-11). The SQL here was also run
   against a real Postgres (claim, spelling-blind updates, week bounds, task done). */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const after = (a, n = 1500) => { const i = src.indexOf(a); assert.ok(i > -1, a); return src.slice(i, i + n); };
const TRAINING = require('../tools/lib/training');

test('#180 a refunded or delivered job is not awaiting a deposit', () => {
  const fn = after('function awaitingDeposit(q)', 900);
  const awaitingDeposit = new Function(`${fn.slice(0, fn.indexOf('\n}') + 2)}; return awaitingDeposit;`)();
  const q = { accepted_at: 'x', total: 100, paid_amount: 0 };
  assert.ok(awaitingDeposit(q));
  assert.ok(!awaitingDeposit({ ...q, _refunded: true }), 'refunded');
  assert.ok(!awaitingDeposit({ ...q, delivered_at: 'x' }), 'delivered: a balance, not a deposit');
  assert.match(src, /kind IN \('refund', 'dispute'\) AND quote_code = ANY\(\$1::text\[\]\)/);
});
test('#180 the docs name the setting the code reads', () => {
  assert.match(read('docs/brevo-workflows.md'), /JT_DEPOSIT_NUDGE_HOURS/);
  assert.doesNotMatch(read('docs/brevo-workflows.md'), /^JT_DEPOSIT_NUDGE_DAYS=/m, 'only named as the old, unread setting');
});
test('#179 a lead email is claimed under a lock before the provider is called, and un-claimed if it fails', () => {
  const r = after('async function sendLeadEmail(', 3000);
  const claim = r.indexOf('pg_advisory_xact_lock($1, $2)'), send = r.indexOf('await sendEmail(');
  assert.ok(claim > -1 && send > claim, 'claim before send');
  assert.match(r, /WHERE NOT EXISTS \(SELECT 1 FROM lead_notes/);
  assert.match(r, /DELETE FROM lead_notes WHERE id = \$1', \[noteId\]/);
  assert.doesNotMatch(r.slice(send), /INSERT INTO lead_notes/, 'no note written after the send');
});
test('#179 supplied plain text still carries the footer', () => {
  assert.match(after('async function sendEmail(', 1600), /text \? `\$\{text\}\\n\\n\$\{htmlToText\(footer\)\}` : htmlToText\(html\)/);
});
test('#179 a failed send puts the typed draft back', () => {
  const box = after('function leadEmailBox(l, backField)', 2600);
  assert.match(box, /sessionStorage\.setItem\(k/);
  assert.match(box, /p\.get\('err'\)\)\{f\.subject\.value=d\.s;f\.body\.value=d\.b/);
});
test('#181 product tools read the five MySQL fields and set a thumbnail on create', () => {
  for (const f of ['tools/add-banner-product.js', 'tools/add-sign-products.js']) {
    assert.match(read(f), /const url = mysqlUrlFrom\(env\)/, f);
    assert.doesNotMatch(read(f), /",'','',1,99[78],"/, f + ' inserts an empty thumbnail');
  }
  const B = require('../tools/add-banner-product');
  assert.ok(fs.existsSync(path.join(root, 'public', new URL(B.THUMB).pathname)), 'banner drawing exists');
  const S = require('../tools/add-sign-products');
  for (const [k, slug] of Object.entries(S.THUMBS)) {
    assert.ok(S.NAMES[k], k);
    assert.ok(fs.existsSync(path.join(root, 'public/assets/images/products', slug + '.svg')), slug);
  }
});
test('#195 the restart route connects inside its try', () => {
  const r = after("app.post('/admin/training/restart'", 4500);
  assert.ok(r.indexOf('try {') < r.indexOf('client = await pool.connect()'));
  assert.match(r, /if \(client\) client\.release\(\)/);
});
test('#197 the spelling update compares both sides normalised, and `was` is spelling-blind', () => {
  const f = after('async function addPlaybookArticles()', 2200);
  assert.match(f, /= regexp_replace\(\$2::text, '\(\[Cc\]\)olour'/);
  assert.match(f, /FROM unnest\(\$4::text\[\]\) AS w/);
});
test('#198 superseded 2026-10-17: the homepage shelves carry no sign drawings; no-minimums stays apparel-only', () => {
  const html = read('public/index.html');
  const sec = html.slice(html.indexOf('<!-- pb-shelves:start'), html.indexOf('<!-- pb-shelves:end'));
  assert.doesNotMatch(sec, /images\/products\/[^"]+\.svg/);
  assert.match(html, /No minimums on apparel\./);
});
test('#198 the Shop menu scrolls inside the viewport', () => {
  // 150px since 2026-10-17: the blue bar and the services ticker stick above the menu.
  assert.match(read('public/assets/css/site-nav.css'), /\.jtn-dd-m\{[^}]*max-height:calc\(100vh - 150px\);overflow-y:auto/);
});
test('#200/#203 only the homepage, which has the action bar, moves Tawk', () => {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
  for (const f of walk(path.join(root, 'public'))) {
    const s = fs.readFileSync(f, 'utf8');
    if (/yOffset:78/.test(s)) assert.match(s, /class="jt-mcb/, path.relative(root, f) + ' moves Tawk without the bar');
  }
});
test('#201 starter resources are seeded only by the run that creates the table', () => {
  assert.match(src, /to_regclass\('public\.staff_resources'\) IS NOT NULL AS had/);
  assert.match(src, /if \(!resTable\.had\) \{/);
  assert.doesNotMatch(src, /SELECT COUNT\(\*\)::int AS n FROM staff_resources/);
});
test('#201 a helper finishes only a started task; the week starts on the shop\'s Monday', () => {
  assert.match(after("app.post('/admin/tasks/:id/done'", 2000), /assigned_to = \$2 AND started_at IS NOT NULL/);
  assert.match(src, /done_at >= \(\$1::date::timestamp AT TIME ZONE \$2\)/);
});
test('#201/#204 removing a resource needs a tick; the notice promises no listed manager', () => {
  assert.match(after("app.post('/admin/resources/:id'", 600), /String\(b\.confirm \|\| ''\) !== '1'/);
  assert.match(src, /name="confirm" value="1" required> Remove \$\{escEmail\(r\.name\)\} for good/);
  assert.doesNotMatch(src, /it is listed below with the other tools/);
});
test('#202 a renamed heading still yields every page', () => {
  const body = ['**A**', 'a', '**B**', 'b', '**C**', 'c', '**D**', 'x'.repeat(5000)].join('\n\n');
  assert.strictEqual(TRAINING.lessonPages(body, [{}, { from: 'renamed' }, { from: 'C' }, { from: 'D' }]).length, 4);
});
test('#202 finishing a lesson goes on to the next lesson or quiz', () => {
  const r = after("app.post('/admin/training/read'", 2200);
  assert.match(r, /const nx = walk\[walk\.findIndex\(\(x\) => x\.key === key\) \+ 1\]/);
  assert.match(r, /\/admin\/training\/quiz\//);
});
test('#204 a gap answer keeps the review flag, takes a number for days, and checks the version shown', () => {
  const r = after("app.post('/admin/training/gap'", 2400);
  assert.doesNotMatch(r, /needs_review = FALSE/);
  assert.match(r, /String\(b\.v \|\| ''\) !== gapVersion\(a\.body\)/);
  assert.strictEqual(TRAINING.dayCount('5 business days'), '5');
  assert.strictEqual(TRAINING.dayCount('5 days'), '5');
  assert.strictEqual(TRAINING.dayCount('five'), null);
});
test('#204 the gap card shows with no helpers', () => {
  assert.match(src, /\$\{owner \? playbookGapsCard\(await playbookGapRows\(\), null\) : ''\}/);
});
test('#204 "[X]" is an owner gap only as a deadline', () => {
  assert.strictEqual(TRAINING.ownerGaps('Tell me whether you need [X] shirts').length, 0);
  assert.strictEqual(TRAINING.fillGap('under [X] business days; need [X] shirts', '[X]', '5'), 'under 5 business days; need [X] shirts');
});
test('#221 design leads: a long number is refused, and the previous dedupe bucket is checked', () => {
  const r = after("app.post('/api/design-lead'", 3600);
  assert.match(r, /rawPhone\.length === 11 && rawPhone\[0\] === '1' \? rawPhone\.slice\(1\) : rawPhone/);
  assert.match(r, /\[keyAt\(nowBucket - 1\)\]/);
});
test('#230 read-only export links carry the month on screen', () => {
  assert.match(src, /payments\.csv\$\{month \? `\?month=\$\{month\}` : ''\}/);
});
test('#230 the ad cap allows for overdelivery; the developer lesson matches main\'s lock', () => {
  const A = require('../tools/lib/courses/answers');
  const ads = Object.entries(A).find(([k]) => /monthly ad budget/.test(k))[1];
  assert.match(ads, /\$2\.50 a day/);
  const dev = Object.values(A).find((v) => /approves every pull request/.test(v));
  assert.match(dev, /stop at an open pull request/);
});
test('#232 S&S calls are at least a second apart', () => {
  for (const f of ['tools/model-photos.js', 'tools/colour-photos.js', 'tools/ssa-add-products.js', 'tools/resync-thumbnails.js']) {
    assert.doesNotMatch(read(f), /last \+ 700 - Date\.now\(\)/, f);
  }
});
