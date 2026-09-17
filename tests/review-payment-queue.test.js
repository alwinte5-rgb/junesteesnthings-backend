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

test('a deposit waits, paid in full does not', () => {
  /* This used to assert one payment delay, long, because "paid" meant a
     deposit and the work did not exist yet. It is two numbers now, and the
     distinction is the whole point: a balance is collected when the work is
     handed over, so PAID IN FULL means finished and the ask goes out while the
     box is still open. A DEPOSIT still waits — asking someone to review a job
     that has not been made is how a shop earns two stars about nothing. */
  assert.match(src, /JT_REVIEW_AFTER_PAYMENT_DAYS \|\| '0'/,
    'paid in full is the finished moment; it should not wait');
  assert.match(src, /JT_REVIEW_AFTER_DEPOSIT_DAYS \|\| '14'/,
    'a deposit is not a finished job and must keep the long delay');
  assert.match(src, /JT_REVIEW_DELAY_DAYS \|\| '3'/,
    'delivery is the accurate moment; asking 3 days later is the point of tracking it');
});

test('the deposit case is actually wired, not just defined', () => {
  /* A constant nobody calls is the shape this repo keeps getting caught by. */
  assert.match(src, /stillDue > 0 \? REVIEW_DAYS_AFTER_DEPOSIT\(\) : REVIEW_DAYS_AFTER_PAYMENT\(\)/,
    'the payment path must choose between them on the balance still owed');
});

test('one follow-up, never a second', () => {
  const fn = src.slice(src.indexOf('async function sendReviewFollowUps'), src.indexOf('async function sendReviewFollowUps') + 1400);
  assert.match(fn, /followup_sent_at IS NULL/, 'without this it would chase forever');
  assert.match(fn, /submitted_at IS NULL/, 'someone who already wrote one must never be chased');
  assert.match(fn, /sent_at IS NOT NULL/, 'a follow-up to an ask that never went out is the first ask, late');
  assert.match(fn, /UPDATE reviews SET followup_sent_at=NOW\(\)/,
    'the row must be marked or one bad address holds the queue forever');
});

test('all delays are overridable and never negative', () => {
  for (const fn of ['REVIEW_DAYS_AFTER_PAYMENT', 'REVIEW_DAYS_AFTER_DEPOSIT', 'REVIEW_DAYS_AFTER_DELIVERY']) {
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
  /* Anchored on the GUARD and its refusal, not on the one-line spelling it
     happened to have. The previous version matched
     "if (!isValidEmail(...)) return false;" exactly and broke the moment the
     body grew a log line — reporting the guard as GONE when it was intact.
     A test that fails on a rewrite it should not care about trains people to
     ignore it, which is the whole value it had. */
  const emailGuard = QUEUE.match(/if \(!isValidEmail\([\s\S]{0,200}?\n?\s*\}?\s*\n/);
  assert.ok(emailGuard, 'the email guard is gone — an ask with no address can never send');
  assert.match(QUEUE.slice(QUEUE.indexOf('isValidEmail')), /return false/,
    'an unusable address must refuse, not queue a row the sweep will skip forever');

  const keyGuard = QUEUE.indexOf('!order_ref && !quote_code');
  assert.ok(keyGuard > -1, 'the key guard is gone');
  assert.match(QUEUE.slice(keyGuard, keyGuard + 200), /return false/,
    'a row keyed on neither could never be found again, or deduplicated');
});

test('a refusal is reported, not silent', () => {
  /* "Nobody has ordered" and "everybody who ordered had no email on file" are
     different problems and used to produce identical logs. */
  assert.match(QUEUE.slice(QUEUE.indexOf('isValidEmail')), /console\.log\([^)]*not queued/,
    'declining to queue must say so — a silent false hides a business problem');
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

/* Batch size. Raised from 25 so a backfill clears in a sweep or two instead of
 * trickling out over an afternoon — but bounded, and the bound is about
 * DELIVERABILITY, not load. A sender that has been mailing a handful a week and
 * suddenly sends hundreds in a minute looks to a mailbox provider like a bought
 * list, and that reputation hit lands on every transactional mail the shop
 * sends — receipts and quote links included.
 */
test('the send batch is bounded and interpolated as a number', () => {
  const m = src.match(/const REVIEW_BATCH = [\s\S]*?\);/);
  assert.ok(m, 'REVIEW_BATCH is gone');
  assert.match(m[0], /Math\.min\(\s*500/, 'it must have an upper bound');
  assert.match(m[0], /Math\.max\(1/, 'zero or negative would send nothing, silently');
  assert.match(m[0], /parseInt\(/,
    'it is interpolated straight into SQL, so it must be parsed to a number and never a raw string');
});

test('the sweep actually uses it', () => {
  /* Anchored on the DUE clause, not on "SELECT * FROM reviews" — there is
     another query with that same opening (the one that looks a review up by
     token), and a loose match found it instead and failed on a file that was
     perfectly correct. */
  const q = src.match(/sent_at IS NULL AND submitted_at IS NULL[\s\S]{0,300}?LIMIT [^`]*/);
  assert.ok(q, 'the due-reviews query is gone');
  assert.match(q[0], /LIMIT \$\{REVIEW_BATCH\}/,
    'the sweep still has a hardcoded limit, so raising the batch does nothing');
});

test('the backfill list is not capped below the batch it feeds', () => {
  /* A list capped at 100 cannot queue a backlog of 200 however many boxes are
     ticked, so the cap has to lead the batch rather than trail it. */
  /* Anchored on the NOT EXISTS clause, which only the backfill query has.
     Matching on the ORDER BY found the phone-only list instead the moment the
     backfill grew a sort column — a loose anchor failing against correct code,
     for the third time in this file. */
  const m = src.match(/NOT EXISTS \(SELECT 1 FROM reviews r[\s\S]{0,300}?LIMIT (\d+)/);
  assert.ok(m, 'the backfill query is gone');
  assert.ok(Number(m[1]) >= 200, 'the backfill list caps at ' + m[1] + ', below one sweep');
});
