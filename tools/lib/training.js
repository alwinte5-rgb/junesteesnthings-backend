'use strict';

/* Training: the path a new helper walks before working on their own.

   Three kinds of step, and who can tick each:

     read     a playbook article. The helper ticks "I've read it".
     do       a first piece of real work (a lead answered, a quote built). It
              ticks ITSELF from what is in the database, computed on every
              view the way commission is, so it can never say done when the
              work was not.
     signoff  a skill the owner has seen. Only the owner can tick it.
     quiz     a short multiple-choice quiz. The server marks it, and the step
              is done once a passing attempt is stored; nobody ticks it. A
              helper may retake it, so their result never shows the answers:
              only which questions were wrong, and the article to re-read.

   The last sign-off, "ready", ends training: page tips stop, and the Team page
   suggests moving the helper up from Training. Moving them stays the owner's
   decision on /admin/staff.

     lesson   a course lesson: a playbook article with minutes, goals and
              "check yourself" questions. The helper ticks "I've finished".
     buffer   catch-up time at the end of a module. Never ticked; it shows
              how the day is meant to run, and is "done" once the module is.
     exam     the quote exam (tools/lib/courses), marked against the owner's
              own quotes. Done once a passing attempt is stored.

   Two paths, by the helper's job (staff.training_track): `sales` and
   `design`. Sales walks the academy courses in tools/lib/courses: the
   consolidated Sales course, then the course for the sales role the owner
   assigns (staff.sales_role). Courses are split into modules; a module opens
   once the one before it has passed its quiz. Design walks the Design
   course, which opens with the Team basics module every non-sales course
   shares. Keys stay unique within a path, so a tick means one thing.

   A step can name a `needs` feature that ships later (the end-of-day note,
   proofs). It is hidden until that feature is listed in FEATURES, so nobody
   is asked to do something the workspace cannot do yet. */

const COURSES = require('./courses');

/* Every quiz and exam passes at 80%, rounded up to a whole question. */
const PASS_SHARE = 0.8;
const passMark = (n) => Math.ceil(n * PASS_SHARE - 1e-9);

/* Features this deploy has. A later PR adds its name here, and the steps
   that wait for it appear. */
const FEATURES = new Set(['proofs', 'resources', 'quoteexam']);

const TRACKS = {
  sales:  { label: 'Sales', note: 'Leads, quotes, follow-ups and finding new customers.' },
  design: { label: 'Design', note: 'Print-ready artwork, signs, proofs, AI and its cleanup, site and blog images, and social graphics.' },
  content: { label: 'Content (video)', note: 'Shot lists, editing shorts and longer videos, music and permission rules, posting, comments and the Friday numbers.' },
  ads: { label: 'Ads', note: 'Conversion tracking, Google Search, negatives and the $40 rule, Meta retargeting, seasonal campaigns and the weekly report.' },
  bookkeeper: { label: 'Bookkeeper', note: 'Sales and fees, expenses and receipts, job costs, refunds and disputes, Illinois sales tax, the month-end close and the summary for June.' },
};
const DEFAULT_TRACK = 'sales';

/** A track name from anywhere (a form, a row), or the default. */
function trackOf(t) {
  return Object.prototype.hasOwnProperty.call(TRACKS, t) ? t : DEFAULT_TRACK;
}

/* Steps outside any course. Every path is a course now (tools/lib/courses):
   the Design course replaced the design checklist on 2026-10-09 and kept its
   keys. A track without a course would walk these. */
const STEPS = [];

const READY_KEY = 'signoff:ready';

/* A course as steps, in order. Each step carries its module, so the page can
   group them and progress() can keep later modules closed. A module's gate
   is its quiz, or its exam when it has no quiz; a module with neither (or
   whose gate waits for a feature) never holds the next one shut. */
