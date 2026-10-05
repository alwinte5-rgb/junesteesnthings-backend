/* Moving a job asks before it emails the customer (server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * Until 2026-10-05 every stage tap emailed the customer at once, and the job
 * page lit the stage AFTER the one tapped, so tapping In production looked
 * refused. The owner tapped again, and the customer got "in production" and
 * "your order is ready" in the same minute for a job that was not ready.
 * These lift the real code out of server.js, as job-board.test.js does.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function extractFn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

function extractConst(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js`);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated ${anchor}`);
}

const { JOB_STAGES, jobReachedIndex, milestoneAsk } = vm.runInThisContext(`(function () {
  ${extractConst('const JOB_STAGES = [')}
  ${extractFn('jobReachedIndex')}
  ${extractFn('milestoneAsk')}
  return { JOB_STAGES, jobReachedIndex, milestoneAsk };
})`)();

const PRODUCTION = { artwork_at: 'x', proof_sent_at: 'x', proof_ok_at: 'x',
                     blanks_ordered_at: 'x', blanks_in_at: 'x', production_at: 'x' };
const job = (m = {}) => ({ code: 'JT-TEST', name: 'Tom Koleno', email: 't@example.com', ...m });
const at = (key) => JOB_STAGES.findIndex((s) => s.key === key);

test('the job page lights the stage just tapped', () => {
  assert.strictEqual(jobReachedIndex(job()), at('start'));
  assert.strictEqual(jobReachedIndex(job(PRODUCTION)), at('production'),
    'In production stays lit after tapping it, not Ready / Shipped');
  assert.strictEqual(jobReachedIndex(job({ artwork_at: 'x' })), at('production'),
    'a job part-way through the old production dates is in production');
  assert.strictEqual(jobReachedIndex(job({ ...PRODUCTION, qc_at: 'x', shipped_at: 'x' })), at('out'));
  assert.strictEqual(jobReachedIndex(job({ ...PRODUCTION, qc_at: 'x', shipped_at: 'x', delivered_at: 'x' })), at('done'));
});

test('a move that tells the customer something asks first, by name', () => {
  assert.deepStrictEqual(milestoneAsk(job(), at('production')),
    { kind: 'milestone:production', text: 'Email Tom that their order is in production?' });
  assert.strictEqual(milestoneAsk(job(PRODUCTION), at('out')).kind, 'milestone:ready');
  assert.match(milestoneAsk(job(PRODUCTION), at('out')).text, /is ready\?$/);
  assert.match(milestoneAsk(job({ ...PRODUCTION, ship_method: 'pickup' }), at('out')).text, /ready for pickup/);
  assert.match(milestoneAsk(job({ ...PRODUCTION, ship_method: 'ups' }), at('out')).text, /has shipped/);
});

test('only the furthest new milestone is asked about, as only it is sent', () => {
  assert.strictEqual(milestoneAsk(job(), at('out')).kind, 'milestone:ready');
  assert.strictEqual(milestoneAsk(job(), at('done')).kind, 'milestone:ready');
});

test('no question when nothing would be sent', () => {
  assert.strictEqual(milestoneAsk(job(), at('start')), null, 'To start tells nobody');
  assert.strictEqual(milestoneAsk(job(PRODUCTION), at('production')), null, 'already in production');
  assert.strictEqual(milestoneAsk(job({ ...PRODUCTION, shipped_at: 'x' }), at('done')), null, 'Delivered sends nothing new');
  assert.strictEqual(milestoneAsk(job(), at('production'), new Set(['milestone:production'])), null,
    'an email already sent is not sent twice, so not asked about');
  assert.strictEqual(milestoneAsk({ code: 'JT-TEST', name: 'Tom' }, at('production')), null, 'no way to reach them');
});

test('a tap emails only when the owner said yes', () => {
  const move = src.slice(src.indexOf('async function moveJobToStage('));
  assert.match(move.slice(0, 1200), /if \(notify\) \{\s*notifyQuoteMilestone/);
  for (const route of ["app.post('/admin/quote/:code/stage'", "app.post('/admin/quote/:code/step'"]) {
    const body = src.slice(src.indexOf(route), src.indexOf(route) + 2000);
    assert.match(body, /moveJobToStage\([^;]*notify: [^;]*req\.body && req\.body\.notify\) \|\| ''\) === '1'/,
      `${route} must read notify from the body, defaulting to no email`);
  }
});

test('no delivery method means pickup: the job is ready on the needed date', () => {
  /* Shipping time is extra, taken off only once the job is set to ship. A
     quote with no method read as shipped and told the owner (and the
     customer) a date two business days early. */
  const { quoteSchedule } = vm.runInThisContext(`(function () {
    ${extractFn('addBusinessDays')}
    ${extractFn('quoteSchedule')}
    return { quoteSchedule };
  })`)();
  const day = (d) => new Date(d).toDateString();
  const none = quoteSchedule({ needed_by: '2026-10-09T12:00:00' });
  assert.ok(none.isPickup, 'no method is pickup');
  assert.strictEqual(day(none.ship_by), day('2026-10-09T12:00:00'));
  const shipped = quoteSchedule({ needed_by: '2026-10-09T12:00:00', ship_method: 'ground' });
  assert.strictEqual(day(shipped.ship_by), day('2026-10-07T12:00:00'), 'ground still allows transit');
});
