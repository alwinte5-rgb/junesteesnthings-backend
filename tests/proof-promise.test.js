'use strict';
/*
 * The site makes one promise about proofs, and it is the true one.
 *
 * Owner, 2026-10-29: orders built in the online designer print exactly as
 * submitted; a proof comes with designs we make for the customer (quotes)
 * Pages, FAQ rich results, staff canned replies and
 * the marketing guides all said "every order gets a proof", so a self-serve
 * buyer was promised a step that never happens.
 *
 * The wording is hand-written in a dozen places, so this scans for the
 * blanket phrasings instead of trusting one shared snippet.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* Blanket promises, in any wording: a proof on EVERY order, a look before
   ANYTHING prints, or a badge that says so. Same shape as the designer's
   tests/sales-copy.test.cjs. A sentence that names who gets a proof (a design
   we make, a quoted job, screen printing) is scoped and passes. */
const BLANKET = /\bevery (order|shirt|design|item|piece|job)\b[^.]{0,60}(proof|review|before (we|it) print)|(proof|review)[^.]{0,30}\bevery (order|shirt|design|item|job)\b|nothing (prints|goes to production) until|proof before (we|anything) print|proof[^.]{0,40}before anything (is )?print|proofs? first\b|proof before print\b|real proofs|review (your|the) (artwork|art|design)s? before print|after (you approve the |the )?proof( is)? approv|after proof approval|from (your )?approved proof/i;
/* Scoped means the sentence says the proof is for a design WE make. A quote or
   a method name is not enough: designer orders can be 50+ screen prints. */
const SCOPED = /\b(we (make|lay out|are designing)|we design (it )?for you|we design it\b|design it for you|design (fee|is a separate fee)|designing it for you|design(s)? we (make|lay out)|lay out (it )?for you|lay out your design|our designer creates|send (us )?the (idea|names)|this design)\b/i;
const unscoped = (t) => BLANKET.test(t) && !SCOPED.test(t);

/* Staff training, the hiring quizzes and the proofs tool talk about quoted jobs, where the proof
   step is real; nothing else is let off. */
const ALLOWED_DIRS = ['tools/lib/courses/'];
/* A public/print/ page is quote-only (Get a Quote, no cart): every job on it
   is one we lay out, so its proof step is real. It stops being let off the
   moment it links to the designer or a cart. */
const quoteOnly = (rel, s) => rel.startsWith('public/print/') &&
  !/editor\.php\?product|add to cart/i.test(s.replace(/<a [^>]*(data-from="(bar|nav|footer)"|jtn-ico-cart)[^>]*>|<a href="[^"]*\/cart\.php">/g, ''));
const ALLOWED = new Set(['tools/lib/hiring-ads.js', 'tools/lib/hiring-designer.js', 'tools/lib/job-proofs.js']);

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(html|json|js|md)$/.test(name)) out.push(p);
  }
  return out;
}

test('the blanket check catches the old wordings and passes scoped ones', () => {
  for (const t of ['Every order gets a proof.', '🖼️ Proof Before We Print', 'a proof before we print, pickup in Lakeview',
    'We send a digital proof before anything is printed, and nothing goes to production until you approve it.',
    '"Proof first. No minimum."', 'a proof before print and pickup'])
    assert.ok(unscoped(t), t);
  for (const t of ['Every design we make for you gets a proof first.', '🖼️ Proof When We Design It',
    'a proof when we lay out your design', 'We will check it and send you a proof of this design before it prints.'])
    assert.ok(!unscoped(t), t);
  for (const t of ['Get a free quote, and every order gets a proof before it prints.', 'Screen print jobs: every order gets a proof first.',
    '<h2>No Minimums, Real Proofs</h2>', 'Our team will review your artwork before printing.', 'Production begins after proof approval.'])
    assert.ok(unscoped(t), 'a quote or method name does not scope it: ' + t);
});

test('a print page is let off only while it is quote-only', () => {
  const nav = '<a href="https://design.jtees.net/editor.php?product_base=12" data-from="nav">Design Lab</a><a href="https://design.jtees.net/cart.php">Cart</a>';
  assert.ok(quoteOnly('public/print/x.html', nav + 'Get a Quote'), 'site chrome links do not count');
  assert.ok(!quoteOnly('public/print/x.html', nav + '<a href="https://design.jtees.net/editor.php?product_base=99">Design it</a>'));
  assert.ok(!quoteOnly('public/print/x.html', nav + '<button>Add to cart</button>'));
  assert.ok(!quoteOnly('public/services/x.html', 'Get a Quote'));
});