function courseSteps(course, features = FEATURES) {
  const out = [];
  const mods = [...course.modules, { key: 'final', title: 'Final exam and sign-off', final: true }];
  mods.forEach((m, i) => {
    const mod = { module: `${course.key}:${m.key}`, moduleTitle: m.title, moduleIndex: i, moduleIcon: m.icon || '', course: course.key };
    const push = (st) => { if (!st.needs || features.has(st.needs)) out.push({ ...st, ...mod }); };
    if (m.final) {
      push({ key: `buffer:${course.key}:final`, type: 'buffer', minutes: course.final.floating,
        title: 'Buffer: catch up before the final exam', hint: 'Re-read anything you were unsure of, finish any step still open, and ask June what you need.' });
      push({ key: `quiz:${course.final.quiz.key}`, type: 'quiz', quiz: course.final.quiz.key, minutes: course.final.quiz.minutes, gate: true,
        title: `Pass the final exam (${course.final.quiz.questions.length} questions)`,
        hint: `Get ${passMark(course.final.quiz.questions.length)} right (80%). Retake it as often as you need.` });
      course.final.signoffs.forEach(push);
      return;
    }
    for (const l of m.lessons) {
      push({ key: `lesson:${l.id}`, type: 'lesson', article: l.article, minutes: l.minutes, goals: l.goals || [],
        checks: l.checks || [], pages: l.pages || [], tryIt: l.tryIt || [], images: l.images || [], title: l.article.replace(/^(Sales course|Lead Generation|Sales Closer|Account Manager|Design course|Content course|Ads course|Bookkeeper course|Team basics) [0-9a-z]+: /, '') });
    }
    for (const x of m.practice || []) push(!m.quiz && x.type === 'exam' ? { ...x, gate: true } : x);
    if (m.quiz) {
      push({ key: `quiz:${m.quiz.key}`, type: 'quiz', quiz: m.quiz.key, minutes: m.quiz.minutes, gate: true,
        title: m.quiz.title, hint: `${m.quiz.questions.length} questions. Get ${passMark(m.quiz.questions.length)} right (80%). Retake it as often as you need.` });
    }
    push({ key: `buffer:${course.key}:${m.key}`, type: 'buffer', minutes: m.buffer,
      title: 'Buffer: catch-up time', hint: 'Re-read, ask June in Team chat, or retake the quiz. Ahead of time? Move on.' });
  });
  return out;
}

function visibleSteps(features = FEATURES, track = DEFAULT_TRACK, role = null) {
  const t = trackOf(track);
  const courses = COURSES.coursesFor(t, role);
  if (courses.length) return courses.flatMap((c) => courseSteps(c, features));
  return STEPS.filter((s) => (!s.needs || features.has(s.needs)) && (s.tracks || [DEFAULT_TRACK]).includes(t))
    .map((s) => (s[t] ? { ...s, ...s[t] } : s));
}

function stepByKey(key, features = FEATURES, track = DEFAULT_TRACK, role = null) {
  return visibleSteps(features, track, role).find((s) => s.key === key) || null;
}

/** May this person tick this step? A helper ticks their own reading and
 *  lessons; only the owner signs off; "do", quiz, exam and buffer rows are
 *  never ticked by hand. */
function mayTick(key, byOwner, features = FEATURES, track = DEFAULT_TRACK, role = null) {
  const s = stepByKey(key, features, track, role);
  if (!s) return false;
  if (s.type === 'read' || s.type === 'lesson') return true;
  if (s.type === 'signoff') return !!byOwner;
  return false;
}

/**
 * Where a helper stands.
 * @param ticks  Map step_key -> { done_at, signed_by } from staff_training
 * @param facts  counts of real work: { leads, quotes, messages, eod, proofs,
 *               prospects, quizzes: { key: passes }, exams: { key: passes } }
 * @param times  Map step_key -> { started_at, done_at } from staff_lesson_time
 *
 * Buffer rows are time, not work: never counted in done/total, and shown
 * done once their module's gate is passed. Every step after the first
 * module whose gate is not passed is `locked`.
 */
function progress(ticks, facts = {}, features = FEATURES, track = DEFAULT_TRACK, role = null, times = new Map()) {
  const raw = visibleSteps(features, track, role).map((s) => {
    const t = ticks.get(s.key);
    const done = s.type === 'do' ? Number(facts[s.fact] || 0) >= (s.need || 1)
      : s.type === 'quiz' ? Number((facts.quizzes || {})[s.quiz] || 0) > 0
      : s.type === 'exam' ? Number((facts.exams || {})[s.exam] || 0) > 0
      : s.type === 'buffer' ? false : !!t;
    const tm = times.get(s.key);
    const took = tm && tm.started_at && tm.done_at
      ? Math.max(0, Math.round((new Date(tm.done_at) - new Date(tm.started_at)) / 60000)) : null;
    return { ...s, done, doneAt: t ? t.done_at : null, signedBy: t ? t.signed_by : null, took };
  });
  const gateDone = new Map();
  for (const s of raw) if (s.gate) gateDone.set(s.module, s.done);
  const order = [...new Set(raw.filter((s) => s.module).map((s) => s.module))];
  const openUpTo = order.findIndex((m) => gateDone.has(m) && !gateDone.get(m));
  const steps = raw.map((s) => {
    if (!s.module) return { ...s, locked: false };
    const locked = openUpTo !== -1 && order.indexOf(s.module) > openUpTo;
    return { ...s, locked, done: s.type === 'buffer' ? !!gateDone.get(s.module) : s.done };
  });
  const work = steps.filter((s) => s.type !== 'buffer');
  const done = work.filter((s) => s.done).length;
  return { steps, done, total: work.length, next: work.filter((s) => !s.done && !s.locked).slice(0, 3),
           complete: done === work.length,
           minutes: { expected: steps.reduce((n, s) => n + (Number(s.minutes) || 0), 0),
                      took: steps.reduce((n, s) => n + (s.took || 0), 0) } };
}

