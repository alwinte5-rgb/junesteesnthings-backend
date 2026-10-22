'use strict';

/* The task flow (tools/lib/task-flow.js and its routes and sweep in
 * server.js): one open task per lane per helper, handed from their role's
 * backlog the moment a lane is empty; the routine made once per work day;
 * the marketing calendar's prep work given to the designer once; the owner
 * alone fills the backlogs and hears when one runs low.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FLOW = require('../tools/lib/task-flow');
const STAFF = require('../tools/lib/staff');
const { TRACKS } = require('../tools/lib/tracks');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

function fn(name) {
  const at = src.indexOf(name);
  assert.notStrictEqual(at, -1, `${name} not found in server.js`);
  return src.slice(at, src.indexOf('\n}\n', at));
}
function route(signature) {
  const at = src.indexOf(signature);
  assert.notStrictEqual(at, -1, `${signature} not found in server.js`);
  return src.slice(at, src.indexOf('\n});', at));
}

const TRACK_KEYS = Object.keys(TRACKS);
const ok = { track: 'design', lane: 'medium', title: 'Fill the galleries', goal: 'conversion' };

test('a backlog task must say who it is for, its lane and what it moves', () => {
  assert.deepStrictEqual(FLOW.cleanTemplate(ok, TRACK_KEYS).template,
    { track: 'design', lane: 'medium', repeat: 'none', weekday: null, title: 'Fill the galleries', goal: 'conversion', description: null, how_to: null, brief: null });
  assert.match(FLOW.cleanTemplate({ ...ok, track: 'pirate' }, TRACK_KEYS).error, /who the task is for/);
  assert.match(FLOW.cleanTemplate({ ...ok, lane: 'someday' }, TRACK_KEYS).error, /lane/);
  assert.match(FLOW.cleanTemplate({ ...ok, goal: '' }, TRACK_KEYS).error, /what the task moves/, 'no busy work: every task names its result');
  assert.match(FLOW.cleanTemplate({ ...ok, title: ' x ' }, TRACK_KEYS).error, /title/);
  assert.match(FLOW.cleanTemplate({ ...ok, repeat: 'weekly', weekday: '9' }, TRACK_KEYS).error, /day/);
});

test('a routine task sits outside the lanes; text is one line and capped', () => {
  const d = FLOW.cleanTemplate({ ...ok, repeat: 'daily', lane: 'long' }, TRACK_KEYS).template;
  assert.strictEqual(d.lane, FLOW.DAILY);
  const w = FLOW.cleanTemplate({ ...ok, repeat: 'weekly', weekday: '5' }, TRACK_KEYS).template;
  assert.strictEqual(w.weekday, 5);
  const long = FLOW.cleanTemplate({ ...ok, title: 'a\nb'.repeat(300), description: 'x'.repeat(9000) }, TRACK_KEYS).template;
  assert.ok(!/\n/.test(long.title) && long.title.length <= FLOW.TITLE_MAX);
  assert.strictEqual(long.description.length, FLOW.TEXT_MAX);
});

test('one open task per lane: only empty lanes are filled', () => {
  assert.deepStrictEqual(FLOW.lanesToFill([]), ['short', 'medium', 'long']);
  assert.deepStrictEqual(FLOW.lanesToFill(['medium']), ['short', 'long']);
  assert.deepStrictEqual(FLOW.lanesToFill(['short', 'medium', 'long', 'daily']), []);
});

test('the routine comes on work days only; weekly on its day', () => {
  assert.strictEqual(FLOW.recurringDue({ repeat: 'daily' }, 2, true), true);
  assert.strictEqual(FLOW.recurringDue({ repeat: 'daily' }, 6, false), false);
  assert.strictEqual(FLOW.recurringDue({ repeat: 'weekly', weekday: 5 }, 5, true), true);
  assert.strictEqual(FLOW.recurringDue({ repeat: 'weekly', weekday: 5 }, 4, true), false);
  assert.strictEqual(FLOW.recurringDue({ repeat: 'none' }, 1, true), false);
  /* With shifts, their days; with none, Monday to Friday. */
  assert.strictEqual(FLOW.isWorkday(6, [6, 7], true), true);
  assert.strictEqual(FLOW.isWorkday(1, [6, 7], true), false);
  assert.strictEqual(FLOW.isWorkday(5, [], false), true);
  assert.strictEqual(FLOW.isWorkday(6, [], false), false);
});