test('no page, reply or guide promises a proof on every order', () => {
  const files = walk(path.join(ROOT, 'public'), []).concat(walk(path.join(ROOT, 'tools', 'lib'), []));
  const hits = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (ALLOWED.has(rel) || ALLOWED_DIRS.some((d) => rel.startsWith(d))) continue;
    const raw = fs.readFileSync(f, 'utf8');
    if (quoteOnly(rel, raw)) continue;
    const s = raw.replace(/<[^>]+>/g, ' ');
    for (const t of s.split(/(?<=[.!?"])\s+|\n|<\/?\w|\|/)) if (unscoped(t)) hits.push(rel + ': ' + t.trim().slice(0, 140));
  }
  assert.deepStrictEqual(hits, []);
});

/* "7 to 14 days after proof approval" is true on the quoted print pages, but
   the holiday and gift pages sell to people who design it themselves too. */
test('holiday and gift pages start the clock at the order, or the proof if we design it', () => {
  const gen = fs.readFileSync(path.join(ROOT, 'tools', 'occasion-pages.js'), 'utf8');
  assert.ok(/7–14 after you order \(or approve your proof, if we design it\)/.test(gen));
  const data = fs.readFileSync(path.join(ROOT, 'public', 'assets', 'data', 'occasion-pages.json'), 'utf8');
  assert.ok(!/after proof approval|after you approve the proof/.test(data));
});

/* The playbook's replies live in two lists. seedPlaybook only fills an empty
   table, so an unedited live copy of an old reply is brought up to date only
   by addPlaybookArticles walking BOTH lists' `was` texts. Run it for real
   against a fake pool and check the updates it sends. */
function playbook() {
  const s = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const seed = s.slice(s.indexOf('const KB_SEED = ['), s.indexOf('\n];', s.indexOf('const KB_SEED = [')) + 3);
  const added = s.slice(s.indexOf('const KB_ADDED = ['), s.indexOf('\n];', s.indexOf('const KB_ADDED = [')) + 3);
  const i = s.indexOf('async function addPlaybookArticles()');
  const fn = s.slice(i, s.indexOf('\nasync function seedPlaybook', i));
  const calls = [];
  const pool = { query: async (sql, args) => { calls.push({ sql, args }); return { rows: [] }; } };
  let run;
  try {
    run = new Function('pool', 'console', seed + '\n' + added + '\n' + fn + '\nreturn { KB_SEED, KB_ADDED, addPlaybookArticles };');
    return { calls, ...run(pool, { error() {}, log() {} }) };
  } catch (e) {
    throw new Error('Could not lift KB_SEED / KB_ADDED / addPlaybookArticles out of server.js (moved, reordered, or now using a ' +
      'top-level name: pass it in above): ' + e.message);
  }
}

test('old live copies of the seed "proof" and "turnaround" replies are updated', async () => {
  const { calls, KB_SEED, addPlaybookArticles } = playbook();
  await addPlaybookArticles();
  const was = calls.filter((c) => /= ANY\(SELECT/.test(c.sql));
  for (const short of ['proof', 'turnaround']) {
    const a = KB_SEED.find((x) => x.shortcut === short);
    const u = was.find((c) => c.args[0] === a.title);
    assert.ok(u, `the ${short} reply's was-update runs`);
    assert.strictEqual(u.args[1], a.body);
    assert.deepStrictEqual(u.args[3], a.was);
    assert.strictEqual(u.args[2], null, `the ${short} reply keeps the owner's tags`);
  }
});

test('the staff "proof" reply splits designer orders from designs we make', () => {
  const a = playbook().KB_SEED.find((x) => x.shortcut === 'proof');
  assert.match(a.body, /If we are designing it for you, yes/);
  assert.match(a.body, /prints exactly as you made it/);
  assert.doesNotMatch(a.body, /colour/);
  assert.ok(a.was.some((w) => /^Yes\. We send a digital proof/.test(w)));
});

test('the staff "turnaround" reply: 5-7 / 7-14 days, rush for a fee, no percentages', () => {
  const a = playbook().KB_SEED.find((x) => x.shortcut === 'turnaround');
  assert.match(a.body, /5–7 business days and larger ones in 7–14/);
  assert.match(a.body, /Rush is available for a fee/);
  assert.doesNotMatch(a.body, /\d+\s*%/);
  assert.ok(a.was.some((w) => /about 10 business days/.test(w)), 'the last live wording is in was');
  assert.ok(a.was.some((w) => /\[standard turnaround\]/.test(w)), 'and the one before it');
});

test('the marketing calendar does not start every clock at the proof', () => {
  const s = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(!/7 to 14\s+after proof approval/.test(s));
  assert.match(s, /7 to 14\s+from the order \(or from the proof, when we design it\)/);
});