/**
 * A lesson article cut into pages. The article is split into sections at its
 * bold heading lines ("**Who we are**"); a page starts at the section whose
 * heading is its `from` (the first page starts at the top). If any `from`
 * heading is missing (the owner renamed it in the Playbook), the sections
 * are shared out evenly by length across the same number of pages instead,
 * so an edit never breaks a lesson. Returns one markdown string per page.
 */
function lessonPages(body, pages = []) {
  const blocks = String(body || '').split(/\n{2,}/);
  const isHead = (b) => /^\*\*[^*\n]+\*\*$/.test(b.trim());
  const sections = [];
  for (const b of blocks) {
    if (!sections.length || isHead(b)) sections.push({ head: isHead(b) ? b.trim().slice(2, -2) : null, blocks: [] });
    sections[sections.length - 1].blocks.push(b);
  }
  const want = Math.max(1, Math.min(pages.length || 1, sections.length));
  const starts = pages.slice(1, want).map((pg) => sections.findIndex((x) => x.head === pg.from));
  let cuts;
  if (starts.every((i, n) => i > 0 && (n === 0 || i > starts[n - 1]))) cuts = [0, ...starts];
  else {
    const size = sections.map((x) => x.blocks.join(' ').length);
    const total = size.reduce((a, b) => a + b, 0);
    cuts = [0];
    let run = 0;
    for (let i = 0; i < sections.length && cuts.length < want; i++) {
      run += size[i];
      if (run >= (total * cuts.length) / want && i + 1 < sections.length) cuts.push(i + 1);
    }
  }
  return cuts.map((c, n) => sections.slice(c, cuts[n + 1] || sections.length).flatMap((x) => x.blocks).join('\n\n'));
}

/** Is this step open to the helper now? False for a locked module's step. */
function stepOpen(p, key) {
  const s = p.steps.find((x) => x.key === key);
  return !!s && !s.locked;
}

/* A short note at the top of each page while a helper is in training: what
   the page is for, and the one mistake to avoid. Keyed by the menu key the
   page passes to adminPage(). Drafted for the owner to edit. */
const PAGE_TIPS = {
  myday: 'Start here every shift. Work top to bottom: leads waiting, then follow-ups, then tasks and jobs. The oldest lead is always first. Press Start on a task when you take it on, and Mark completed when it is done. Fold away any section you do not need.',
  earnings: 'Your commission on sales credited to you. A sale becomes payable 14 days after it is paid in full, if there is no open dispute.',
  leads: 'Everyone who asked about an order. Log every call, email, text or chat on the lead; that is what counts as answered. Set a follow-up date before you leave a lead.',
  quotes: 'The money board: quotes out, accepted, waiting on a deposit. Build a new quote from a lead with its Quote button so the two stay linked.',
  production: 'The work board: artwork, proof, blanks, printing, ready. Move a job to its next step only when that step is really done.',
  orders: 'Online orders from the design studio. Check the artwork and the tax certificate badge before anything is produced.',
  shipping: 'Labels and tracking for orders going out. Double-check the address before buying a label; a label cannot be moved.',
  delivery: 'Local deliveries by day and window. Mark each one Out when it leaves and Delivered when it is handed over; moving one tells the customer.',
  customers: 'Everyone who has ordered or asked. Search by name, email or phone to see their whole history before you reply.',
  reviews: 'Customer reviews waiting to go on the site. Approve real ones; anything rude or about an order problem goes to the owner first.',
  certificates: 'Tax-exempt certificates. Check the name, the number and the date, leave a note, and let the owner approve or refuse.',
  discounts: 'Discount codes. Never offer one to win or keep a sale without the owner.',
  chat: 'Channels are for the whole team or your part of it; June sees them all. Direct with June is just the two of you. Ask whenever you are unsure; it is faster than guessing.',
  playbook: 'Ready-made replies and how we do things. Type a question in plain words, or a /shortcut. Copy a reply and adjust it to the customer.',
  resources: 'The tools you work in, with a link to each and how to get in. Logins are never here: they are in the team password manager.',
  training: 'Your training path. Reading steps you tick yourself, work steps tick when you do the work, and the owner signs off the rest.',
};

