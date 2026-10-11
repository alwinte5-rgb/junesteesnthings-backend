'use strict';

/* The training academy: one file per course, registered here.

   Every salesperson walks the consolidated Sales course (sales-core.js) until
   the owner gives them one of the three sales roles on Staff. The role then
   adds a second course written only for that job (sales-leadgen.js,
   sales-closer.js, sales-accounts.js as they are written). A role whose course
   is not written yet adds nothing, so assigning it early is harmless.

   A course is plain data: modules of lessons (playbook articles the owner can
   edit), practice steps, a quiz per module and a buffer row, then a final exam.
   tools/lib/training.js turns it into steps; tests/courses.test.js checks every
   course adds up to eight hours with at least an hour of buffer.

   Every other job has one course of its own (design-core.js for designers,
   content-core.js for the content (video) person, ads-core.js for ads, books-core.js for the bookkeeper, dev-core.js for the developer).
   Each opens with the Team basics module (shared-team.js), the same module
   object in every course: its quiz and lessons are registered once. */

const SALES_CORE = require('./sales-core');
const SALES_LEADGEN = require('./sales-leadgen');
const SALES_CLOSER = require('./sales-closer');
const SALES_ACCOUNTS = require('./sales-accounts');
const DESIGN_CORE = require('./design-core');
const CONTENT_CORE = require('./content-core');
const ADS_CORE = require('./ads-core');
const BOOKS_CORE = require('./books-core');
const DEV_CORE = require('./dev-core');

/* June's answers to the blanks in each lesson (answers.js). The unanswered
   body joins `was`, so a live copy she has not edited is replaced. */
const ANSWERS = require('./answers');
for (const c of [SALES_CORE, SALES_LEADGEN, SALES_CLOSER, SALES_ACCOUNTS, DESIGN_CORE, CONTENT_CORE, ADS_CORE, BOOKS_CORE, DEV_CORE]) {
  for (const l of c.modules.flatMap((m) => m.lessons)) {
    if (!l.body) continue;
    let b = l.body;
    for (const [token, answer] of Object.entries(ANSWERS)) b = b.split(token).join(answer);
    if (b !== l.body) { l.was = [...(l.was || []), l.body]; l.body = b; }
  }
}

/* Wording changed after lessons went live: [now, then]. A live article that
   still reads the old way (answers above already filled in) and was not
   otherwise edited is brought up to date. Applied after the answers, because
   the live copy has them filled in.
   2026-10-11: rush is embroidery only (Codex #195); handoffs to sales go to
   # Everyone, the channel content and ads helpers can see (Codex #224). */
const REWORDED = [
  ["**Rush**\n\nOnly **embroidery** can be rushed: it is the one thing we make in house. Screen printing and DTF are made for us by a partner in 7 to 10 business days, and they sell no rush at any price. So for a screen print, DTF, or a mix that includes either, the answer to \"can you do it faster?\" is \"let me ask June\", never a yes and never a price.\n\nOn embroidery, for a fee, depending on what is on the machine:\n\n- Next business day: +80%\n- 2 business days: +50%\n- 3 business days: +30%\n- 4 business days: +10%\n\nThe quote form sets the rush from the **Needed by** date you enter, so get the real date from the customer. Never promise a rush date before June confirms it can be done.",
   "**Rush**\n\nFor a fee, depending on what is on the press:\n\n- Next business day: +80%\n- 2 business days: +50%\n- 3 business days: +30%\n- 4 business days: +10%\n\nThe quote form sets the rush from the **Needed by** date you enter, so get the real date from the customer. Never promise a rush date before June confirms the press can do it."],
  ['in the # Everyone channel, tagged "for sales", the same day, so sales can follow up (content helpers cannot see # Sales)',
   'in the # Sales channel, the same day, so sales can follow up'],
  ['send would-be customers to the quote form and post them in the # Everyone channel for sales',
   'send would-be customers to the quote form and the # Sales channel'],
  ['2. Tell sales in # Everyone that a test is coming', '2. Tell sales in # Sales that a test is coming'],
  ['point them to the quote form and post it in # Everyone for sales\n', 'point them to the quote form and post it in # Sales\n'],
  ['Ask sales in # Everyone which quote requests', 'Ask in # Sales which quote requests'],
  ['every Monday, sales posts in # Everyone which', 'every Monday, sales posts in # Sales which'],
  /* Codex #230: the ad cap now allows for Google's overdelivery, and the
     developer is told the repo's self-merge rule is not theirs. */
  ['$100 a month at most to start, and never more than $5 on any one day. Google may spend up to twice the daily budget on a busy day, so set it to $2.50 a day (about $76 a month): then no day can pass $5. June raises it',
   '$100 a month to start (about $3 a day), and never more than $5 on any one day. June raises it'],
  [' The repository rules tell Claude Code to merge its own finished pull request; you do not: tell it to stop at an open pull request, and GitHub keeps main locked until June approves.', ''],
];
for (const c of [SALES_CORE, CONTENT_CORE, ADS_CORE, DEV_CORE]) {
  for (const l of c.modules.flatMap((m) => m.lessons)) {
    if (typeof l.body !== 'string' || !REWORDED.some(([now]) => l.body.includes(now))) continue;
    l.was = [...(l.was || []), REWORDED.reduce((b, [now, then]) => b.split(now).join(then), l.body)];
  }
}

