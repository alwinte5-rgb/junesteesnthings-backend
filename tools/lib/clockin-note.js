'use strict';

/* The clock-in note (owner, 2026-10-23). A helper used to write the owner a
   "Good morning, here is what I am on today" message by hand when starting
   work. Now the shop writes it for them from their open tasks the first time
   they clock in each day, and posts it in the Mailbox from them to the owner.
   No outside email: it goes through the dashboard like any other conversation.

   Kept apart from the SQL so it can be tested. */

const MAX_TASKS = 10;
const MAX_PROJECTS = 6;

/** "Thu Oct 23" for a YYYY-MM-DD day. Composed from parts so the server's ICU
 *  version cannot change it. */
function dayLabel(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${DAYS[dt.getUTCDay()]} ${MONTHS[m - 1]} ${d}`;
}

/** The subject for one helper's note on one day. It doubles as the once-a-day
 *  key: a second clock-in that day finds a conversation with this subject. */
function subjectFor(name, ymd) {
  return `${String(name || 'Helper').trim() || 'Helper'}: today's tasks (${dayLabel(ymd)})`;
}

function oneLine(v) {
  return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

/**
 * The message body. `tasks` are the helper's open tasks that are workable now
 * ({ title, project_title }), already in priority order; a task that is a
 * project's current step is listed under its project instead. `projects` are
 * the helper's open project titles. Lists are capped so a long backlog stays
 * readable, with "and N more" so nothing looks finished that is not.
 */
function buildBody({ name, tasks = [], projects = [] }) {
  const loose = [];
  const proj = [];
  for (const t of tasks) {
    const title = oneLine(t.title);
    if (!title) continue;
    const p = oneLine(t.project_title);
    if (p) { if (!proj.includes(p)) proj.push(p); } else loose.push(title);
  }
  for (const p of projects.map(oneLine)) if (p && !proj.includes(p)) proj.push(p);

  const list = (items, max, empty) => {
    if (!items.length) return [`• ${empty}`];
    const out = items.slice(0, max).map((x) => `• ${x}`);
    if (items.length > max) out.push(`• …and ${items.length - max} more`);
    return out;
  };
  return [
    'Good morning! I am about to clock in. Here are the tasks on my priority today!',
    '',
    'Tasks for Today:',
    ...list(loose, MAX_TASKS, 'Nothing assigned yet'),
    '',
    'Projects to Continue:',
    ...list(proj, MAX_PROJECTS, 'None right now'),
    '',
    'Please let me know if there are other things you need help with! Thank you!',
    '',
    `(Sent automatically when ${oneLine(name) || 'this helper'} clocked in.)`,
  ].join('\n');
}

module.exports = { MAX_TASKS, MAX_PROJECTS, dayLabel, subjectFor, buildBody };
