'use strict';

/* What needs the owner, in one list (owner, 2026-11-18: "I don't want to look
   for things, they should be displayed for me ... right now I have to look
   for everything and only certain sections notify me, that's unacceptable").

   The home dashboard, the bell and the menu badges are all made from this one
   list, so they never disagree. server.js reads the tables; this module only
   turns what was read into rows, so every rule here can be tested without a
   database.

   A row: { group, kind, ref, tone, icon, title, sub, href }
     group  where it sits on the dashboard (GROUPS)
     kind   its bell kind (tools/lib/notifications.js KINDS)
     ref    what makes it one thing: the bell keeps one notification per
            (person, kind, ref), and clears it once the ref stops coming back
     title, sub  plain text; the page escapes them
     href   a back-office path */

const TC = require('./timeclock');
const { weekOf } = require('./team-metrics');

const GROUPS = {
  approvals: { label: 'Approvals', empty: 'Nothing is waiting for your approval.' },
  hours:     { label: 'Hours', empty: 'No hour problems.' },
  training:  { label: 'Training', empty: 'No one is waiting on you in training.' },
  team:      { label: 'Team', empty: 'Nothing from the team is waiting on you.' },
  customers: { label: 'Customers', empty: 'No customer is waiting on you.' },
};
const GROUP_KEYS = Object.keys(GROUPS);

const fmt = (m) => {
  const n = Math.max(0, Math.round(Number(m) || 0));
  return n >= 60 ? `${Math.floor(n / 60)}h${n % 60 ? ` ${n % 60}m` : ''}` : `${n}m`;
};
const ms = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const one = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
/* The week an open shift belongs to on the Hours page: the week read that
   holds it, or the shop week it started in. */