const COURSES = { [SALES_CORE.key]: SALES_CORE, [SALES_LEADGEN.key]: SALES_LEADGEN, [SALES_CLOSER.key]: SALES_CLOSER,
  [SALES_ACCOUNTS.key]: SALES_ACCOUNTS, [DESIGN_CORE.key]: DESIGN_CORE, [CONTENT_CORE.key]: CONTENT_CORE,
  [ADS_CORE.key]: ADS_CORE, [BOOKS_CORE.key]: BOOKS_CORE,
  [DEV_CORE.key]: DEV_CORE };

/* The course each non-sales track walks. */
const TRACK_COURSES = { design: [DESIGN_CORE], content: [CONTENT_CORE], ads: [ADS_CORE], bookkeeper: [BOOKS_CORE], developer: [DEV_CORE] };

/* The three sales jobs. Until all three are filled, everyone does all of it. */
const SALES_ROLES = {
  leadgen:  { label: 'Lead Generation', goal: 'Fill the pipeline: find groups that need shirts soon, make the first personal contact, and turn replies into quote requests.' },
  closer:   { label: 'Sales Closer', goal: 'Turn every inbound lead into a paid order: reply fast, quote right, upsell, follow up and collect the deposit.' },
  accounts: { label: 'Account Manager', goal: 'Keep past customers ordering: reorders, yearly accounts, reviews and upgrades.' },
};

/** A sales role from anywhere (a form, a row), or null for "not assigned yet". */
function salesRoleOf(r) {
  return Object.prototype.hasOwnProperty.call(SALES_ROLES, r) ? r : null;
}

/** The courses a helper walks, in order: the track's core course, then their role's. */
function coursesFor(track, role = null) {
  if (track !== 'sales') return Object.prototype.hasOwnProperty.call(TRACK_COURSES, track) ? TRACK_COURSES[track] : [];
  const out = [SALES_CORE];
  const r = salesRoleOf(role);
  if (r && COURSES[`sales-${r}`]) out.push(COURSES[`sales-${r}`]);
  return out;
}

/** Every lesson article across every course, for the playbook. */
function lessonArticles() {
  const seen = new Set();
  return Object.values(COURSES).flatMap((c) => c.modules.flatMap((m) => m.lessons.filter((l) => !l.existing && !seen.has(l) && seen.add(l)).map((l) => ({
    kind: 'course', title: l.article, tags: `training, course, ${m.key === 'team' ? 'team basics' : c.title.toLowerCase()}, ${l.tags || ''}`.replace(/,\s*$/, ''),
    body: l.body, needsReview: true, ...(l.was ? { was: l.was } : {}),
  }))));
}

/** One glossary across every course; the first definition of a term wins. */
function glossary() {
  const out = {};
  for (const c of Object.values(COURSES)) for (const [k, v] of Object.entries(c.glossary || {})) if (!out[k]) out[k] = v;
  return out;
}

module.exports = { COURSES, SALES_ROLES, salesRoleOf, coursesFor, lessonArticles, glossary };
