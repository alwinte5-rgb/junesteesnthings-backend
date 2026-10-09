/* Save a quote as a DRAFT (the owner, 2026-09-30).
 *
 * Run: node --test tests/*.test.js
 *
 * A draft is a quote the customer cannot see yet: saved, editable, on the
 * board, and nowhere else. What these guard:
 *
 * 1. Private until sent: the customer's pages answer "not found", nothing is
 *    pushed to Brevo or the studio, and no figure or follow-up counts it.
 *    (The route list is pinned in staff-workspace.test.js, beside held.)
 * 2. Only a quote not yet with the customer can be a draft. A sent quote
 *    cannot be pulled back into one by a crafted post.
 * 3. Sending a draft is a first send in every way that matters: the
 *    customer's clock starts then, it is logged as sent, and a helper's draft
 *    goes through the owner's approval exactly as a new quote would.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const save = src.slice(src.indexOf("app.post(['/admin/api/quotes', '/admin/api/quotes/:code'], requireAdmin"),
                       src.indexOf("res.send(quotePage('Quote ready'"));
const form = src.slice(src.indexOf("app.get(['/admin/quote/new', '/admin/quote/:code/edit'], requireAdmin"));

test('only a new quote, or one that is already a draft, can be saved as a draft', () => {
  assert.match(save, /const draft = String\(one\(b\.draft\) \|\| ''\) === '1' && \(!existingQuote \|\| wasDraft\);/);
});

test('a draft is stored as a draft, with nobody recorded as having sent it', () => {
  assert.match(save, /staffId, \(gate\.held \|\| draft\) \? null : staffId, draft \? 'draft' : gate\.held \? 'held' : 'sent'\]\)\);/);
  assert.match(save, /status = CASE WHEN \$20 THEN 'held' WHEN \$22 THEN 'draft' WHEN accepted_at IS NULL THEN 'sent' ELSE status END/);
});

test('sending a draft starts the customer\'s clock, like releasing a held quote', () => {
  assert.match(save, /created_at = CASE WHEN status IN \('held', 'draft'\) AND NOT \$20 AND NOT \$22 THEN NOW\(\) ELSE created_at END/);
  assert.match(save, /sent_by = CASE WHEN status IN \('held', 'draft'\) AND NOT \$20 AND NOT \$22 THEN \$21 ELSE sent_by END/);
});

test('a helper sending a draft goes through the owner\'s approval', () => {
  assert.match(save, /const keepHeld = \(wasHeld && \(actor\.kind === 'owner' \|\| gate\.held\)\) \|\| \(wasDraft && !draft && gate\.held\);/);
  assert.match(save, /held_at = CASE WHEN \$20 THEN COALESCE\(held_at, NOW\(\)\) ELSE NULL END/);
});

test('saving a draft stops before anything leaves the building', () => {
  const stop = save.indexOf("if (q.status === 'draft') {");
  assert.ok(stop > 0, 'the draft stop is missing');
  for (const later of ['syncQuoteToBrevo(q)', 'syncQuoteToLumise(q)', 'markLeadResponded(']) {
    assert.ok(save.indexOf(later) > stop, `${later} must come after the draft stop`);
  }
});

test('a draft being sent is logged as sent and answers its lead', () => {
  assert.match(save, /if \(!existingQuote \|\| wasDraft\) logActivity\(actor, 'quote sent'/);
  assert.match(save, /if \(\(!existingQuote \|\| wasDraft\) && q\.from_submission_id\) markLeadResponded/);
});

test('the form offers Save as draft only where a draft is possible', () => {
  assert.match(src, /const canDraft = \(!isEdit \|\| isDraft\) && !exam;/, 'and never on a practice (exam) quote');
  assert.match(form, /\$\{canDraft \? `<button type="submit" name="draft" value="1" id="qfdraft"/);
  /* The draft button waits for photo uploads, as the main one does. */
  assert.match(form, /if \(qfdraft\) \{ qfdraft\.disabled = upPending > 0;/);
});

test('staff are told why a message about a draft was not sent', () => {
  const fn = src.slice(src.indexOf('async function sendJobMessage('));
  assert.match(fn.slice(0, 900), /if \(q && q\.status === 'draft'\) return 'draft';/);
  assert.ok(src.includes("  draft: 'This quote is still a draft, so the customer cannot open it yet."));
});

test('the board marks a draft and links to finishing it', () => {
  assert.match(src, /draft: '#f1f5f9\|#475569'/);
  assert.match(src, /q\.status === 'draft' && !q\.cancelled_at \? `<div class="muted" style="margin-top:6px">Draft: the customer cannot/);
});

test('every total that leaves out held quotes leaves out drafts too', () => {
  assert.doesNotMatch(src, /status NOT IN \('expired', 'held'\)/, "a total still counts drafts: use NOT IN ('expired', 'held', 'draft')");
  /* Two places keep plain <> 'held' on purpose: restoring a cancelled quote,
     and a Stripe payment made outside checkout, which makes a draft an
     accepted job, since money has moved. Every other customer path must
     leave drafts out. */
  const rest = src
    .replace(/WHERE code = \$1 AND status <> 'held' RETURNING \*`, \[code\]\);\n    \/\* Never out of 'held'/, '')
    .replace(/UPDATE quotes SET status = 'accepted', accepted_at = COALESCE\(accepted_at, NOW\(\)\)\n      WHERE code = \$1 AND status <> 'held'/, '');
  assert.doesNotMatch(rest, /status <> 'held'/, "a customer path still shows drafts: use NOT IN ('held', 'draft')");
});