test('running low: under 3 waiting in a lane, only for roles with a backlog', () => {
  const low = FLOW.lowLanes({ 'design:short': 5, 'design:medium': 2 }, ['design']);
  assert.deepStrictEqual(low, [{ track: 'design', lane: 'medium', n: 2 }, { track: 'design', lane: 'long', n: 0 }]);
  assert.deepStrictEqual(FLOW.lowLanes({}, []), []);
  assert.strictEqual(FLOW.isoWeek(new Date(Date.UTC(2026, 9, 21))), '2026-W43');
  assert.strictEqual(FLOW.isoWeek(new Date(Date.UTC(2027, 0, 1))), '2026-W53');
});

test('every starter task is a valid backlog row with a result', () => {
  for (const [track, list] of Object.entries(FLOW.STARTERS)) {
    assert.ok(TRACK_KEYS.includes(track), track);
    for (const t of list) {
      const c = FLOW.cleanTemplate({ ...t, track, weekday: t.weekday == null ? '' : String(t.weekday) }, TRACK_KEYS);
      assert.ok(c.template, `${track}: ${t.title}: ${c.error}`);
    }
    for (const lane of FLOW.LANE_KEYS) assert.ok(list.some((t) => t.lane === lane), `${track} has a ${lane} starter`);
    /* Texts go only to people who signed up for them (TCPA). */
    for (const t of list) assert.doesNotMatch(`${t.title} ${t.description}`, /\btext (everyone|all)\b/i);
  }
});

test('handing out: one per lane, each backlog row to one person, under a per-helper lock', () => {
  const f = fn('async function fillTaskLanes(');
  assert.match(f, /pg_advisory_xact_lock\(hashtext\(\$1\)\)', \[`task_flow:\$\{helper\.id\}`\]/);
  assert.match(f, /FOR UPDATE SKIP LOCKED/);
  assert.match(f, /SET used_at = NOW\(\), used_by = \$3/);
  assert.match(f, /AND repeat = 'none' AND active AND used_at IS NULL/);
  assert.match(f, /FLOW\.lanesToFill\(/);
});

test('the routine: once a day per person, not again while the last one is open', () => {
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS staff_tasks_recurring_idx ON staff_tasks \(template_id, assigned_to, due_on\)/);
  const r = fn('async function makeRecurringTasks(');
  assert.match(r, /NOT EXISTS \(SELECT 1 FROM staff_tasks WHERE template_id = \$7 AND assigned_to = \$2 AND done_at IS NULL\)/);
  assert.match(r, /ON CONFLICT DO NOTHING/);
  assert.match(r, /SHIFTS\.staffZoneOf\(helper\.time_zone\)/, 'their day, in their own time zone');
  /* A schedule that does not run this week falls back to Monday to Friday. */
  assert.match(r, /FLOW\.isWorkday\(weekday, shiftDays, shiftDays\.length > 0\)/);
});

test('the designer gets each season\'s asset kit once, from the marketing calendar', () => {
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS staff_tasks_auto_idx ON staff_tasks \(auto_ref\)/);
  const a = fn('async function makeAutoTasks(');
  assert.match(a, /MKT_CAL\.dueNow\(now\)/);
  assert.match(a, /`mcal:\$\{e\.id\}:\$\{e\.year\}`/);
  assert.match(a, /r\.training_track === 'design'/);
  /* One season at a time: four seasons in prep never land at once. */
  assert.match(a, /AND done_at IS NULL AND auto_ref LIKE 'mcal:%' LIMIT 1/);
  assert.match(a, /if \(busy\.length\) return 0;/);
  /* The seasonal kits come from the calendar, so no starter repeats one. */
  for (const x of FLOW.STARTERS.design) assert.doesNotMatch(x.title, /asset kit/i);
});

