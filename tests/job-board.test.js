/* Regression tests for the /production kanban board (server.js).
 *
 * Run: node --test tests/*.test.js   (the files, not the directory — on
 * current Node a positional argument is a glob, so `tests/` fails)
 * Uses only the built-in node:test runner, so this adds no dependency.
 *
 * What these cover. The board's next-action button used to target the column
 * AFTER the one the card was sitting in. A card in Check & ship therefore
 * offered only "✓ Delivered": checked-and-shipped could never be recorded, and
 * a single tap stamped delivered_at and dropped the job off the board — so the
 * one column where a mistake is unrecoverable was also the one that took the
 * fewest taps to leave. #7 changed the rule to "finish the column you are in";
 * these lock that in, because the expression that decides it is three lines
 * buried in a 500-line template literal where nothing else would notice it
 * changing back.
 *
 * These lift the real expressions out of server.js rather than restating them,
 * so the tests cannot quietly drift from the code they are guarding. server.js
 * boots a listener and a DB pool on require, which is why it is not imported.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SERVER = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(SERVER, 'utf8');

/** Lift one top-level `function name(...) { ... }` out of the source. */
function extractFn(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name} from server.js`);
}

/**
 * Lift one `const NAME = ...;` statement, found by its opening text so the
 * anchor is the code itself. Reads to the semicolon that closes it at nesting
 * depth zero, which is what lets it carry arrow functions and template
 * literals without being cut short by the first `;` inside one.
 */
function extractConst(anchor) {
  const start = src.indexOf(anchor);
  assert.notStrictEqual(start, -1, `\`${anchor}\` not found in server.js — ` +
    'the board was rewritten and this test is guarding code that no longer exists');
  let depth = 0, tick = false;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '`' && src[i - 1] !== '\\') tick = !tick;
    else if (!tick && '([{'.includes(c)) depth++;
    else if (!tick && ')]}'.includes(c)) depth--;
    else if (!tick && c === ';' && depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unterminated statement reading \`${anchor}\` from server.js`);
}

/* The pieces of the board, exactly as server.js writes them: the stage list,
   the function that puts a job in a column, the expression that picks the
   button, and the SQL the button's POST builds.
 *
 * Anchored on the shortest text that is still unique in the file, NOT on the
 * expression itself. That is the difference between a test that guards
 * behaviour and one that guards a spelling: anchored on
 * `const act = JOB_STAGES[c.i].cols.every`, reverting to the old
 * `const act = JOB_STAGES[c.i + 1]` made the anchor vanish and the suite died
 * with "not found in server.js" — a real failure, but one that says the board
 * was rewritten rather than that it regressed. Anchored on `const act =`, the
 * revert is picked up and judged on what it does. `const live =` appears three
 * times, so that one has to carry enough of the line to disambiguate. */
const JOB_STAGES_SRC = extractConst('const JOB_STAGES = [');
const ACT_SRC = extractConst('const act =');
const SETS_SRC = extractConst('const sets =');
const LIVE_SRC = extractConst('const live = rows.filter(q => !q.delivered_at');
const COLS_SRC = extractConst('const cols =');

/* Run in THIS realm, not a fresh context. The unsubscribe tests next door use
   vm.createContext because they have to hand the code a fabricated
   process.env; none of the board code reads the environment, so there is
   nothing to fake. It also avoids a trap that costs an afternoon: a value
   built inside a new context carries that context's Array.prototype, and
   deepStrictEqual compares prototypes — so every array assertion fails with
   "same structure but not reference-equal" while printing two identical
   arrays. */
function load() {
  return vm.runInThisContext(`(function () {
    ${JOB_STAGES_SRC}
    ${extractFn('jobStageIndex')}
    /* The button the card shows, from the real expression. */
    function nextAction(q, c) { ${ACT_SRC} return act; }
    /* The columns the board renders, from the real expression. */
    function board(rows) { ${LIVE_SRC} ${COLS_SRC} return cols; }
    /* The SET clause the stage POST builds for a given target index. */
    function setsFor(target) { ${SETS_SRC} return sets; }
    return { JOB_STAGES, jobStageIndex, nextAction, board, setsFor };
  })`)();
}

