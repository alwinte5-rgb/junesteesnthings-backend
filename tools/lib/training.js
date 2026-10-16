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
  developer: { label: 'Developer', note: 'The stack, shipping through pull requests, outages and roll-backs, secrets and safe code, payment code, tests and Claude Code, apps.' },
  software: { label: 'Software sales', note: 'Our apps and their top plans, finding agencies, first messages and follow-ups, discovery and the demo, objections and approved offers, trials and setup, pay and the weekly report.' },
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

/* A Sales "ready" given before this time ends training even on a role path,
   from before role courses had their own ready sign-off: nobody already
   earning commission loses it. */
const LEGACY_READY_BEFORE = '2026-10-13T09:00:00Z';

/** The sign-off that ends training on a path: the last "ready" on it. On a
 *  sales-role path that is the role course's (signoff:closer-ready and so
 *  on); READY_KEY stays the Sales course milestone. */
const readyKeys = new Map();
function readyKeyFor(track = DEFAULT_TRACK, role = null) {
  /* Read on every helper request (the session), and fixed per path. */
  const memo = `${track}|${role}`;
  if (readyKeys.has(memo)) return readyKeys.get(memo);
  const key = readyKeyOfPath(track, role);
  readyKeys.set(memo, key);
  return key;
}
function readyKeyOfPath(track, role) {
  const keys = visibleSteps(undefined, track, role).filter((s) => s.type === 'signoff' && (s.key === READY_KEY || /^signoff:[a-z]+-ready$/.test(s.key))).map((s) => s.key);
  return keys.length ? keys[keys.length - 1] : READY_KEY;
}

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
        checks: l.checks || [], pages: l.pages || [], tryIt: l.tryIt || [], images: l.images || [], title: l.article.replace(/^(Sales course|Lead Generation|Sales Closer|Account Manager|Design course|Content course|Ads course|Bookkeeper course|Developer course|Software sales course|Team basics) [0-9a-z]+: /, '') });
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
 * module whose gate is not passed is `locked`, and so is a course's closing
 * sign-off until its final exam and lessons are done, and a module quiz
 * until its module's lessons are (`waiting` says which).
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
  /* A course's closing sign-offs (ready starts commission and ends training)
     share the final module with the final exam, so the module gate never
     held them. They wait for that exam and for every lesson in the course.
     A module quiz waits for that module's lessons. */
  const waitFor = (s) => {
    /* Done is done: a quiz passed or a sign-off given before these rules
       stays open, never greyed out again. */
    if (s.done) return '';
    /* A module quiz waits for its own module's lessons. */
    if (s.type === 'quiz' && s.gate && s.course && s.module !== `${s.course}:final`) {
      const n = raw.filter((x) => x.module === s.module && x.type === 'lesson' && !x.done).length;
      return n ? `${n} lesson${n === 1 ? '' : 's'}` : '';
    }
    if (s.type !== 'signoff' || !s.course || s.module !== `${s.course}:final`) return '';
    const exam = raw.find((x) => x.module === s.module && x.gate);
    const lessons = raw.filter((x) => x.course === s.course && x.type === 'lesson' && !x.done).length;
    return [exam && !exam.done ? 'the final exam' : '', lessons ? `${lessons} lesson${lessons === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
  };
  const steps = raw.map((s) => {
    if (!s.module) return { ...s, locked: false };
    const waiting = waitFor(s);
    const locked = (openUpTo !== -1 && order.indexOf(s.module) > openUpTo) || !!waiting;
    return { ...s, locked, waiting, done: s.type === 'buffer' ? !!gateDone.get(s.module) : s.done };
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
    /* Cut early when only as many sections are left as pages still owed, so
       a long late section can never leave the lesson short of pages
       (Codex #202). */
    for (let i = 0; i < sections.length - 1 && cuts.length < want; i++) {
      run += size[i];
      if (run >= (total * cuts.length) / want || sections.length - (i + 1) <= want - cuts.length) cuts.push(i + 1);
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
  reviews: 'New customer reviews. Approve real ones to show on the site; anything rude or about an order problem goes to June first. Draft a reply to each within two days: June approves replies before they go live.',
  certificates: 'Tax-exempt certificates. Check the name, the number and the date, leave a note, and let the owner approve or refuse.',
  discounts: 'Discount codes. Never offer one to win or keep a sale without the owner.',
  chat: 'Channels are for the whole team or your part of it; June sees them all. Direct with June is just the two of you. Ask whenever you are unsure; it is faster than guessing.',
  playbook: 'Ready-made replies and how we do things. Type a question in plain words, or a /shortcut. Copy a reply and adjust it to the customer.',
  resources: 'The tools you work in, with a link to each and how to get in. June shares any login you need here, one view each: save it in your own password manager.',
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
    QUIZZES[z.key] = { title: z.title, pass: passMark(z.questions.length), questions: z.questions.map((x, i) => balanced(z.key, x, i)) };
  }
}

/* Where the right answer sits. Most course questions were written with the
   right answer second, so always picking B passed most quizzes. Each
   question's choices are turned round (their order otherwise kept) so the
   right one lands at a spot that steps along with the question's place in
   the quiz (from a start fixed by the quiz key): spread evenly, and the same
   on every deploy. The page also shuffles the order each time (quizForPage),
   and the radio values stay these indexes. */
function balanced(quizKey, x, i) {
  const n = x.choices.length;
  if (n < 2) return x;
  const start = require('crypto').createHash('sha256').update(String(quizKey)).digest().readUInt32BE(0);
  const target = (start + i) % n;
  const shift = (target - x.answer + n) % n;
  if (!shift) return x;
  const choices = x.choices.map((_, i) => x.choices[(i - shift + n) % n]);
  return { ...x, choices, answer: target };
}

/** A fresh random order of 0..n-1 (crypto, so it cannot be predicted). */
function shuffledOrder(n) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = require('crypto').randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/* The order each question's choices were shown in travels with the form,
   signed, and each radio's value is its POSITION on the page, not the
   choice's stored index. Picking the same position everywhere then gives
   random answers, and the page source says nothing about which is right
   (the stored index follows a fixed pattern per quiz, see balanced()).
   Bound to the helper and the quiz, so a token cannot be reused elsewhere. */
function signOrder(secret, quizKey, staffId, orders, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ k: String(quizKey), s: Number(staffId), o: orders, t: Math.floor(Number(now) / 1000) })).toString('base64url');
  return `${body}.${require('crypto').createHmac('sha256', String(secret)).update(body).digest('base64url')}`;
}

/** The orders from a token signOrder made for this helper and quiz, or null
 *  when it is missing, altered, for someone else, or does not fit the quiz. */
function readOrder(secret, token, quizKey, staffId) {
  const d = readOrderToken(secret, token, quizKey, staffId);
  return d ? d.o : null;
}

/** Seconds from the quiz page being shown to it being handed in, from the
 *  same signed token, or null for a token from before the time was stamped
 *  or one that does not check out. Capped at a day. */
const QUIZ_SECONDS_MAX = 86400;
function quizSeconds(secret, token, quizKey, staffId, now = Date.now()) {
  const d = readOrderToken(secret, token, quizKey, staffId);
  if (!d || !Number.isInteger(d.t)) return null;
  const secs = Math.floor(Number(now) / 1000) - d.t;
  return secs < 0 ? null : Math.min(secs, QUIZ_SECONDS_MAX);
}

/** One check of a quiz form's token: { orders, seconds } (seconds null when
 *  the page predates timing), or null when it does not check out. */
function readQuizToken(secret, token, quizKey, staffId, now = Date.now()) {
  const d = readOrderToken(secret, token, quizKey, staffId);
  if (!d) return null;
  const secs = Number.isInteger(d.t) ? Math.floor(Number(now) / 1000) - d.t : null;
  return { orders: d.o, seconds: secs == null || secs < 0 ? null : Math.min(secs, QUIZ_SECONDS_MAX) };
}

/** When quiz tries started being timed, for the owner's note on older tries. */
const QUIZ_TIMING_SINCE = '2026-10-13';

function readOrderToken(secret, token, quizKey, staffId) {
  const t = String(token || '');
  if (t.length > 8000) return null;
  const [body, mac] = t.split('.');
  if (!body || !mac) return null;
  const want = require('crypto').createHmac('sha256', String(secret)).update(body).digest('base64url');
  if (mac.length !== want.length || !require('crypto').timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  let d;
  try { d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
  const z = Object.prototype.hasOwnProperty.call(QUIZZES, quizKey) ? QUIZZES[quizKey] : null;
  if (!z || !d || d.k !== String(quizKey) || d.s !== Number(staffId) || !d.o || typeof d.o !== 'object') return null;
  for (const x of z.questions) {
    const o = d.o[x.id];
    if (!Array.isArray(o) || o.length !== x.choices.length || [...o].sort((a, b) => a - b).some((v, i) => v !== i)) return null;
  }
  return d;
}

/** Turns positions picked on the page back into stored choice indexes. */
function picksFromPositions(orders, body = {}) {
  const out = {};
  for (const [id, o] of Object.entries(orders || {})) {
    const p = Number.parseInt(String(body[id] ?? ''), 10);
    if (Number.isInteger(p) && p >= 0 && p < o.length) out[id] = String(o[p]);
  }
  return out;
}

/** The quiz as a helper sees it: questions and choices, no answers. Each
 *  question carries `order`, a new random order to show its choices in; the
 *  value sent back for a choice is still its index in `choices`. */
function quizForPage(key) {
  const z = Object.prototype.hasOwnProperty.call(QUIZZES, key) ? QUIZZES[key] : null;
  if (!z) return null;
  return { title: z.title, pass: z.pass, questions: z.questions.map(({ id, q, choices }) => ({ id, q, choices, order: shuffledOrder(choices.length) })) };
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

/** A short fingerprint of a quiz's questions, choices and answers, stored
 *  with each attempt so an answer log read later can tell when the quiz has
 *  been reworded or reordered since. */
function quizHash(key) {
  const z = Object.prototype.hasOwnProperty.call(QUIZZES, key) ? QUIZZES[key] : null;
  if (!z) return null;
  const body = JSON.stringify(z.questions.map(({ id, q, choices, answer }) => [id, q, choices, answer]));
  return require('crypto').createHash('sha256').update(body).digest('hex').slice(0, 16);
}

/** What a helper picked, as stored in the answer log: one entry per question. */
function answerLog(results) {
  return results.map((x) => ({ id: x.id, picked: x.picked, pickedText: x.pickedText, right: x.right }));
}

/** How long a helper has spent on training, from what is recorded.
 *  Lesson time is wall clock from first open to finish, so a tab left open
 *  overnight counts; each lesson is capped at 3x its expected minutes and
 *  both totals are given. `events` are any other timestamps (quiz and exam
 *  tries, activity) used for active days and first/last day, counted in
 *  Chicago time. Nothing here blocks anyone. */
const TIME_CAP = 3;
function timeSpent(steps, times = new Map(), events = [], tz = 'America/Chicago', quizTries = []) {
  const day = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
  const lessons = [];
  for (const s of steps) {
    if (s.type !== 'lesson') continue;
    const t = times.get(s.key);
    if (!t || !t.started_at || !t.done_at) continue;
    const expected = Number(s.minutes) || 0;
    const raw = Math.max(0, Math.round((new Date(t.done_at) - new Date(t.started_at)) / 60000));
    lessons.push({ key: s.key, title: s.title || s.key, expected, raw, capped: expected ? Math.min(raw, expected * TIME_CAP) : raw });
  }
  const stamps = [...events];
  for (const t of times.values()) { if (t.started_at) stamps.push(t.started_at); if (t.done_at) stamps.push(t.done_at); }
  const valid = stamps.map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime())).sort((a, b) => a - b);
  const sum = (k) => lessons.reduce((n, l) => n + l[k], 0);
  /* Quiz time: page shown to handed in, per try (quizSeconds), capped like
     lessons. Tries from before the time was stamped have no seconds. */
  const quizMins = new Map(steps.filter((s) => s.type === 'quiz').map((s) => [s.quiz, Number(s.minutes) || 0]));
  const quizzes = new Map();
  for (const q of quizTries) {
    if (q.seconds == null || !quizMins.has(q.quiz_key)) continue;
    const raw = Math.max(0, Math.round(Number(q.seconds) / 60));
    const exp = quizMins.get(q.quiz_key);
    const z = quizzes.get(q.quiz_key) || { quiz: q.quiz_key, tries: 0, raw: 0, capped: 0, expected: 0 };
    z.tries += 1; z.raw += raw; z.capped += exp ? Math.min(raw, exp * TIME_CAP) : raw; z.expected += exp;
    quizzes.set(q.quiz_key, z);
  }
  const qsum = (k) => [...quizzes.values()].reduce((n, z) => n + z[k], 0);
  /* What is still to do, with its expected time (buffers are slack, not work). */
  const outstanding = steps.filter((s) => s.type !== 'buffer' && !s.done)
    .map((s) => ({ key: s.key, type: s.type, title: s.title || s.key, minutes: Number(s.minutes) || 0, locked: !!s.locked, module: s.moduleTitle || '' }));
  return { lessons, rawMinutes: sum('raw'), cappedMinutes: sum('capped'), expectedMinutes: sum('expected'),
    quizzes: [...quizzes.values()], quizMinutes: qsum('capped'), quizRawMinutes: qsum('raw'), quizExpectedMinutes: qsum('expected'),
    outstanding, outstandingMinutes: outstanding.reduce((n, o) => n + o.minutes, 0),
    activeDays: new Set(valid.map(day)).size, first: valid.length ? valid[0] : null, last: valid.length ? valid[valid.length - 1] : null };
}

/** "3h 20m" from minutes. */
function hm(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}` : `${m}m`;
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
const DEADLINE_X = (token) => new RegExp(token.replace(/[[\]]/g, '\\$&') + '(?= (?:business )?days\\b)');

/** The number a "[X] days" gap wants, from an answer like "5", "5 days" or
 *  "5 business days"; null when it is not a number (Codex #204: "5 business
 *  days" was saved as-is and read "5 business days business days"). */
function dayCount(answer) {
  const m = /^\s*(\d{1,3})(?:\s+(?:business\s+)?days?)?\s*$/i.exec(String(answer || ''));
  return m ? m[1] : null;
}

function ownerGaps(text) {
  const body = String(text || '');
  const lines = body.split('\n');
  /* "[X]" is the owner's only where it is the escalation deadline ("[X] days",
     "[X] business days"); in a ready-made reply ("need [X] shirts") it is a
     blank staff fill per customer, and must not be answered once for good
     (Codex #204). */
  return placeholders(body).filter((h) => /owner to fill in/i.test(h) || /^standard turnaround$/i.test(h)
      || (/^X$/i.test(h) && DEADLINE_X(`[${h}]`).test(body)))
    .flatMap((h) => {
      const token = `[${h}]`;
      const ask = h.replace(/,?\s*owner to fill in\s*:?\s*/i, ' ').trim();
      const gap = (line, nth) => {
        /* "[X] business days": the words after the blank stay, so ask for the number alone. */
        const hint = line.includes(`${token} business days`) || line.includes(`${token} days`) ? 'Just the number, e.g. 7' : '';
        return { token, ask: ask && !/^x$/i.test(ask) ? ask[0].toUpperCase() + ask.slice(1)
          : nth != null ? 'Fill in the blank in this line' : 'The number of business days', line: line.trim(), hint,
          ...(nth != null ? { nth } : {}) };
      };
      /* A bare "[owner to fill in]" says nothing about what it wants, so each
         copy is its own question, answered on its own (Codex #204: three
         different facts in one article took one answer). A named gap, like
         "[X]", means the same thing everywhere, so one answer fills every copy. */
      if (/^owner to fill in$/i.test(h.trim())) {
        const out = [];
        lines.forEach((l) => { let at = l.indexOf(token); while (at > -1) { out.push(gap(l, out.length)); at = l.indexOf(token, at + token.length); } });
        return out;
      }
      if (/^\[X\]$/i.test(token)) return [gap(lines.find((l) => DEADLINE_X(token).test(l)) || '')];
      return [gap(lines.find((l) => l.includes(token)) || '')];
    });
}

/** Writes the owner's answer in place of one gap: every copy of it, or only
 *  copy number `nth` (counting from 0) when given. Square brackets are taken
 *  out of the answer so it can never read as a new placeholder. */
function fillGap(text, token, answer, nth) {
  const a = String(answer || '').replace(/[\r\n]+/g, ' ').replace(/[[\]]/g, '').trim();
  if (!a) return null;
  /* Only the deadline copies of "[X]": any other "[X]" is a reply's blank (Codex #204). */
  if (nth == null && /^\[X\]$/i.test(token)) return String(text || '').replace(new RegExp(DEADLINE_X(token).source, 'g'), () => a);
  const parts = String(text || '').split(token);
  if (nth == null) return parts.join(a);
  if (!(Number.isInteger(nth) && nth >= 0 && nth < parts.length - 1)) return null;
  return parts.slice(0, nth + 1).join(token) + a + parts.slice(nth + 1).join(token);
}

module.exports = { FEATURES, TRACKS, DEFAULT_TRACK, trackOf, STEPS, READY_KEY, LEGACY_READY_BEFORE, readyKeyFor, signOrder, readOrder, quizSeconds, readQuizToken, QUIZ_TIMING_SINCE, picksFromPositions, PAGE_TIPS, QUIZZES, quizForPage, gradeQuiz, quizHash, answerLog, timeSpent, hm,
  visibleSteps, stepByKey, mayTick, progress, stepOpen, placeholders, ownerGaps, fillGap, dayCount, passMark, courseSteps, lessonPages,
  COURSES: COURSES.COURSES, SALES_ROLES: COURSES.SALES_ROLES, salesRoleOf: COURSES.salesRoleOf,
  lessonArticles: COURSES.lessonArticles, glossary: COURSES.glossary };
