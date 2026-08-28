/* Regression tests for when a review ask is created and when it is moved.
 *
 * Run: node --test tests/*.test.js
 *
 * Background, because it explains every choice below. The review system sat at
 * zero rows for its entire life. Its only trigger was an order reaching a status
 * nobody ever set, so a finished feature quietly did nothing for months and the
 * failure looked exactly like "we just don't get many reviews".
 *
 * The fix is two moments, not one:
 *
 *   PAYMENT is the floor. It always happens and always carries an email
 *   address, so every paying customer gets asked eventually. It is also the
 *   less accurate moment — the goods do not exist yet — so it is dated far out.
 *
 *   DELIVERY is accurate but optional in practice. It therefore does not CREATE
 *   the ask, it RESCHEDULES the one payment already queued. Building it the
 *   other way round is what produced a system that never fired.
 *
 * The rules that must hold, and that are easy to break by accident:
 *   - one ask per order or quote, no matter how many payments or milestones
 *   - a sent ask is never rescheduled and never blocks a future one
 *   - clearing a checklist step is a correction, not a milestone
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/* Pull a function out of server.js by its opening text.
 *
 * The parameter list has to be stepped over first. These functions take a
 * destructured object — `queueReviewRequest({ name, email, … })` — so the first
 * `{` after the anchor is the PARAMETER brace, not the body. Matching on that
 * returns the argument list and every assertion below then fails against a
 * string that never contained the code, which reads like the feature is
 * missing rather than like the test is wrong.
 */
function extractFn(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);

  // close the parameter list first
  let i = src.indexOf('(', start);
  let parens = 0;
  for (; i < src.length; i++) {
    if (src[i] === '(') parens++;
    else if (src[i] === ')' && --parens === 0) { i++; break; }
  }

  const open = src.indexOf('{', i);
  let depth = 0;
  for (let j = open; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  throw new Error(`unterminated function reading \`${anchor}\``);
}

const QUEUE = extractFn('async function queueReviewRequest(');
const RESCHED = extractFn('async function rescheduleReviewRequest(');

/* ── the two delays ──────────────────────────────────────────────────────── */

test('payment and delivery use different delays', () => {
  assert.match(src, /JT_REVIEW_AFTER_PAYMENT_DAYS \|\| '14'/,
    'the payment delay is a guess made before the job exists; it must be the long one');
  assert.match(src, /JT_REVIEW_DELAY_DAYS \|\| '3'/,
    'delivery is the accurate moment; asking 3 days later is the point of tracking it');
});