const shiftWeek = (startedAt, thisWeek, lastWeek) => {
  for (const w of [thisWeek, lastWeek]) if (w && (w.shifts || []).some((sh) => ms(sh.started_at) === ms(startedAt))) return w.week;
  return weekOf(new Date(startedAt));
};
const clip = (s, n = 90) => {
  const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/** A week's approval still matches the clock: approved, and neither the
 *  approved hours nor the hours on Team have moved off what the clock now
 *  says. The same test the Hours page uses for its "Approve again" button. */
function weekApproved(w) {
  if (!w || !w.approval) return false;
  const clock = TC.hoursOf(w.minutes);
  const mine = (w.hours || []).find((h) => h.business === w.approval.business);
  return !!mine && Math.abs(Number(mine.hours) - clock) <= 0.01 && Math.abs(Number(w.approval.hours) - clock) <= 0.01;
}

/**
 * Hour problems for one helper. `thisWeek` and `lastWeek` are clockWeek()
 * results (either may be null when it could not be read); `unapproved` is the
 * list of earlier finished weeks ('YYYY-MM-DD' Mondays) that have shifts and
 * no approval at all.
 *
 * The owner's four (2026-11-18): forgot to clock out, week not approved,
 * TimeProof missing or off, idle or off-clock work.
 */
function hoursAlerts({ staff, thisWeek = null, lastWeek = null, unapproved = [], openShifts = [], now = Date.now() }) {
  const out = [];
  const name = staff.name || `Helper #${staff.id}`;
  const page = (week) => `/admin/timeclock?staff=${Number(staff.id)}&week=${week}`;
  /* Forgot to clock out: a shift still running past the long-shift mark, or
     past midnight on the helper's own clock (a helper in Manila works
     through Chicago's midnight every day). `openShifts` is every shift still
     running, however old. One row per shift, so a new one is a new alert. */
  const tz = staff.time_zone || TC.TZ;
  for (const sh of openShifts) {
    const len = Math.max(0, Math.round((ms(now) - ms(sh.started_at)) / 60000));
    let overnight;
    try { overnight = TC.dayOf(sh.started_at, tz) !== TC.dayOf(now, tz); } catch { overnight = TC.dayOf(sh.started_at) !== TC.dayOf(now); }
    if (len <= TC.LONG_SHIFT_HOURS * 60 && !overnight) continue;
    out.push({ group: 'hours', kind: 'hours', ref: `open:${Number(sh.id)}`, tone: 'red', icon: 'clock',
      title: `${name} may have forgotten to clock out`,
      sub: `clocked in ${fmt(len)} ago and still running${overnight ? ', past midnight' : ''}`, href: page(shiftWeek(sh.started_at, thisWeek, lastWeek)) });
  }
  /* Last week, finished: approve it, type its TimeProof, check what the
     clock flagged. Once the week is approved, idle and off-clock time on it
     has been looked at, so it no longer alerts. */
  if (lastWeek && (lastWeek.shifts || []).length) {
    const approved = weekApproved(lastWeek);
    if (!approved) {
      out.push({ group: 'hours', kind: 'hours', ref: `approve:${Number(staff.id)}:${lastWeek.week}`, tone: 'amber', icon: 'clock',
        title: lastWeek.approval ? `${name}'s hours changed after you approved them` : `${name}'s hours for last week need approving`,
        sub: `${fmt(lastWeek.minutes)} on the clock, week of ${lastWeek.week}`, href: page(lastWeek.week) });
    }
    if (lastWeek.timeproofMinutes == null) {
      out.push({ group: 'hours', kind: 'hours', ref: `tp-missing:${Number(staff.id)}:${lastWeek.week}`, tone: 'amber', icon: 'clock',
        title: `TimeProof hours not entered for ${name}`,
        sub: `week of ${lastWeek.week}: type the TimeProof total so it can be checked against the clock`, href: page(lastWeek.week) });
    }
    if (!approved) out.push(...weekFlagRows(staff, lastWeek, page(lastWeek.week), 'last week'));
  }
  if (thisWeek) out.push(...weekFlagRows(staff, thisWeek, page(thisWeek.week), 'this week'));
  for (const week of unapproved) {
    out.push({ group: 'hours', kind: 'hours', ref: `approve:${Number(staff.id)}:${week}`, tone: 'amber', icon: 'clock',
      title: `${name}'s hours for the week of ${week} were never approved`, sub: 'approve them so they are paid', href: page(week) });
  }
  return out;
}

/* TimeProof off, idle time and off-clock work in one week: one row each,
   counted, so a week with nine idle gaps is one alert, not nine. */
function weekFlagRows(staff, w, href, when) {
  const name = staff.name || `Helper #${staff.id}`;
  const flags = w.flags || [];
  const out = [];
  const tp = flags.find((f) => f.kind === 'timeproof');
  if (tp) {
    out.push({ group: 'hours', kind: 'hours', ref: `tp-diff:${Number(staff.id)}:${w.week}`, tone: 'red', icon: 'clock',
      title: `${name}'s TimeProof and the clock don't match`, sub: `${when}: ${tp.text}`, href });
  }
  const idle = flags.filter((f) => f.kind === 'idle');
  if (idle.length) {
    const total = idle.reduce((n, f) => n + (Number(f.minutes) || 0), 0);
    out.push({ group: 'hours', kind: 'hours', ref: `idle:${Number(staff.id)}:${w.week}`, tone: 'amber', icon: 'clock',
      title: `${name} was idle on the clock ${when}`, sub: `${one(idle.length, 'gap')} of 30+ minutes with no activity${total ? `, ${fmt(total)} in all` : ''}`, href });
  }
  const off = flags.filter((f) => f.kind === 'off-clock');
  if (off.length) {
    out.push({ group: 'hours', kind: 'hours', ref: `offclock:${Number(staff.id)}:${w.week}`, tone: 'red', icon: 'clock',
      title: `${name} worked while clocked out ${when}`, sub: off.map((f) => f.text).join('; '), href });
  }
  return out;
}

/**
 * Training waiting on the owner for one helper. `progress` is what
 * TRAINING.progress returned; `nextPreset` the preset they should move up to
 * now (or null); `readyDone` whether their path's ready sign-off is given.
 */
function trainingAlerts({ staff, progress, nextPreset = null, nextLabel = '', readyDone = false }) {
  const out = [];
  const name = staff.name || `Helper #${staff.id}`;
  const href = `/admin/training?staff=${Number(staff.id)}`;
  const due = ((progress && progress.steps) || []).filter((s) => s.type === 'signoff' && !s.done && !s.locked);
  if (due.length) {
    out.push({ group: 'training', kind: 'training', ref: `signoff:${Number(staff.id)}:${due[0].key}`, tone: 'amber', icon: 'check',
      title: `${name} is waiting for your sign-off`,
      sub: `${clip(due[0].title, 80)}${due.length > 1 ? ` and ${due.length - 1} more` : ''}`, href });
  }
  if (readyDone && nextPreset) {
    out.push({ group: 'training', kind: 'training', ref: `moveup:${Number(staff.id)}:${nextPreset}`, tone: 'blue', icon: 'check',
      title: `${name} finished training`, sub: `move them up to ${nextLabel || nextPreset} on Staff`, href: `/admin/staff#staff-${Number(staff.id)}` });
  }
  return out;
}

/** A helper who has not signed the staff agreement: nothing opens for them. */
function agreementAlert(staff) {
  return { group: 'team', kind: 'team', ref: `agreement:${Number(staff.id)}`, tone: 'amber', icon: 'edit',
    title: `${staff.name || `Helper #${staff.id}`} hasn't signed the staff agreement`,
    sub: 'they cannot open anything until they do', href: '/admin/agreement' };
}

/**
 * Tasks the owner should know about: past their due date, or handed to
 * someone who has not started them after two days. `today` is YYYY-MM-DD in
 * the shop's zone. Helpers are never nagged by this (DEADLINE_ALERTS stays
 * off for them); it is the owner's view only.
 */
function taskAlerts(tasks, roster, { today, now = Date.now() }) {
  const nameOf = (id) => ((roster || []).find((r) => r.id === id) || {}).name || (id == null ? 'anyone' : `Helper #${id}`);
  const out = [];
  for (const t of tasks || []) {
    const due = t.due_on ? (t.due_on instanceof Date ? t.due_on.toISOString() : String(t.due_on)).slice(0, 10) : '';
    if (due && due < today) {
      out.push({ group: 'team', kind: 'team', ref: `task-late:${Number(t.id)}`, tone: 'red', icon: 'clock',
        title: `Task overdue: ${clip(t.title, 70)}`, sub: `${nameOf(t.assigned_to)}, was due ${due}`, href: `/admin/tasks#task-${Number(t.id)}` });
    } else if (t.assigned_to != null && !t.started_at && ms(now) - ms(t.created_at) > 2 * 86400000) {
      out.push({ group: 'team', kind: 'team', ref: `task-idle:${Number(t.id)}`, tone: 'amber', icon: 'clock',
        title: `Task not started: ${clip(t.title, 70)}`, sub: `given to ${nameOf(t.assigned_to)} ${Math.floor((ms(now) - ms(t.created_at)) / 86400000)} days ago`,
        href: `/admin/tasks#task-${Number(t.id)}` });
    }
  }
  return out;
}

/** Job notes a helper sent the owner, and follow-ups raised for the owner. */
function noteAlerts(notes, followups, roster) {
  const nameOf = (author) => {
    const m = /^staff:(\d+)$/.exec(String(author || ''));
    const r = m && (roster || []).find((x) => x.id === Number(m[1]));
    return r ? r.name : 'The team';
  };
  return [
    ...(notes || []).map((n) => ({ group: 'team', kind: 'team', ref: `note:${Number(n.id)}`, tone: 'blue', icon: 'mail',
      title: `${nameOf(n.author)} left you a note on ${n.quote_code}`, sub: `"${clip(n.body)}"`,
      href: `/admin/production/${encodeURIComponent(n.quote_code)}#notes` })),
    ...(followups || []).map((f) => ({ group: 'team', kind: 'team', ref: `followup:${Number(f.id)}`, tone: 'amber', icon: 'alert',
      title: clip(f.title, 110), sub: f.quote_code ? `follow-up on ${f.quote_code}` : 'follow-up for you', href: '/admin/approvals#followups' })),
  ];
}

/** Helpers' held quotes with no request open: the customer cannot see them
 *  until the owner opens and sends them (owner, 2026-11-25). */
function heldAlerts(held, roster) {
  const nameOf = (id) => { const r = (roster || []).find((x) => x.id === Number(id)); return r ? r.name : 'A helper'; };
  return (held || []).map((q) => ({ group: 'approvals', kind: 'approval', ref: `held:${q.code}`, tone: 'blue', icon: 'check',
    title: `${nameOf(q.created_by)}'s quote ${q.code} is held`, sub: `${q.name ? q.name + ': ' : ''}the customer cannot see it; open it to send`,
    href: `/admin/quote/${encodeURIComponent(q.code)}/edit` }));
}

/** Artwork the owner decides or answers: final art submitted, the designer
 *  asking a question, and library designs submitted on the studio. */
function artAlerts({ submitted = [], questions = [], library = [] }) {
  return [
    ...submitted.map((a) => ({ group: 'approvals', kind: 'approval', ref: `art:${a.quote_code}:${ms(a.updated_at)}`, tone: 'blue', icon: 'check',
      title: `Art to approve on ${a.quote_code}`, sub: a.name ? `for ${a.name}` : 'final art is ready for you', href: '/admin/approvals' })),
    ...questions.map((a) => ({ group: 'approvals', kind: 'art', ref: `art-q:${a.quote_code}:${ms(a.updated_at)}`, tone: 'amber', icon: 'edit',
      title: `The designer has a question on ${a.quote_code}`, sub: a.name ? `for ${a.name}: answer it on the job` : 'answer it on the job',
      href: `/admin/production/${encodeURIComponent(a.quote_code)}#art` })),
    ...library.map((r) => ({ group: 'approvals', kind: 'library', ref: `poll:${r.kind}-${Number(r.id)}`, tone: 'blue', icon: 'star',
      title: `Design awaiting approval: ${clip(r.name, 80)}`, sub: `${r.kind}${r.submitted_by ? `, from ${r.submitted_by}` : ''}`,
      href: `/admin/design-library?item=${encodeURIComponent(`${r.kind}-${Number(r.id)}`)}` })),
  ];
}

/** Customer news for the bell (the dashboard has its own fuller list). */
function customerAlerts({ replies = [], proofOk = [], proofChanges = [], notes = [], changes = [], disputes = [] }) {
  const job = (code) => `/admin/production/${encodeURIComponent(code)}`;
  return [
    ...replies.map((r) => ({ group: 'customers', kind: 'customer', ref: `reply:${r.code}:${ms(r.last_in)}`, tone: 'amber', icon: 'mail',
      title: `${r.name || r.code} is waiting for a reply`, sub: r.body ? `"${clip(r.body)}"` : 'sent a picture', href: `${job(r.code)}#messages` })),
    ...proofOk.map((q) => ({ group: 'customers', kind: 'customer', ref: `proof-ok:${q.code}:${ms(q.proof_ok_at)}`, tone: 'green', icon: 'check',
      title: `${q.name || q.code} approved their proof`, sub: `${q.code}: ready for production`, href: job(q.code) })),
    ...proofChanges.map((n) => ({ group: 'customers', kind: 'customer', ref: `proof-chg:${Number(n.id)}`, tone: 'amber', icon: 'edit',
      title: `${n.name || n.quote_code} asked for proof changes`, sub: `"${clip(String(n.body).replace(/^Proof changes requested on the quote page:\s*/, ''))}"`, href: job(n.quote_code) })),
    ...notes.map((n) => ({ group: 'customers', kind: 'customer', ref: `cnote:${Number(n.id)}`, tone: 'blue', icon: 'mail',
      title: `${n.name || n.quote_code} left a note on their quote`, sub: `"${clip(n.body)}"`, href: job(n.quote_code) })),
    ...changes.map((c) => ({ group: 'customers', kind: 'customer', ref: `change:${c.code}`, tone: 'blue', icon: 'edit',
      title: `${c.name || c.code} asked for a change`, sub: `"${clip(c.change_request)}"`, href: job(c.code) })),
    ...disputes.map((d) => ({ group: 'customers', kind: 'customer', ref: `dispute:${Number(d.id)}`, tone: 'red', icon: 'alert',
      title: `Chargeback${d.quote_code ? ` on ${d.quote_code}` : ''}`, sub: 'respond in Stripe', href: d.quote_code ? job(d.quote_code) : '/admin/orders' })),
  ];
}

/** Rows by group, in dashboard order, with counts. */
function byGroup(rows) {
  const out = Object.fromEntries(GROUP_KEYS.map((g) => [g, []]));
  for (const r of rows || []) if (out[r.group]) out[r.group].push(r);
  return out;
}

/** The counts the menu badges show. */
function counts(rows) {
  const g = byGroup(rows);
  return { hours: g.hours.length, training: g.training.length, team: g.team.length };
}

module.exports = { heldAlerts,
  GROUPS, GROUP_KEYS, weekApproved, hoursAlerts, trainingAlerts, agreementAlert, taskAlerts, noteAlerts,
  artAlerts, customerAlerts, byGroup, counts,
};