const { JOB_STAGES, jobStageIndex, nextAction, board, setsFor } = load();

/** A job that has been accepted — an unaccepted quote never reaches the board. */
function job(milestones = {}) {
  return { code: 'JT-TEST', accepted_at: '2026-01-01', ...milestones };
}

/**
 * Tap the button on a card: apply the SET clause the real POST handler builds.
 * Split on the comma that starts a new `column = ` assignment, so the one
 * inside `COALESCE(col, NOW())` does not cut a clause in half. Only the two
 * forms that clause can emit are understood, so if the handler ever starts
 * writing something else this throws rather than passing.
 */
function tap(q, stageKey) {
  const target = JOB_STAGES.findIndex(s => s.key === stageKey);
  assert.ok(target > 0, `no such stage: ${stageKey}`);
  const next = { ...q };
  for (const clause of setsFor(target).split(/,\s*(?=\w+ = )/)) {
    const m = /^(\w+) = (.+)$/.exec(clause.trim());
    if (!m) throw new Error(`unparseable SET clause from server.js: ${clause}`);
    const [, col, value] = m;
    if (value === 'NULL') next[col] = null;
    else if (value === `COALESCE(${col}, NOW())`) next[col] ||= '2026-06-01';
    else throw new Error(`unrecognised SET clause from server.js: ${clause}`);
  }
  return next;
}

/** Where a card is, and what its button says — the two things the board shows. */
function cardIn(q) {
  const col = board([q]).find(c => c.jobs.length);
  return col ? { column: col.label, button: nextAction(q, col).label } : null;
}

/* ── The rule: finish the column you are in ─────────────────────────────── */

test('every working column offers its own name, except To start', () => {
  /* A card whose column still has an unfinished milestone is offered that
     column — the button records the work in hand rather than skipping it.
     To start is the one exception the code documents: it owns no milestone,
     so there is nothing to record and the only action is to advance. */
  const expected = [
    [job(),                                                   'To start',        'Artwork & proof'],
    [job({ artwork_at: 'x' }),                                'Artwork & proof', 'Artwork & proof'],
    [job({ artwork_at: 'x', proof_ok_at: 'x' }),              'Blanks',          'Blanks'],
    [job({ artwork_at: 'x', proof_ok_at: 'x',
           blanks_in_at: 'x' }),                              'Press',           'Press'],
    [job({ artwork_at: 'x', proof_ok_at: 'x',
           blanks_in_at: 'x', production_at: 'x' }),          'Check & ship',    'Check & ship'],
  ];
  for (const [q, column, button] of expected) {
    assert.deepStrictEqual(cardIn(q), { column, button },
      `a card in ${column} should offer "${button}"`);
  }
});

test('no working column offers the column after it', () => {
  /* The old bug in its general form: the button must never name the column to
     the right while the card's own milestones are still outstanding. */
  const labels = JOB_STAGES.map(s => s.label);
  for (const [q, column] of [
    [job({ artwork_at: 'x' }),                                        'Artwork & proof'],
    [job({ artwork_at: 'x', proof_ok_at: 'x' }),                      'Blanks'],
    [job({ artwork_at: 'x', proof_ok_at: 'x', blanks_in_at: 'x' }),   'Press'],
  ]) {
    const { button } = cardIn(q);
    assert.notStrictEqual(button, labels[labels.indexOf(column) + 1],
      `a card in ${column} must not skip straight to the next column`);
  }
});

/* ── Check & ship takes two taps to leave the board ─────────────────────── */

