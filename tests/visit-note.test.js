'use strict';
/* The shop is a working shop: visits are by appointment, and pickups follow the
   instructions sent by email or text when an order is complete (owner,
   2026-10-16). No page, FAQ answer or chat reply may invite a drop-in again. */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'public');
const read = (rel) => fs.readFileSync(path.join(PUBLIC, rel), 'utf8');

function htmlPages(dir = PUBLIC) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const full = path.join(dir, d.name);
    if (d.isDirectory()) return htmlPages(full);
    return d.name.endsWith('.html') ? [full] : [];
  });
}

test('no page or chat reply tells customers to just show up', () => {
  const files = [...htmlPages(), path.join(PUBLIC, 'assets', 'js', 'jt-chat.js')];
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /(call or text[^.]{0,40}when you arrive|stop by our shop|walk-ins? welcome)/i, path.relative(PUBLIC, f));
  }
});

test('the pickup answers carry the appointment note, visible and in the FAQ data', () => {
  for (const rel of ['index.html', 'services/custom-tshirts-chicago.html', 'areas/custom-tshirts-lakeview.html']) {
    const s = read(rel);
    const hits = s.match(/visits are by appointment only/g) || [];
    assert.ok(hits.length >= 2, `${rel}: page text and FAQPage data`);
    assert.match(s, /pickup instructions by email or text/);
  }
  assert.match(read('assets/js/jt-chat.js'), /visits are by appointment only/);
});

test('the top bar says appointments only on every page', () => {
  const nav = JSON.parse(read('assets/data/site-nav.json'));
  assert.ok(nav.announcement.some((a) => /^Visits by appointment only/.test(a.text)));
  assert.ok(!nav.announcement.some((a) => /Curbside Pickup: Mon/.test(a.text)));
});

test('a sent quote reaches Meta as its standard Lead event', () => {
  assert.match(read('assets/js/analytics.js'), /quote_submitted: 'Lead'/);
});
