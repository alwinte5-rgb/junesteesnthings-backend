'use strict';
/* The back-office tour (plan PR 5, 2026-10-22): every helper, whatever their
 * job, walks the screens they will use, one stop at a time. A stop ticks when
 * they open it from the tour, or, for a "try it" stop, when the work is really
 * done (a clock-in, a task completed, a chat message). Progress is kept in
 * staff_training under `tour:<key>`, the table the training path already uses.
 *
 * It sits outside the 8-hour courses on purpose: every course is held to an
 * eight-hour day (tests/courses.test.js), and the tour is about ten minutes.
 *
 * `needs` names the permission a stop's page needs (STAFF levels); a stop
 * whose page the helper cannot open is left out. `fact` names a key of
 * tourFacts() in server.js that ticks the stop by itself. */

const STOPS = [
  { key: 'myday', title: 'My Day', href: '/admin/my-day', minutes: 1,
    what: 'Where every shift starts. Work top to bottom: people waiting on you, then your tasks and projects, then the jobs. The counts at the top jump to each section.' },
  { key: 'clock', title: 'Clock in and out', href: '/admin/clock', minutes: 1, fact: 'clocked', tryIt: 'Clock in once',
    what: 'Clock in when you start and out when you stop. Your pay comes from these hours, and a long quiet gap is noticed, so clock out for breaks.' },
  { key: 'tasks', title: 'Tasks: Start, then Mark completed', href: '/admin/my-day', minutes: 2, fact: 'taskDone', tryIt: 'Start a task and mark it completed with a note',
    what: 'Your tasks sit on My Day by how long they take: Now, This week, Big project, plus Every day. Press Start when you take one on and Mark completed when it is done, saying what you did. Some ask for proof: attach the files or a link. The next one arrives by itself.' },
  { key: 'projects', title: 'Projects', href: '/admin/projects', minutes: 1,
    what: 'Big work, such as a season\'s campaign, split into steps of about two hours on a timeline. Do the pink step; the next opens once it is completed. The campaign rules sit at the top of every project.' },
  { key: 'bell', title: 'The bell, sound and pop-ups', href: '/admin/notifications', minutes: 1,
    what: 'The bell at the top counts what is new for you. Turn on sound and pop-ups from the bar on My Day so a new task or message reaches you even in another tab.' },
  { key: 'chat', title: 'Team chat', href: '/admin/team-chat', minutes: 1, fact: 'chatted', tryIt: 'Say hello in a channel',
    what: 'Channels for the whole team or your part of it, and Direct with June. Post status with a time in it ("proof sent; banner next, by 3pm") and your end-of-day note.' },
  { key: 'mailbox', title: 'Mailbox', href: '/admin/mailbox', minutes: 1,
    what: 'Conversations about one job or one task, kept with it, so nothing about an order is lost in chat. Every task has "Message about this task".' },
  { key: 'playbook', title: 'Playbook search', href: '/admin/playbook', minutes: 1,
    what: 'How we do things and ready-made replies. Type a question in plain words before you ask; if the answer is not there, say so and June may add it.' },
  { key: 'mystats', title: 'My stats', href: '/admin/my-stats', minutes: 1,
    what: 'What your week adds up to: hours, tasks done on time, and for sales the people you found, contacted and heard back from.' },
  { key: 'leads', title: 'Leads and Find leads with AI', href: '/admin/leads', minutes: 1, needs: 'leads.view',
    what: 'Everyone who asked about an order, oldest first, and the AI finder for new ones. A found lead counts once you have contacted it from its page.' },
  { key: 'design', title: 'The Design board', href: '/admin/design', minutes: 1, needs: 'jobs.design',
    what: 'Every job waiting on artwork, with what the customer sent. Proofs go up from the job, and the customer approves them there.' },
  { key: 'schedule', title: 'Production schedule', href: '/admin/schedule', minutes: 1, needs: 'jobs.schedule',
    what: 'Every job in hand and the day it is due, so you know what is coming before it lands on you.' },
];

const KEY_PREFIX = 'tour:';
const stepKey = (k) => `${KEY_PREFIX}${k}`;
const byKey = (k) => STOPS.find((s) => s.key === k) || null;

/** The stops this helper sees: those whose page they may open. `can(perm)`
 *  answers whether a permission is on for them. */
function stopsFor(can) {
  return STOPS.filter((s) => !s.needs || can(s.needs));
}

/** Where this helper is: each stop done or not, from the ticks they have
 *  (step keys) and the facts of their real work. */
function progress(stops, ticked, facts = {}) {
  const list = stops.map((s) => ({ ...s, done: ticked.has(stepKey(s.key)) || (s.fact ? !!facts[s.fact] : false) }));
  const done = list.filter((s) => s.done).length;
  return { stops: list, done, total: list.length, finished: list.length > 0 && done === list.length, next: list.find((s) => !s.done) || null };
}

module.exports = { STOPS, KEY_PREFIX, stepKey, byKey, stopsFor, progress };