test('Check & ship takes two taps: record, then deliver', () => {
  let q = job({ artwork_at: 'x', proof_ok_at: 'x', blanks_in_at: 'x', production_at: 'x' });
  assert.deepStrictEqual(cardIn(q), { column: 'Check & ship', button: 'Check & ship' });

  // Tap one records the work. The job is checked and gone, but not yet arrived,
  // so it stays on the board — this is the state that had no button at all.
  q = tap(q, 'out');
  assert.ok(q.qc_at && q.shipped_at, 'tap one must stamp qc_at and shipped_at');
  assert.ok(!q.delivered_at, 'tap one must NOT stamp delivered_at');
  assert.deepStrictEqual(cardIn(q), { column: 'Check & ship', button: 'Delivered' },
    'after recording, the same card offers Delivered');

  // Tap two is the one that ends the job and drops it off the board.
  q = tap(q, 'done');
  assert.ok(q.delivered_at, 'tap two must stamp delivered_at');
  assert.strictEqual(cardIn(q), null, 'a delivered job leaves the board');
});

test('a shipped job does not jump to Delivered on its own', () => {
  /* Delivered is a destination, not a column. Nothing but an explicit second
     tap may take a job off the board, or "shipped" silently becomes "arrived"
     and the shop loses the one state where a problem is still recoverable. */
  const shipped = job({ artwork_at: 'x', proof_ok_at: 'x', blanks_in_at: 'x',
                        production_at: 'x', qc_at: 'x', shipped_at: 'x' });
  assert.strictEqual(jobStageIndex(shipped), JOB_STAGES.length - 2,
    'a shipped-but-undelivered job is held in the last working column');
  assert.deepStrictEqual(cardIn(shipped), { column: 'Check & ship', button: 'Delivered' });
});

/* ── The board's shape ──────────────────────────────────────────────────── */

test('the board renders five columns and Delivered is not one of them', () => {
  const cols = board([]);
  assert.deepStrictEqual(cols.map(c => c.label),
    ['To start', 'Artwork & proof', 'Blanks', 'Press', 'Check & ship']);
});

test('only accepted, undelivered work reaches the board', () => {
  const unaccepted = { code: 'JT-2', artwork_at: 'x' };       // still a sales problem
  const delivered = job({ artwork_at: 'x', proof_ok_at: 'x', blanks_in_at: 'x',
                          production_at: 'x', qc_at: 'x', shipped_at: 'x',
                          delivered_at: 'x' });
  const shown = board([unaccepted, delivered, job()]).flatMap(c => c.jobs);
  assert.deepStrictEqual(shown.map(q => q.code), ['JT-TEST']);
});

test('every card on the board has a button', () => {
  /* The button is rendered behind `${act ? ... : ''}`, so an undefined action
     is a card with no way forward rather than a crash — silent, and only
     noticed by whoever is holding the phone. */
  for (const q of [
    job(),
    job({ artwork_at: 'x' }),
    job({ artwork_at: 'x', proof_ok_at: 'x' }),
    job({ artwork_at: 'x', proof_ok_at: 'x', blanks_in_at: 'x' }),
    job({ artwork_at: 'x', proof_ok_at: 'x', blanks_in_at: 'x', production_at: 'x' }),
    job({ artwork_at: 'x', proof_ok_at: 'x', blanks_in_at: 'x', production_at: 'x',
          qc_at: 'x', shipped_at: 'x' }),
  ]) {
    const card = cardIn(q);
    assert.ok(card && card.button, `a card in ${card && card.column} has no button`);
  }
});

/* ── Moving a card backwards ────────────────────────────────────────────── */

test('moving a card back clears the milestones after its new stage', () => {
  /* What makes the ← button mean what it looks like it means. If the later
     stamps survived, the card would bounce straight back to where it was. */
  const done = job({ artwork_at: 'x', proof_ok_at: 'x', blanks_in_at: 'x',
                     production_at: 'x', qc_at: 'x', shipped_at: 'x' });
  const back = tap(done, 'blanks');
  assert.ok(back.blanks_in_at, 'the target stage stays stamped');
  assert.strictEqual(back.production_at, null, 'later milestones are cleared');
  assert.strictEqual(back.qc_at, null);
  assert.strictEqual(back.shipped_at, null);
  assert.deepStrictEqual(cardIn(back), { column: 'Press', button: 'Press' });
});
