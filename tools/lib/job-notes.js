'use strict';

/* Messages between the team about one job (owner, 2026-10-14: "the team to be
   able to send messages to each other about a job. The job must be tagged or
   attached. Do not dismiss unless addressed."), and the designer's "Got it"
   on art handed to them ("when a design is sent the designer doesn't get
   notified. Make sure it's sticky").

   A job message always carries its job and goes to one person. It stays on
   that person's home page and on the job until THEY mark it addressed,
   optionally with a reply, which goes back to the sender the same way. There
   is no dismiss. Kept apart from the SQL so the rules can be tested. */

const BODY_MAX = 2000;

/* Art moves that hand work to the designer: each one needs a fresh "Got it".
   The designer's own moves count as having seen it. */
const ART_TO_DESIGNER = ['request', 'answer', 'changes'];
const ART_BY_DESIGNER = ['question', 'submit'];
const ART_NEWS = {
  request: 'New design job',
  answer: 'Sales answered your question',
  changes: 'The owner asked for changes',
};

/** How an art move changes the "Got it": 'reset', 'ack' or 'keep'. */
function artAckEffect(move) {
  if (ART_TO_DESIGNER.includes(move)) return 'reset';
  if (ART_BY_DESIGNER.includes(move)) return 'ack';
  return 'keep';
}

/** The reader key a person is known by: 'owner' or 'staff:<id>'. */
function readerOf(actor) {
  return actor && actor.kind === 'staff' ? `staff:${Number(actor.id)}` : 'owner';
}

/** A recipient from a form: 'owner' or 'staff:<id>' naming an ACTIVE helper,
 *  never the sender. Null for anything else. */
function recipientFrom(raw, roster, sender) {
  const v = String(raw || '').trim();
  let key = null;
  if (v === 'owner') key = 'owner';
  else {
    const m = /^staff:(\d{1,9})$/.exec(v);
    if (m && roster.some((r) => r.id === Number(m[1]) && r.active)) key = `staff:${Number(m[1])}`;
  }
  return key && key !== sender ? key : null;
}

/** The staff id in a reader key, or null for the owner. */
function staffIdOf(key) {
  const m = /^staff:(\d+)$/.exec(String(key || ''));
  return m ? Number(m[1]) : null;
}

/** A message body: trimmed, newlines kept, control characters gone. */
function cleanBody(b) {
  return String(b || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
}

/** May this reader mark the note addressed? Only the person it was sent to. */
function mayAddress(note, reader) {
  return !!note && !note.addressed_at && note.recipient === reader;
}

module.exports = { BODY_MAX, ART_TO_DESIGNER, ART_BY_DESIGNER, ART_NEWS, artAckEffect, readerOf, recipientFrom, staffIdOf, cleanBody, mayAddress };
