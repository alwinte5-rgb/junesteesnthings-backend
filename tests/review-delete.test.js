'use strict';

/* Removing a review hides it; it does not drop the row.
 *
 * The reviews table is also the record of having ASKED. The backfill list
 * finds customers with no reviews row against their quote code, so a hard
 * DELETE would return that customer to "never asked" and let June ask them
 * again — right after she deliberately removed what they wrote. The row also
 * carries sent_at and followup_sent_at, which is the only history of the ask.
 *
 * So the content stops being shown everywhere and the asking history survives.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('the reviews table has a deleted_at column', () => {
  assert.match(src, /ALTER TABLE reviews ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ/);
});

test('removing a review never issues a DELETE against the table', () => {
  /* The failure this guards: a later "tidy up" turning the soft delete into a
     real one, silently re-enabling the ask for someone who was removed. */
  assert.equal(/DELETE\s+FROM\s+reviews/i.test(src), false,
    'something hard-deletes reviews — the backfill list will re-ask that customer');
});

test('the remove action stamps deleted_at and clears approved', () => {
  const h = src.slice(src.indexOf("app.post('/admin/reviews/:id'"));
  const body = h.slice(0, h.indexOf('\n});') + 4);
  assert.match(body, /action === 'delete'/, 'the handler does not recognise a delete');
  assert.match(body, /deleted_at=NOW\(\)/);
  assert.match(body, /approved=FALSE/,
    'a removed review must also be un-approved, or a restored row returns to the site live');
});

test('every surface that shows reviews excludes the removed ones', () => {
  /* The public strip, the admin list and the headline counts. */
  const publicQ = src.slice(src.indexOf('FROM reviews WHERE approved = TRUE'), src.indexOf('FROM reviews WHERE approved = TRUE') + 160);
  assert.match(publicQ, /deleted_at IS NULL/, 'a removed review still shows on the site');

  const adminQ = src.slice(src.indexOf('SELECT * FROM reviews WHERE submitted_at IS NOT NULL'),
                           src.indexOf('SELECT * FROM reviews WHERE submitted_at IS NOT NULL') + 160);
  assert.match(adminQ, /deleted_at IS NULL/, 'a removed review still shows in the admin list');

  /* The rest of the counts query, to its closing backtick, however many
     columns it grows before the FROM. */
  const stats = (src.match(/AS last_sent[^`]*/) || [''])[0];
  assert.match(stats, /FROM reviews/, 'the headline counts query is gone');
  assert.match(stats, /deleted_at IS NULL/, 'the headline counts still include removed reviews');
});

test('the backfill list still sees the row, so nobody is asked twice', () => {
  /* This one is asserted as an ABSENCE on purpose: the NOT EXISTS check must
     NOT filter on deleted_at, or removing a review re-opens the ask. */
  const q = src.slice(src.indexOf('NOT EXISTS (SELECT 1 FROM reviews r WHERE r.quote_code = q.code)') - 40,
                      src.indexOf('NOT EXISTS (SELECT 1 FROM reviews r WHERE r.quote_code = q.code)') + 80);
  assert.equal(/deleted_at/.test(q), false,
    'the backfill check now ignores removed rows — a removed customer will be asked again');
});

test('the button asks before it removes', () => {
  const btn = src.slice(src.indexOf("<button name=\"action\" value=\"delete\"")).slice(0, 600);
  assert.match(btn, /onclick="return confirm\(this\.dataset\.confirm\)"/, 'removing should confirm first');
  /* The wording sits in an escaped data attribute and the handler reads it
     back, so a customer's name is never written into script: a name with a
     quote or a backslash in it cannot break the button. */
  const attr = btn.match(/data-confirm="\$\{escEmail\((\w+)\)\}"/);
  assert.ok(attr, 'the confirm wording should come from an escaped data attribute');
  const page = src.slice(src.indexOf("app.get('/admin/reviews'"), src.indexOf("app.post('/admin/reviews/backfill'"));
  const wording = page.match(new RegExp(`const ${attr[1]} = [^;]*;`));
  assert.ok(wording, `the confirm wording (${attr[1]}) is not defined on the reviews page`);
  assert.match(wording[0], /will not be asked again/,
    'the confirm should say what is kept, not just what goes');
});