test('finishing a task or opening My Day hands out the next one at once', () => {
  /* Whoever closes it (the helper or the owner), the lane of the person it was for refills. */
  const done = route("app.post('/admin/tasks/:id/done', requireAdmin");
  assert.match(done, /RETURNING assigned_to/);
  assert.match(done, /if \(doneFor\) await taskFlowFor\(doneFor, \{ now: true \}\)/);
  assert.match(route("app.get('/admin/my-day', requireAdmin"), /if \(me\) await taskFlowFor\(me\)/);
  /* My Day refills at most once a minute per helper. */
  assert.match(fn('async function taskFlowFor('), /if \(!now && Date\.now\(\) - \(taskFlowAt\.get\(helperId\) \|\| 0\) < 60 \* 1000\) return 0;/);
  assert.match(src, /setInterval\(\(\) => step\('task flow', taskFlowSweep\), 10 \* 60 \* 1000\)/);
  assert.match(fn('async function taskFlowFor('), /WHERE id = \$1 AND active AND archived_at IS NULL/, 'never for a disabled helper');
});

test('only the owner fills, orders and empties the backlogs', () => {
  for (const r of ['POST /admin/tasks/templates', 'POST /admin/tasks/templates/starters',
    'POST /admin/tasks/templates/:id/top', 'POST /admin/tasks/templates/:id/archive']) {
    assert.strictEqual(STAFF.ROUTES[r], 'owner', r);
    assert.strictEqual(STAFF.mayUseRoute({ kind: 'staff', perms: {} }, r.split(' ')[0], r.split(' ')[1]), false, r);
  }
  /* Starters only for a role with no backlog yet, so a second press adds nothing. */
  assert.match(route("app.post('/admin/tasks/templates/starters', requireAdmin"), /if \(n\) \{ await client\.query\('ROLLBACK'\); return back\(res, backTo, 'err', 'This role already has a backlog\.'\); \}/);
  assert.match(route("app.post('/admin/tasks/templates', requireAdmin"), /FLOW\.cleanTemplate\(req\.body, FLOW_TRACKS\)/);
});

test('the backlog page escapes everything a person typed', () => {
  const b = fn('async function backlogSection(');
  assert.match(b, /<b>\$\{escEmail\(t\.title\)\}<\/b>/);
  assert.match(b, /escEmail\(t\.description\)/);
  assert.match(b, /escEmail\(t\.how_to\)/);
});

test('the owner hears when a lane runs low, once a week, cleared when refilled', () => {
  const b = fn('async function backlogNotices(');
  assert.match(b, /ref: `\$\{l\.track\}:\$\{l\.lane\}:\$\{week\}`/);
  assert.match(b, /notifyClearResolved\('owner', 'backlog'/);
  assert.match(fn('async function notifyAdd('), /UPDATE SET title = EXCLUDED\.title WHERE notifications\.read_at IS NULL/, 'the count stays current while unread');
  assert.match(fn('async function notifySweep('), /notifyPart\('backlog', backlogNotices\(roster\)\)/);
});

test('a season kit is due when its ads start, or a week out once they have', () => {
  const at = src.indexOf('function flowDueOn(');
  const body = src.slice(at, src.indexOf('\n}\n', at) + 2);
  const flowDueOn = new Function(`${body}; return flowDueOn;`)();
  const now = new Date(Date.UTC(2026, 9, 21));
  assert.strictEqual(flowDueOn(new Date(Date.UTC(2026, 9, 24)), now), '2026-10-24', 'ads in 3 days: due then, not later');
  assert.strictEqual(flowDueOn(new Date(Date.UTC(2026, 8, 20)), now), '2026-10-28', 'ads already running: a week from now');
});

test('a disabled helper\'s unstarted backlog work goes back to the backlog', () => {
  const sweep = fn('async function taskFlowSweep(');
  assert.match(sweep, /NOT s\.active OR s\.archived_at IS NOT NULL/);
  assert.match(sweep, /t\.started_at IS NULL AND t\.template_id IS NOT NULL/, 'started work stays for the owner to settle');
  assert.match(sweep, /UPDATE task_templates SET used_at = NULL, used_by = NULL WHERE id IN \(SELECT template_id FROM gone\) AND repeat = 'none'/);
});

test('the owner is not told of every routine task finished; a cleared role stops nagging', () => {
  assert.match(fn('async function taskNotices('), /lane IS DISTINCT FROM 'daily'/);
  assert.match(fn('async function backlogNotices('), /SELECT DISTINCT track FROM task_templates WHERE active AND track = ANY/);
  assert.match(fn('async function backlogNotices('), /notifyAdd\(out, \{ refresh: true \}\)/, 'one insert path for every notification');
});

test('a backlog change refills only that role, at once', () => {
  assert.match(route("app.post('/admin/tasks/templates', requireAdmin"), /taskFlowForTrack\(t\.track\)/);
  assert.match(route("app.post('/admin/tasks/templates/starters', requireAdmin"), /taskFlowForTrack\(track\)/);
});


/* ── Briefs (owner, 2026-10-22: "the tasks are basic and dont explain
   anything go deeper ... dont be vague. be descriptive") ───────────────── */

test('every starter task is written out in full: why, what June gives, done when, proof, example, time, links', () => {
  for (const [track, list] of Object.entries(FLOW.STARTERS)) {
    for (const t of list) {
      const b = FLOW.shapeBrief(t.brief);
      const at = `${track}: ${t.title}`;
      assert.ok(b, at);
      assert.ok(b.why.length >= 80, `${at}: why it matters`);
      assert.ok(Array.isArray(b.gives) && b.gives.length >= 1, `${at}: what June gives`);
      assert.ok(b.done.length >= 1, `${at}: done when`);
      assert.ok(b.proof.length >= 10, `${at}: proof`);
      assert.ok(b.example.length >= 40, `${at}: example`);
      assert.match(b.time, /\d|minutes/, `${at}: time`);
      assert.ok(b.resources.length >= 1 && b.resources.every((r) => r.url), `${at}: resources with links`);
      assert.ok(t.how_to && t.how_to.length >= 60, `${at}: steps`);
      /* The shop's rules: never promise rush or free shipping, never Oak Lawn. */
      const all = JSON.stringify(t);
      assert.doesNotMatch(all, /free shipping(?! anywhere)|rush order(?!s,)|oak lawn(?!\))/i, at);
    }
  }
});

