#!/usr/bin/env node
/* Prove the error pipeline actually reaches Sentry.
 *
 *     node tools/sentry-test.js
 *
 * Run it where the DSN is. Locally that is .env; against production, run it
 * with production's variables:
 *
 *     railway run --service <service> node tools/sentry-test.js
 *
 * WHY A SCRIPT AND NOT A ROUTE
 * ----------------------------
 * The obvious alternative — a /debug/sentry endpoint — is a permanent public
 * way to make the server throw, on a shop that takes card payments, in exchange
 * for a check you run twice a year. This needs no open port and no guard.
 *
 * WHAT "VERIFIED" MEANS HERE
 * -------------------------
 * `captureException` only queues. A process that exits immediately loses the
 * queue and prints a cheerful success having sent nothing, so this flushes
 * first. But flushing is NOT enough on its own, and that is worth spelling out
 * because the first version of this script got it wrong:
 *
 *   `Sentry.flush()` resolved TRUE against a DSN whose project does not exist.
 *   It reports that the queue drained, not that anything was accepted — the
 *   request went out, Sentry answered 400, the SDK swallowed it, and the
 *   script printed PASS. A verification that passes against a made-up project
 *   verifies nothing.
 *
 * So the real check is the ingest's HTTP status, which the client exposes on
 * its `afterSendEvent` hook. 2xx is delivery. 400/401/403 is a DSN that is
 * malformed, revoked, or pointing at a project that is gone. No response at
 * all means it never left. Only 2xx exits zero.
 *
 * The last mile — that the event is visible in the project you expected, under
 * the environment you expected — is a human look at the dashboard, and the
 * event id printed below is what to search for.
 */

'use strict';

require('dotenv').config();

const {
  initMonitoring, captureError, flushMonitoring,
  monitoringEnabled, environmentName, releaseName, Sentry,
} = require('./lib/monitoring');

async function main() {
  if (!process.env.SENTRY_DSN || !process.env.SENTRY_DSN.trim()) {
    console.error('FAIL: SENTRY_DSN is not set in this environment.');
    console.error('      Set it in .env for a local check, or run this with');
    console.error('      `railway run --service <service> node tools/sentry-test.js`.');
    process.exit(1);
  }

  initMonitoring();
  if (!monitoringEnabled()) {
    console.error('FAIL: the SDK did not start. The DSN is set but was rejected —');
    console.error('      check it is the whole DSN, copied from Client Keys.');
    process.exit(1);
  }

  const environment = environmentName();
  console.log(`environment: ${environment}`);
  console.log(`release:     ${releaseName() || '(none — not a Railway deploy)'}`);

  if (environment === 'production') {
    /* Said out loud because a test event filed against production is a real
       alert to whoever is on the other end of the alert rule. */
    console.log('NOTE: this files a test event against PRODUCTION.');
  }

  /* Listen BEFORE sending, or the answer arrives with nobody holding the line. */
  let status = null;
  const client = Sentry.getClient();
  if (client && typeof client.on === 'function') {
    client.on('afterSendEvent', (_event, response) => {
      if (response && typeof response.statusCode === 'number') status = response.statusCode;
    });
  }

  /* Thrown rather than constructed, so the event carries a genuine stack from
     this file. A hand-built Error has a stack too, but a thrown one proves the
     path an actual failure takes. */
  let eventId;
  try {
    throw new Error(`Sentry test event from tools/sentry-test.js at ${new Date().toISOString()}`);
  } catch (err) {
    captureError('sentry-test', err, 'deliberate test event — safe to resolve');
    eventId = Sentry.lastEventId();
  }

  if (!eventId) {
    console.error('FAIL: the SDK accepted no event. Nothing was queued to send.');
    process.exit(1);
  }

  process.stdout.write('sending… ');
  const drained = await flushMonitoring(10000);

  if (status === null) {
    console.error('\nFAIL: no response from Sentry ingest within 10s.');
    console.error(drained
      ? '      The queue drained but nothing answered — the request never left the host.'
      : '      The queue did not drain. Check egress to ingest.sentry.io is not blocked.');
    process.exit(1);
  }

  if (status < 200 || status >= 300) {
    console.error(`\nFAIL: Sentry ingest answered ${status}. The event was REJECTED.`);
    if (status === 400 || status === 404) {
      console.error('      400/404 means the DSN is well-formed but its project is not there.');
      console.error('      Copy the DSN again from Settings → Client Keys on the junes-tees project.');
    } else if (status === 401 || status === 403) {
      console.error('      401/403 means the key is revoked or disabled. Issue a new client key.');
    } else if (status === 429) {
      console.error('      429 means the project is rate-limited or over quota this period.');
    }
    process.exit(1);
  }

  console.log(`accepted by Sentry ingest (HTTP ${status}).`);
  console.log('');
  console.log(`  event id:  ${eventId}`);
  console.log(`  search:    project junes-tees, environment "${environment}", tag kind:sentry-test`);
  console.log('');
  console.log('PASS — now confirm it is visible in the dashboard, then resolve the issue.');
  process.exit(0);
}

main().catch((e) => {
  console.error('FAIL: the test itself threw:', e && e.message);
  process.exit(1);
});
