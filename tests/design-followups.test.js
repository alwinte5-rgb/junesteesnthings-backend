'use strict';

/* Follow-up emails for "Save your design" leads (tools/lib/design-followups.js):
   1, 3 and 7 days after, never once a person is on it. */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const F = require('../tools/lib/design-followups');
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const saved = new Date('2026-11-02T15:00:00Z');
const lead = (o = {}) => ({ email: 'ann@example.com', created_at: saved, design_fu_sent: 0, design_fu_at: null, ...o });
const at = (days) => new Date(saved.getTime() + days * 86400000);

test('three emails, 1, 3 and 7 days after the save', () => {
  assert.strictEqual(F.dueStep(lead(), at(0.9)), 0);
  assert.strictEqual(F.dueStep(lead(), at(1)), 1);
  assert.strictEqual(F.dueStep(lead({ design_fu_sent: 1, design_fu_at: at(1) }), at(2.9)), 0);
  assert.strictEqual(F.dueStep(lead({ design_fu_sent: 1, design_fu_at: at(1) }), at(3)), 2);
  assert.strictEqual(F.dueStep(lead({ design_fu_sent: 2, design_fu_at: at(3) }), at(7)), 3);
  assert.strictEqual(F.dueStep(lead({ design_fu_sent: 3, design_fu_at: at(7) }), at(30)), 0);
});

test('a late sweep never sends two in a row', () => {
  assert.strictEqual(F.dueStep(lead({ design_fu_sent: 1, design_fu_at: at(9) }), at(10)), 0);
  assert.strictEqual(F.dueStep(lead({ design_fu_sent: 1, design_fu_at: at(9) }), at(11)), 2);
});

test('they stop once a person is on it, and never reach old leads', () => {
  for (const o of [{ email: '' }, { dismissed_at: at(0.5) }, { outcome: 'lost' }, { first_response_at: at(0.5) },
    { has_quote: true }, { created_at: new Date('2026-10-01T00:00:00Z') }]) {
    assert.ok(F.stopReason(lead(o)), JSON.stringify(o));
    assert.strictEqual(F.dueStep(lead(o), at(8)), 0, JSON.stringify(o));
  }
  assert.strictEqual(F.stopReason(lead()), '');
});

test('each email links to their design and escapes what they typed', () => {
  const link = 'https://design.jtees.net/editor.php?design=abc';
  for (const step of [1, 2, 3]) {
    const m = F.followupEmail(step, { name: '<b>Ann</b> Lee', product: 'Gildan <5000>', link, code: 'SAVE10' });
    assert.ok(m.subject && m.heading);
    assert.ok(m.inner.includes(`href="${link.replace(/&/g, '&amp;')}"`));
    assert.doesNotMatch(m.inner, /<b>Ann|<5000>/);
  }
  assert.match(F.followupEmail(3, { link, code: 'SAVE10' }).inner, /SAVE10/);
  assert.doesNotMatch(F.followupEmail(1, { link, code: 'SAVE10' }).inner, /SAVE10/);
});

test('the sweep claims each send before sending, as marketing mail, daytime only, with no new schema', () => {
  assert.match(src, /INSERT INTO campaign_emails \(campaign, email, status\) VALUES \(\$1, \$2, 'sending'\)\s+ON CONFLICT \(campaign, email\) DO NOTHING RETURNING id`, \[designFuCampaign\(lead\.id, step\)/);
  assert.match(src, /async function sendDesignFollowups[\s\S]{0,200}if \(!inTextingHours\(now\)\) return '';/);
  assert.match(src, /customerEmailHtml\(m\.heading, m\.inner\), marketing: true/);
  assert.match(src, /step\('design follow-ups', sendDesignFollowups\)/);
  assert.match(src, /DELETE FROM campaign_emails WHERE id = \$1`, \[claim\[0\]\.id\]/, 'a failed send gives the step back');
  assert.match(src, /AND s\.dismissed_at IS NULL AND s\.outcome IS NULL AND s\.first_response_at IS NULL/, 'finished leads never fill the batch');
  assert.doesNotMatch(src, /design_fu_sent INTEGER|quotes_email_lower_idx/, 'no schema change');
});