test('a brief is checked: lists capped, links https or a back-office path, empty means none', () => {
  assert.strictEqual(FLOW.shapeBrief(null), null);
  assert.strictEqual(FLOW.shapeBrief({ why: '  ' }), null);
  const b = FLOW.shapeBrief({ why: 'w', done: Array(30).fill('x'), proof_required: 'yes',
    resources: [{ label: 'ok', url: 'https://www.jtees.net/a' }, { label: 'path', url: '/admin/leads' },
      { label: 'bad', url: 'javascript:alert(1)' }, { label: 'proto', url: '//evil.example' }, { label: '', url: 'https://x.org' }] });
  assert.strictEqual(b.done.length, 12);
  assert.strictEqual(b.proof_required, false, 'only a real true locks Done');
  assert.deepStrictEqual(b.resources.map((r) => r.url), ['https://www.jtees.net/a', '/admin/leads', '', '']);
  const f = FLOW.briefFromForm({ why: 'Because', gives: 'Login\n\nFolder', done_when: 'A\nB', proof_required: '1',
    resources: 'Photos | https://drive.google.com/x\nLeads | /admin/leads\nJust a name' });
  assert.deepStrictEqual(f.gives, ['Login', 'Folder']);
  assert.deepStrictEqual(f.done, ['A', 'B']);
  assert.strictEqual(f.proof_required, true);
  assert.deepStrictEqual(f.resources, [{ label: 'Photos', url: 'https://drive.google.com/x' }, { label: 'Leads', url: '/admin/leads' }, { label: 'Just a name', url: '' }]);
  assert.strictEqual(FLOW.cleanTemplate({ ...ok, why: 'Because it sells' }, TRACK_KEYS).template.brief.why, 'Because it sells');
});

test('proof: a task that asks for it closes only with a file or a link', () => {
  const brief = { proof: 'The files', proof_required: true };
  assert.strictEqual(FLOW.proofMissing(brief, { files: 0, note: 'did it' }), true);
  assert.strictEqual(FLOW.proofMissing(brief, { files: 1, note: '' }), false);
  assert.strictEqual(FLOW.proofMissing(brief, { files: 0, note: 'see https://drive.google.com/x' }), false);
  assert.strictEqual(FLOW.proofMissing(brief, { files: 0, note: 'see http://x.org' }), true, 'https only');
  assert.strictEqual(FLOW.proofMissing({ proof_required: false }, {}), false);
  assert.strictEqual(FLOW.proofMissing(null, {}), false);
  const done = route("app.post('/admin/tasks/:id/done', requireAdmin");
  assert.match(done, /FLOW\.proofMissing\(cur\.brief, \{ files: before \+ added\.length, note \}\)/);
  assert.match(done, /filter\(\(f\) => f && f\.by === staffId\)/, "only the helper's own files count as their proof");
});

