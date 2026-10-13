'use strict';

/* Read-only report of how long one helper has spent on training.

   Run on the server, where DATABASE_URL is set:
     railway ssh -s junesteesnthings-backend -- node tools/training-time-report.js Christine

   The argument matches the start of a helper's name (case ignored); with no
   argument it lists every helper. Lesson time is wall clock from first open
   to finish, so each lesson is also shown capped at 3x its expected minutes
   (TRAINING.timeSpent). Hours on Staff are what the helper reported, not
   tracked time. Prints plain text; no emails, phones or answers. It only
   SELECTs. */

const { Pool } = require('pg');
const TRAINING = require('./lib/training');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const day = (d) => (d ? new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }) : '-');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const name = String(process.argv[2] || '').slice(0, 80);
    const { rows: staff } = await pool.query(
      `SELECT id, name, training_track, sales_role, created_at FROM staff
        WHERE $1 = '' OR name ILIKE $1 || '%' ORDER BY name`, [name]);
    if (!staff.length) { console.log(`No helper named "${name}".`); return; }
    for (const s of staff) {
      const [times, quizzes, exams, acts, hours] = await Promise.all([
        pool.query('SELECT step_key, started_at, done_at FROM staff_lesson_time WHERE staff_id = $1', [s.id]),
        pool.query('SELECT quiz_key, score, total, passed, created_at FROM staff_quiz_attempts WHERE staff_id = $1 ORDER BY created_at', [s.id]),
        pool.query('SELECT scenario, passed, created_at FROM staff_exam_attempts WHERE staff_id = $1 ORDER BY created_at', [s.id]),
        pool.query('SELECT created_at FROM staff_activity WHERE staff_id = $1', [s.id]),
        pool.query('SELECT week_of::text AS week_of, business, hours::float AS hours FROM staff_hours WHERE staff_id = $1 ORDER BY week_of', [s.id])]);
      const steps = TRAINING.visibleSteps(undefined, s.training_track, TRAINING.salesRoleOf(s.sales_role));
      const t = TRAINING.timeSpent(steps, new Map(times.rows.map((r) => [r.step_key, r])),
        [...quizzes.rows, ...exams.rows, ...acts.rows].map((r) => r.created_at));
      const lessonsAll = steps.filter((x) => x.type === 'lesson');
      const out = [];
      out.push(`== ${s.name} (track ${TRAINING.trackOf(s.training_track)}${s.sales_role ? `, ${s.sales_role}` : ''}; added ${day(s.created_at)})`);
      out.push(`First training activity: ${day(t.first)}   Last: ${day(t.last)}   Active days: ${t.activeDays}`);
      out.push(`Lessons finished: ${t.lessons.length} of ${lessonsAll.length}`);
      out.push(`Lesson time: ${TRAINING.hm(t.cappedMinutes)} counted (each lesson capped at 3x expected), ${TRAINING.hm(t.rawMinutes)} raw, against ${TRAINING.hm(t.expectedMinutes)} expected for those lessons`);
      out.push(`Quiz tries: ${quizzes.rows.length} (${quizzes.rows.filter((q) => q.passed).length} passed)   Quote-exam tries: ${exams.rows.length} (${exams.rows.filter((q) => q.passed).length} passed)`);
      const hrs = hours.rows.reduce((n, h) => n + h.hours, 0);
      out.push(`Hours reported on Staff: ${hrs}${hours.rows.length ? ` (${hours.rows.map((h) => `${h.week_of} ${h.hours}h${h.business !== 'jtees' ? ` ${h.business}` : ''}`).join(', ')})` : ''}`);
      if (t.lessons.length) {
        out.push('Lessons (expected / took):');
        for (const l of t.lessons) out.push(`  ${String(l.expected).padStart(3)}m / ${TRAINING.hm(l.raw).padStart(7)}${l.raw !== l.capped ? ' (capped)' : ''}  ${l.title}`);
      }
      if (quizzes.rows.length) {
        out.push('Quiz tries:');
        for (const q of quizzes.rows) out.push(`  ${day(q.created_at)}  ${q.quiz_key}  ${q.score}/${q.total}${q.passed ? ' passed' : ''}`);
      }
      console.log(out.join('\n') + '\n');
    }
  } finally {
    await pool.end();
  }
})().catch((e) => { console.error('report failed:', e.message); process.exit(1); });
