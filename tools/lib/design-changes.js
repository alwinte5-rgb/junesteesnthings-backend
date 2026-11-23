'use strict';

/* "Request changes" on a Design library item reaches the designer (owner,
 * 2026-11-23: "when I submit a change request to the designer he doesn't get
 * it"). It only changed the item's status: no email, no task, no bell, and the
 * note was not shown in the Artwork workspace.
 *
 * Now it is a task on the designer's My Day, which stays until it is done and
 * rings their bell the way every task does, and an email. A second request on
 * the same design replaces the first one's task, so there is never a stale one
 * to work from. The item being submitted again, published, archived or deleted
 * closes it. */

const refOf = (kind, id) => `library-changes-${kind}-${Number(id)}`;

/** Who a request goes to: the designer who submitted it, when that is one of
 *  them; otherwise every designer, so it is never nobody's. */
function designersFor(designers, submittedBy) {
  const email = String(submittedBy || '').trim().toLowerCase();
  const own = email ? designers.filter((d) => String(d.email || '').trim().toLowerCase() === email) : [];
  return own.length ? own : designers;
}

/** Close what is still open for these designs, inside the caller's client or on the pool. */
function closeTasks(db, refs) {
  return db.query(
    `UPDATE staff_tasks SET done_at = NOW(), done_note = COALESCE(done_note, 'Closed: the design moved on')
      WHERE done_at IS NULL AND brief->>'request_ref' = ANY($1::text[])`, [refs]);
}

/** Give the request to the designer(s). Returns { told, emailed, names }. */
async function requestChanges(d, { kind, id, name, note, submittedBy }) {
  const all = await d.designersOnRoster();
  const to = designersFor(all, submittedBy);
  if (!to.length) return { told: 0, emailed: 0, names: [] };
  const ref = refOf(kind, id);
  const link = `/admin/artwork?item=${kind}-${Number(id)}`;
  const title = `June asked for changes: ${String(name || 'a design')}`.slice(0, 200);
  const brief = JSON.stringify({
    request_ref: ref,
    done: ['The design is changed the way June asked', 'It is submitted for approval again'],
    proof: 'Say what you changed, or link the new draft.',
    resources: [{ label: 'Open the design in Artwork workspace', url: link }],
  });
  const db = await d.pool.connect();
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [ref]);
    await closeTasks(db, [ref]);
    for (const p of to) {
      await db.query(
        `INSERT INTO staff_tasks (title, assigned_to, business, description, how_to, created_by, brief)
         VALUES ($1, $2, 'jtees', $3, $4, NULL, $5::jsonb)`,
        [title, p.id, note, 'Open the design in Artwork workspace, make the change, then press Submit draft for approval.', brief]);
    }
    await db.query('COMMIT');
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { db.release(); }
  d.notifyNow();
  let emailed = 0;
  for (const p of to) {
    if (!d.isValidEmail(p.email)) continue;
    try {
      const sent = await d.pinEmail(p.email, p.name, title,
        `June asked for changes on <b>${d.esc(name || 'a design')}</b>:<br><br>${d.esc(note).replace(/\n/g, '<br>')}`, link);
      if (sent !== false) emailed++;
    } catch (e) { console.error(`design changes email for ${ref} failed:`, e.message); }
  }
  return { told: to.length, emailed, names: to.map((p) => String(p.name || '').split(' ')[0]).filter(Boolean) };
}

module.exports = { refOf, designersFor, closeTasks, requestChanges };