test('both delays are overridable and never negative', () => {
  for (const fn of ['REVIEW_DAYS_AFTER_PAYMENT', 'REVIEW_DAYS_AFTER_DELIVERY']) {
    const line = src.slice(src.indexOf(`const ${fn}`), src.indexOf(`const ${fn}`) + 220);
    assert.match(line, /Math\.max\(0,/, `${fn} must floor at zero — a negative interval queues in the past`);
    assert.match(line, /parseInt\(/, `${fn} must parse the env var, not use the string`);
  }
});

/* ── one ask, not several ────────────────────────────────────────────────── */

test('the pending-row guard keys on the order OR the quote', () => {
  const where = src.slice(src.indexOf('const PENDING_REVIEW_WHERE'),
                          src.indexOf('/** Queue an ask'));
  assert.match(where, /order_ref\s*=\s*\$1/);
  assert.match(where, /quote_code\s*=\s*\$2/);
  assert.match(where, /sent_at IS NULL AND submitted_at IS NULL/,
    'a sent ask must not block a future one — repeat customers exist');
});

test('queueing refuses to add a second ask for the same job', () => {
  assert.match(QUEUE, /WHERE NOT EXISTS \(SELECT 1 FROM reviews WHERE \$\{PENDING_REVIEW_WHERE\}\)/,
    'a deposit and a balance are two payments on one job and must produce one ask');
});

test('queueing needs a real address and something to key on', () => {
  assert.match(QUEUE, /if \(!isValidEmail\(String\(email \|\| ''\)\)\) return false;/);
  assert.match(QUEUE, /if \(!order_ref && !quote_code\) return false;/,
    'a row keyed on neither could never be found again, or deduplicated');
});

test('a failed queue can never fail the payment that triggered it', () => {
  assert.match(QUEUE, /catch \(e\) \{[\s\S]*console\.error\('review queue failed/,
    'a review is not worth failing a webhook and making Stripe retry a settled payment');
});

/* ── delivery moves the date, it does not add a row ──────────────────────── */

test('rescheduling updates an unsent row rather than inserting', () => {
  assert.match(RESCHED, /UPDATE reviews SET requested_at = NOW\(\) \+/,
    'delivery must move the existing ask, not create a second one');
  assert.match(RESCHED, /WHERE \$\{PENDING_REVIEW_WHERE\}/);
});

test('rescheduling falls back to queuing when nothing is waiting', () => {
  assert.match(RESCHED, /return queueReviewRequest\(/,
    'a job paid before this code existed still deserves an ask when it is delivered');
});

test('a delivered quote reschedules; clearing the step does not', () => {
  const step = src.slice(src.indexOf("app.post('/quote/:code/step'"),
                         src.indexOf("app.post('/quote/:code/step'") + 3000);
  assert.match(step, /if \(!clear && \(col === 'delivered_at' \|\| col === 'shipped_at'\)/,
    'un-ticking a step is a correction, and must not re-date the ask');
  assert.match(step, /rescheduleReviewRequest\(/);
  assert.match(step, /REVIEW_DAYS_AFTER_DELIVERY\(\)/);
});

test('quote products come from the JSONB item description, not a name field', () => {
  assert.match(src, /q\.items\[0\]\.description/,
    'quote line items use `description`; `name` is the designer order shape and would render blank');
});

/* ── the backfill ────────────────────────────────────────────────────────── */

const BACKFILL = extractFn("app.post('/admin/reviews/backfill'");

test('the backfill is admin-only', () => {
  assert.match(src, /app\.post\('\/admin\/reviews\/backfill', requireAdmin,/,
    'it emails real customers — it cannot be open');
});

test('the backfill route is registered before /admin/reviews/:id', () => {
  assert.ok(src.indexOf("app.post('/admin/reviews/backfill'") <
            src.indexOf("app.post('/admin/reviews/:id'"),
    'registered after, Express matches :id first and parses "backfill" as NaN');
});

test('the backfill only accepts real quote codes', () => {
  assert.match(BACKFILL, /QUOTE_CODE_RE\.test\(c\)/,
    'the codes arrive from a form post and are not trusted');
});

test('the backfill queues immediately, not at the payment delay', () => {
  assert.match(BACKFILL, /days: 0/,
    'these jobs are already weeks old; a further 14-day wait would be absurd');
});

test('the backfill list is paid-in-full and never-asked only', () => {
  const page = src.slice(src.indexOf("app.get('/admin/reviews'"),
                         src.indexOf("app.post('/admin/reviews/backfill'"));
  assert.match(page, /q\.paid_amount >= q\.total - 0\.005/,
    'asking someone who has only paid a deposit is asking before the work exists');
  assert.match(page, /NOT EXISTS \(SELECT 1 FROM reviews r WHERE r\.quote_code = q\.code\)/,
    'a customer already asked must not appear on the list again');
});

/* ── the monitor that cried wolf ─────────────────────────────────────────── */

const MONITOR = extractFn('async function brevoBreachCheck(');

test('a single 401 does not raise the revocation alarm', () => {
  const branch = MONITOR.slice(MONITOR.indexOf('401'));
  assert.match(branch, /stillDead/,
    'this fired on 2026-08-27 and the key was valid minutes later; one blip is not revocation');
  assert.match(branch, /if \(!stillDead\)/);
  assert.match(branch, /transient 401/);
});

test('an unreachable Brevo is not reported as a rejected key', () => {
  const branch = MONITOR.slice(MONITOR.indexOf('401'));
  assert.match(branch, /catch \{[\s\S]*stillDead = false;/,
    'unreachable and rejected are different problems and must not share an alert');
});
