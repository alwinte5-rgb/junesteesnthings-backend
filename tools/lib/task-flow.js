'use strict';

/* A steady flow of real work for every helper (owner, 2026-10-21: "My helpers
   need consistent work ... one long term task, a medium term task and a short
   term task for variety ... I don't want to just give busy work but effective
   work").

   Each helper holds at most ONE open task in each lane:

     short   done in a shift          (variety, quick wins)
     medium  two to five days         (builds something)
     long    two to six weeks         (moves the business)

   plus the "every day" routine (recurring templates) and whatever the owner or
   the shop adds by hand (no lane), which always come first. When a lane is
   empty the next task in that lane of their role's backlog is handed to them
   at once, so finishing one task is starting the next. The owner fills the
   backlogs once (the starter tasks below are a first set she edits), and is
   told when a lane is running low.

   Every task says which result it moves (sales, conversion, retention or
   capacity) so nothing in a backlog is busy work. Kept apart from the SQL so
   the rules can be tested. */

const LANES = {
  short:  { label: 'Now', hint: 'done in a shift' },
  medium: { label: 'This week', hint: 'two to five days' },
  long:   { label: 'Big project', hint: 'two to six weeks' },
};
const LANE_KEYS = Object.keys(LANES);
/* Recurring tasks sit outside the three lanes: the routine, every work day. */
const DAILY = 'daily';
const REPEATS = ['none', 'daily', 'weekly'];
const GOALS = {
  sales:      'More sales',
  conversion: 'More visitors become customers',
  retention:  'Customers come back',
  capacity:   'Saves June time',
};
/* A lane with fewer than this many tasks waiting is "running low". */
const LOW = 3;
const TITLE_MAX = 200;
const TEXT_MAX = 8000;

const one = (v, max) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, max);
const many = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);

/** A backlog task from the owner's form: { template } or { error }. `tracks`
 *  is the list of role keys a template may be for. */
function cleanTemplate(b, tracks) {
  const x = b || {};
  const track = String(x.track || '');
  if (!tracks.includes(track)) return { error: 'Pick who the task is for.' };
  const repeat = REPEATS.includes(String(x.repeat)) ? String(x.repeat) : 'none';
  const lane = repeat === 'none' ? String(x.lane || '') : DAILY;
  if (repeat === 'none' && !LANE_KEYS.includes(lane)) return { error: 'Pick a lane: Now, This week or Big project.' };
  const title = one(x.title, TITLE_MAX);
  if (title.length < 3) return { error: 'A task needs a title.' };
  const goal = Object.hasOwn(GOALS, String(x.goal || '')) ? String(x.goal) : null;
  if (!goal) return { error: 'Say what the task moves: sales, conversion, retention or June\'s time.' };
  const weekday = repeat === 'weekly' ? Number(x.weekday) : null;
  if (repeat === 'weekly' && !(Number.isInteger(weekday) && weekday >= 1 && weekday <= 7)) return { error: 'Pick the day a weekly task comes round.' };
  return { template: { track, lane, repeat, weekday, title, goal,
    description: many(x.description, TEXT_MAX) || null, how_to: many(x.how_to, TEXT_MAX) || null,
    brief: x.brief && typeof x.brief === 'object' ? shapeBrief(x.brief) : briefFromForm(x) } };
}

/** The lanes a helper has room in: every lane with no open task in it. */
function lanesToFill(openLanes) {
  const busy = new Set((openLanes || []).map(String));
  return LANE_KEYS.filter((l) => !busy.has(l));
}

/** Does a recurring template make a task on this day? `weekday` is 1 (Mon) to
 *  7 (Sun) in the helper's own time zone; `workday` whether they work today
 *  (a shift on their schedule, or Monday to Friday when they have none). A
 *  weekly task comes on its day only if that is a work day. */
function recurringDue(t, weekday, workday) {
  if (!t || !workday) return false;
  if (t.repeat === 'daily') return true;
  if (t.repeat === 'weekly') return Number(t.weekday) === Number(weekday);
  return false;
}

