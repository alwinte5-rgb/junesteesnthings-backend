'use strict';

/* `.env.example` must not read as a file full of secrets.
 *
 * The radar gate refuses any branch containing a committed credential, and it
 * decides by VALUE, not by filename: an `.env.example` is allowed only while
 * every value in it is recognisably a placeholder. Its vocabulary is narrow —
 * `<...>`, `your_...`, `xxx...`, `changeme`, `localhost` URLs — and this file
 * was written with a richer one (`choose_a_strong_password`, `you@yourdomain.com`,
 * `re_xxxx...` with a real-looking prefix).
 *
 * Nothing in it was ever a real secret. But the gate could not tell, so it
 * answered exit 2 — "this branch contains files that must never be committed" —
 * for ANY pull request that touched the file. Documenting a new environment
 * variable is the single most common reason to touch it, so the effect was that
 * adding a variable blocked its own pull request, with a message about
 * credentials that sounded far worse than what had happened.
 *
 * This asserts against the gate's own copy of the rule rather than a
 * reimplementation of it, so the two cannot drift.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const gate = path.join(root, '.github', 'radar-gate', 'boundary.py');

test('.env.example passes the radar gate that would refuse the branch', (t) => {
  if (!fs.existsSync(gate)) {
    return t.skip('the gate is not vendored in this checkout');
  }
  const probe = spawnSync('python3', ['-c', `
import sys, json
sys.path.insert(0, ${JSON.stringify(path.dirname(gate))})
import boundary
text = open(${JSON.stringify(path.join(root, '.env.example'))}, encoding='utf-8').read()
print(json.dumps([k for _, k in boundary.env_template_values(text)]))
`], { encoding: 'utf8' });

  if (probe.status !== 0) {
    return t.skip(`python3 unavailable or the gate would not import: ${probe.stderr}`);
  }

  const flagged = JSON.parse(probe.stdout.trim());
  assert.deepStrictEqual(flagged, [],
    'these values do not read as placeholders to the gate, so every PR touching '
    + '.env.example is refused with "files that must never be committed". Use a '
    + '<bracketed description>, a your_ prefix, or a localhost/example.com value.');
});

test('.env.example still documents every variable the app reads at boot', () => {
  /* The other half of the trap: making the gate happy by DELETING the entries.
     A template that refuses nothing and documents nothing is worse than one
     that trips a check. */
  const text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  for (const key of ['DATABASE_URL', 'NOTIFICATION_EMAIL', 'RESEND_API_KEY',
    'BREVO_API_KEY', 'ADMIN_PASSWORD', 'SENTRY_DSN']) {
    assert.match(text, new RegExp(`^${key}=`, 'm'), `${key} must be documented`);
  }
});

test('.env.example never carries a value that looks like a live key', () => {
  /* Belt and braces, and independent of the gate: the repo is public. */
  const text = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  for (const live of [/sk_live_[A-Za-z0-9]/, /pk_live_[A-Za-z0-9]/, /whsec_[A-Za-z0-9]{16}/,
    /xkeysib-[A-Za-z0-9]{16}/, /re_[A-Za-z0-9]{16}/, /pat-na1-[0-9a-f]{8}-/]) {
    assert.doesNotMatch(text, live, `a live-looking credential matched ${live}`);
  }
});