test('the brief travels with every task made from the backlog, and old rows are written out once', () => {
  assert.match(fn('async function fillTaskLanes('), /RETURNING id, title, description, how_to, goal, brief/);
  assert.match(fn('async function makeRecurringTasks('), /t\.brief \? JSON\.stringify\(t\.brief\) : null/);
  assert.match(fn('async function makeAutoTasks('), /STARTERTASKS\.assetKitBrief\(e, \{ late: e\.ads <= now/);
  const bf = fn('async function backfillTaskBriefs(');
  assert.match(bf, /WHERE t\.track = \$1 AND t\.title = \$2 AND t\.brief IS NULL/, 'never overwrites a brief');
  assert.match(bf, /st\.brief IS NULL AND tt\.brief IS NOT NULL/);
});

test('a late season kit says it is late instead of quoting a start date that has passed', () => {
  const S = require('../tools/lib/task-starters');
  const CAL = require('../tools/lib/marketing-calendar');
  const e = CAL.datesFor(CAL.OCCASIONS.find((o) => o.id === 'christmas'), 2026);
  const late = S.assetKitBrief(e, { late: true, longDate: CAL.longDate });
  assert.match(late.description, /already late/);
  assert.doesNotMatch(late.description, /Ads and emails start/);
  const ontime = S.assetKitBrief(e, { late: false, longDate: CAL.longDate });
  assert.match(ontime.description, /Ads and emails start/);
  assert.ok(FLOW.shapeBrief(late.brief).proof_required);
  assert.ok(late.brief.resources.some((r) => r.url === 'https://www.jtees.net/occasions/christmas-shirts-chicago.html'));
});

test('the owner page: three tabs, one card per helper with their lanes, an empty lane says so', () => {
  const page = route("app.get('/admin/tasks', requireAdmin");
  for (const tab of ['Team now', 'Backlog', 'Done']) assert.ok(page.includes(`label: '${tab}'`), tab);
  assert.match(page, /TASK_SLOTS\.map\(/);
  assert.match(page, /Empty: nothing waiting in the/);
  assert.match(src, /title="The next helper with room in this lane gets this one first">Move to front</);
});

test('review fixes: a lone proof lock still locks, late and page-less kits read right, backfill keeps June\'s words', () => {
  const lock = FLOW.shapeBrief({ proof_required: true });
  assert.ok(lock && lock.proof_required && lock.proof.length > 10, 'ticking only the lock is not dropped');
  const S = require('../tools/lib/task-starters');
  const CAL = require('../tools/lib/marketing-calendar');
  const xmas = CAL.datesFor(CAL.OCCASIONS.find((o) => o.id === 'christmas'), 2026);
  assert.ok(S.assetKitBrief(xmas, { late: true, longDate: CAL.longDate }).brief.done.some((d) => /already late/.test(d)));
  assert.ok(!S.assetKitBrief(xmas, { late: true, longDate: CAL.longDate }).brief.done.some((d) => /attached before/.test(d)));
  const easter = CAL.datesFor(CAL.OCCASIONS.find((o) => o.id === 'easter'), 2027);
  const k = S.assetKitBrief(easter, { late: false, longDate: CAL.longDate });
  assert.match(k.description, /there is no page yet/);
  assert.doesNotMatch(k.how_to, /open the Easter page/);
  const bf = fn('async function backfillTaskBriefs(');
  assert.match(bf, /o\.created_at = t\.created_at\) >= 3/, 'only rows the starter button made');
  assert.match(bf, /st\.started_at IS NULL/, 'a started task keeps its rules');
  const done = route("app.post('/admin/tasks/:id/done', requireAdmin");
  assert.match(done, /WHERE id = \$1 AND assigned_to = \$2 AND started_at IS NOT NULL AND done_at IS NULL/, "another helper's task never answers with its brief");
});