/** Whether a helper works on a day: a shift that day, or, with no shifts on
 *  their schedule at all, Monday to Friday. */
function isWorkday(weekday, shiftDays, hasShifts) {
  if (hasShifts) return (shiftDays || []).map(Number).includes(Number(weekday));
  return Number(weekday) >= 1 && Number(weekday) <= 5;
}

/** The lanes running low, for roles someone works in: [{ track, lane, n }].
 *  `waiting` maps "track:lane" to the tasks still waiting in that backlog. */
function lowLanes(waiting, tracks) {
  const out = [];
  for (const track of tracks) {
    for (const lane of LANE_KEYS) {
      const n = Number((waiting || {})[`${track}:${lane}`]) || 0;
      if (n < LOW) out.push({ track, lane, n });
    }
  }
  return out;
}

/** The ISO week a date falls in, "2026-W43": one low-backlog alert a week. */
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const wk = Math.ceil(((t - Date.UTC(y, 0, 1)) / 86400000 + 1) / 7);
  return `${y}-W${String(wk).padStart(2, '0')}`;
}

/* A task's brief (owner, 2026-10-22: "go deeper ... don't be vague"): why it
   matters, what June gives, the done checklist, the proof to attach, an
   example, the time it takes and where to look. Stored as JSON on the backlog
   row and on each task made from it; tools/lib/task-starters.js has the
   starter tasks written out in full. */
const BRIEF_LIST_MAX = 12;
const linkOk = (u) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/[^\s<>"']*)?$/i.test(u) || /^\/[a-z0-9][^\s<>"']*$/i.test(u);

/** A brief, checked and capped, or null when it says nothing. */
function shapeBrief(raw) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const list = (v, max) => (Array.isArray(v) ? v : []).map((x) => one(x, max)).filter(Boolean).slice(0, BRIEF_LIST_MAX);
  const resources = (Array.isArray(o.resources) ? o.resources : []).map((r) => {
    const label = one(r && r.label, 120);
    const url = one(r && r.url, 500);
    return label ? { label, url: linkOk(url) ? url : '' } : null;
  }).filter(Boolean).slice(0, BRIEF_LIST_MAX);
  const b = {
    why: many(o.why, 1500), gives: list(o.gives, 300), done: list(o.done, 300),
    proof: many(o.proof, 600), proof_required: o.proof_required === true, example: many(o.example, 2000),
    time: one(o.time, 100), resources,
  };
  const empty = !b.why && !b.gives.length && !b.done.length && !b.proof && !b.example && !b.time && !b.resources.length && !b.proof_required;
  /* A lock with nothing said about what to attach still says something. */
  if (b.proof_required && !b.proof) b.proof = 'The finished work: the files, or a link to them.';
  return empty ? null : b;
}

/** The brief from the owner's backlog form: one item per line, and a
 *  resource as "Label | link". */
function briefFromForm(x) {
  const lines = (v) => String(v == null ? '' : v).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  return shapeBrief({
    why: x.why, gives: lines(x.gives), done: lines(x.done_when), proof: x.proof,
    proof_required: x.proof_required === '1' || x.proof_required === 'on' || x.proof_required === true,
    example: x.example, time: x.time,
    resources: lines(x.resources).map((l) => { const [label, url] = l.split('|').map((p) => p.trim()); return { label, url: url || '' }; }),
  });
}

/** Does closing this task need proof it does not have? A brief that asks for
 *  proof is met by a file attached by the helper (now or before) or an https
 *  link in what they wrote. */
function proofMissing(brief, { files = 0, note = '' } = {}) {
  if (!brief || brief.proof_required !== true) return false;
  return !(files > 0 || /https:\/\/\S+/i.test(String(note || '')));
}

const { STARTERS } = require('./task-starters');

module.exports = {
  LANES, LANE_KEYS, DAILY, REPEATS, GOALS, LOW, TITLE_MAX, TEXT_MAX, STARTERS,
  shapeBrief, briefFromForm, proofMissing,
  cleanTemplate, lanesToFill, recurringDue, isWorkday, lowLanes, isoWeek,
};
