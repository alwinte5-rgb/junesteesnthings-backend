'use strict';

/* The 2026-10-13 content fixes from the training audit: what the lessons
 * teach matches what the back office does and what each helper can open.
 *
 * Run: node --test tests/*.test.js
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const COURSES = require('../tools/lib/courses');
const TRAINING = require('../tools/lib/training');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const all = (key) => JSON.stringify(COURSES.COURSES[key].modules.map((m) => [m.lessons.map((l) => l.body), m.quiz, m.practice]))
  + JSON.stringify(COURSES.COURSES[key].final || {});

test('My Day lists an approved quote only when its email did not go, so it is never sent twice', () => {
  const at = src.indexOf("WHERE a.kind = 'quote' AND a.status = 'approved' AND a.requested_by = $1");
  assert.match(src.slice(at, at + 600), /AND q\.emailed_at IS NULL/);
  assert.match(src, /section\('Approved, but not emailed: send these yourself'/);
  assert.doesNotMatch(all('sales-core'), /copy the message and send it/);
});

test('the bookkeeper prepares and June enters; no job page, no linking', () => {
  const books = all('books-core');
  assert.match(books, /You prepare, June enters/);
  assert.doesNotMatch(books, /open its costs on the job page|Change the amounts to what we actually paid|'Link that payment to its order'/);
});

test('the developer stops at an open pull request; June merges, deploys and rolls back', () => {
  const dev = all('dev-core');
  assert.match(dev, /Stop at the open pull request/);
  assert.doesNotMatch(dev, /\*\*Squash-merge\*\* when it is ready|Wait for Railway to show the deploy|redeploy it on Railway/);
  assert.match(dev, /Can write the rollback note/);
});

test('one end-of-day note, posted in Team chat; no hidden step for it', () => {
  assert.match(all('sales-core'), /post it in Team chat, as in Team basics/);
  for (const track of ['sales', 'design', 'content', 'ads', 'bookkeeper', 'developer']) {
    assert.ok(!TRAINING.visibleSteps(new Set(['eod', 'proofs']), track).some((s) => s.key === 'do:eod'), track);
  }
});

test('screen printing under 50 is charged as 50, embroidery starts at 5, Ads match the owner\'s figures', () => {
  const sales = all('sales-core');
  assert.doesNotMatch(sales, /Screen printing starts at 50|\*\*Minimum:\*\* 50 pieces\./);
  assert.match(sales, /\*\*Minimum:\*\* 5 pieces/);
  const ads = all('ads-core');
  assert.match(ads, /Our target is under \$15 a quote request/);
  assert.doesNotMatch(ads, /That is roughly what one quote request should cost|Spent \$140 of \$150/);
  assert.match(ads, /Spent \$22 of about \$23/);
  assert.doesNotMatch(all('sales-leadgen'), /which is how your reply rate is worked out/);
});

test('every reworded line still appears in a lesson, so a stale pair cannot hide a live copy', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'tools/lib/courses/index.js'), 'utf8');
  const block = idx.slice(idx.indexOf('const REWORDED = ['), idx.indexOf('\n];', idx.indexOf('const REWORDED = [')));
  const REWORDED = eval(block.replace('const REWORDED = ', '') + '\n]');
  /* In a lesson now, or in a wording a lesson will still match (a pair whose
     new side was itself reworded later is reached through the newer pair). */
  const texts = COURSES.lessonArticles().flatMap((a) => [a.body, ...(a.was || [])]).join('\n\u0000\n');
  for (const [now] of REWORDED) assert.ok(texts.includes(now), `no lesson says: ${now.slice(0, 80)}`);
});
