/* Sentry, configured once.
 *
 * WHY THIS EXISTS ALONGSIDE THE DIGEST
 * ------------------------------------
 * This app already records errors itself: `recordError` in server.js writes a
 * fingerprinted row to `app_errors` and the hourly sweep mails a digest. That
 * was built when a new runtime dependency was believed to be forbidden, and it
 * is genuinely good at one thing — it reaches the owner by email, which is the
 * only channel the owner actually reads.
 *
 * It is weak at three others, and all three matter on a shop that takes money:
 *
 *   - it needs the database. The failure most worth hearing about is the one
 *     where Postgres is unreachable, and that is exactly when the recorder
 *     silently gives up (it catches its own failure on purpose, so that one
 *     broken thing does not become two).
 *   - it needs email. Email has already failed silently here once — the Brevo
 *     credit drain in Aug 2026 was invisible for three days.
 *   - it is hourly, and it carries a message and a stack string, not a grouped,
 *     searchable, released-tagged event.
 *
 * So the two are wired as ONE funnel with TWO sinks rather than as two systems:
 * everything still goes through `recordError`, and `recordError` now also hands
 * the error here. Nothing decides for itself which reporter to call, because
 * that is the decision that drifts.
 *
 * THE CONFIG LIVES HERE AND NOWHERE ELSE
 * --------------------------------------
 * Same rule as tools/lib/db.js: one copy. server.js and tools/sentry-test.js
 * both call `initMonitoring()`, so a test event is sent through the identical
 * DSN, environment and scrubbing as a real one. A test that proves a different
 * configuration works proves nothing.
 */

'use strict';

const Sentry = require('@sentry/node');

let enabled = false;

/** Which deployment this is, for the environment selector in Sentry.
 *
 *  Railway sets RAILWAY_ENVIRONMENT_NAME ("production"); a laptop sets neither
 *  it nor NODE_ENV, and unlabelled events from a developer's machine mixed in
 *  with production is how an alert rule becomes untrustworthy. Default to
 *  "development" so an unlabelled event is never mistaken for a live one. */
function environmentName() {
  return (process.env.SENTRY_ENVIRONMENT
    || process.env.RAILWAY_ENVIRONMENT_NAME
    || process.env.NODE_ENV
    || 'development').trim();
}

/** The deploy an event came from, so a regression points at what shipped it.
 *  Railway exposes the commit; without it every event is "unknown release" and
 *  "when did this start?" has no answer. */
function releaseName() {
  const sha = (process.env.RAILWAY_GIT_COMMIT_SHA || '').trim();
  return sha ? `junes-tees@${sha.slice(0, 7)}` : undefined;
}

/* Customer data must not leave this app.
 *
 * This is a storefront: request bodies carry names, addresses, emails and quote
 * contents, and headers carry the admin password and session cookies. Sentry's
 * own default (`sendDefaultPii: false`) covers the obvious ones; this covers the
 * rest by dropping the request payload wholesale and keeping only the parts that
 * help someone debug — method, route and status. An error report that leaks a
 * customer's address is a worse problem than the error it reports. */
function scrub(event) {
  if (event.request) {
    const { method, url } = event.request;
    /* url can carry a token in a query string (unsubscribe links do), so it is
       kept without its query. The path is what identifies the failing route. */
    let path = url;
    try {
      path = url ? new URL(url, 'https://jtees.net').pathname : url;
    } catch { /* a malformed url is not worth failing a report over */ }
    event.request = { method, url: path };
  }
  delete event.user;
  return event;
}

/** Start reporting. Safe to call when nothing is configured, and safe to call
 *  twice. Returns whether reporting is actually on.
 *
 *  Never throws. A monitoring SDK that can take the boot down has made the
 *  storefront less reliable than it was with no monitoring at all, which is the
 *  one outcome this whole task must not produce. */
function initMonitoring() {
  if (enabled) return true;
  const dsn = (process.env.SENTRY_DSN || '').trim();
  if (!dsn) return false;
  try {
    Sentry.init({
      dsn,
      environment: environmentName(),
      release: releaseName(),
      /* Errors only. Tracing on every request would spend the 5k/month free
         tier on successful page loads and add per-request overhead to a
         storefront, to answer a question nobody has asked yet. */
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend: scrub,
      /* One org, many projects. Without this tag an event in a shared org says
         which project only by which DSN received it, which is invisible in a
         combined issues view. */
      initialScope: {
        tags: {
          project: 'junes-tees',
          service: process.env.RAILWAY_SERVICE_NAME || 'local',
        },
      },
    });
    /* `init` does NOT throw on a malformed DSN — it prints "Invalid Sentry Dsn"
       and returns a client that will never send anything. Trusting the absence
       of an exception made `monitoringEnabled()` answer true while nothing was
       being reported, which is the worst of the three possible states: the boot
       log said monitoring was on, and it was not. A parsed DSN on the client is
       the honest signal. */
    const client = Sentry.getClient();
    enabled = Boolean(client && typeof client.getDsn === 'function' && client.getDsn());
    if (!enabled) {
      console.warn('monitoring: SENTRY_DSN was rejected as malformed — nothing will ' +
        'reach Sentry. Copy it again from Settings → Client Keys.');
    }
    return enabled;
  } catch (e) {
    console.warn('monitoring: Sentry init failed (not fatal):', e && e.message);
    return false;
  }
}

/** Report one error. Mirrors recordError's shape on purpose — `kind` becomes
 *  the grouping tag, so the digest and Sentry group the same fault the same
 *  way and comparing them is possible. Never throws. */
function captureError(kind, err, context) {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      scope.setTag('kind', String(kind).slice(0, 40));
      if (context) scope.setExtra('context', String(context).slice(0, 1000));
      /* A real Error keeps its stack; a string does not, and capturing a string
         as an exception produces an event with a useless synthetic stack. */
      if (err instanceof Error) Sentry.captureException(err);
      else Sentry.captureMessage(String(err || 'unknown'), 'error');
    });
  } catch (e) {
    console.warn('monitoring: capture failed (not fatal):', e && e.message);
  }
}

/** Wait for queued events to reach Sentry. Only for short-lived processes — a
 *  script that exits immediately loses whatever was still in the queue. The
 *  server must not call this; it would block a request on a network round trip
 *  to a third party. */
async function flushMonitoring(timeoutMs = 5000) {
  if (!enabled) return false;
  try {
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}

function monitoringEnabled() {
  return enabled;
}

module.exports = {
  initMonitoring,
  captureError,
  flushMonitoring,
  monitoringEnabled,
  environmentName,
  releaseName,
  /* Exported so the scrubber can be tested on its own. It is the one function
     here whose failure is silent and expensive — a leak does not throw, it just
     ships a customer's address to a third party — so it is worth asserting on
     directly rather than through an init. */
  scrubEvent: scrub,
  Sentry,
};