/* Every quiz lives in its course (tools/lib/courses) and joins this list,
   passing at 80%. Each answer matches a playbook article, so a wrong answer
   is explained by the rule the helper will meet at work. `answer` is the
   index of the right choice; it never reaches the page until the quiz is
   marked. A module shared by several courses (Team basics) is one quiz,
   registered once. */
const QUIZZES = {};
const seenQuiz = new Set();
for (const c of Object.values(COURSES.COURSES)) {
  for (const z of [...c.modules.map((m) => m.quiz).filter(Boolean), c.final.quiz]) {
    if (seenQuiz.has(z)) continue;
    seenQuiz.add(z);
    if (QUIZZES[z.key]) throw new Error(`quiz key ${z.key} is used twice`);
    QUIZZES[z.key] = { title: z.title, pass: passMark(z.questions.length), questions: z.questions };
  }
}

/** The quiz as a helper sees it: questions and choices, no answers. */
function quizForPage(key) {
  const z = Object.prototype.hasOwnProperty.call(QUIZZES, key) ? QUIZZES[key] : null;
  if (!z) return null;
  return { title: z.title, pass: z.pass, questions: z.questions.map(({ id, q, choices }) => ({ id, q, choices })) };
}

/**
 * Mark a quiz. `picked` maps question id -> chosen index (form strings are
 * fine). An unanswered or out-of-range pick is wrong, never an error.
 */
function gradeQuiz(key, picked = {}) {
  const z = Object.prototype.hasOwnProperty.call(QUIZZES, key) ? QUIZZES[key] : null;
  if (!z) return null;
  const results = z.questions.map((x) => {
    const raw = Object.prototype.hasOwnProperty.call(picked, x.id) ? String(picked[x.id]) : '';
    const n = /^\d{1,2}$/.test(raw) && Number(raw) < x.choices.length ? Number(raw) : null;
    return { id: x.id, q: x.q, picked: n, pickedText: n === null ? null : x.choices[n],
             answer: x.answer, answerText: x.choices[x.answer], right: n === x.answer, why: x.why, article: x.article };
  });
  const score = results.filter((r) => r.right).length;
  return { score, total: results.length, pass: z.pass, passed: score >= z.pass, results };
}

/** Unfilled placeholders like "[standard turnaround]" or "[owner to fill in]"
 *  in a playbook article. Markdown links "[text](url)" are not placeholders. */
function placeholders(text) {
  const out = [];
  const re = /\[([^\]\n]{1,200})\](?!\()/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push(m[1]);
  return [...new Set(out)];
}

/** The placeholders only the owner can answer, as opposed to the blanks in a
 *  ready-made reply ("[name]", "[time]") that staff fill in per customer.
 *  A gap says "owner to fill in", or is one of the two the first playbook was
 *  written with: "[standard turnaround]" and the escalation deadline "[X]".
 *  Each comes with the question to ask and the line it sits in, so the owner
 *  can answer it without opening the article. */
function ownerGaps(text) {
  const body = String(text || '');
  return placeholders(body).filter((h) => /owner to fill in/i.test(h) || /^(standard turnaround|X)$/i.test(h))
    .map((h) => {
      const token = `[${h}]`;
      const line = body.split('\n').find((l) => l.includes(token)) || '';
      const ask = h.replace(/,?\s*owner to fill in\s*:?\s*/i, ' ').trim();
      /* "[X] business days": the words after the blank stay, so ask for the number alone. */
      const hint = line.includes(`${token} business days`) || line.includes(`${token} days`) ? 'Just the number, e.g. 7' : '';
      return { token, ask: ask && !/^x$/i.test(ask) ? ask[0].toUpperCase() + ask.slice(1) : 'The number of business days', line: line.trim(), hint };
    });
}

/** Writes the owner's answer in place of one gap, everywhere it appears in the
 *  article. Square brackets are taken out of the answer so it can never read
 *  as a new placeholder. */
function fillGap(text, token, answer) {
  const a = String(answer || '').replace(/[\r\n]+/g, ' ').replace(/[[\]]/g, '').trim();
  if (!a) return null;
  return String(text || '').split(token).join(a);
}

module.exports = { FEATURES, TRACKS, DEFAULT_TRACK, trackOf, STEPS, READY_KEY, PAGE_TIPS, QUIZZES, quizForPage, gradeQuiz,
  visibleSteps, stepByKey, mayTick, progress, stepOpen, placeholders, ownerGaps, fillGap, passMark, courseSteps, lessonPages,
  COURSES: COURSES.COURSES, SALES_ROLES: COURSES.SALES_ROLES, salesRoleOf: COURSES.salesRoleOf,
  lessonArticles: COURSES.lessonArticles, glossary: COURSES.glossary };
