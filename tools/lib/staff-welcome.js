'use strict';
/* The welcome email a new helper gets when the owner adds them on /admin/staff
 * (or presses "Send welcome email" on their card later). Pure: the route sends
 * it. Every value the owner typed is escaped, and nothing here is stored —
 * hours, schedule and start date live only in the email.
 *
 * A field the owner filled in but that cannot go in the email is REFUSED with
 * a reason (detailsFromForm -> problems), never silently left out: a dropped
 * folder link under a "Welcome email sent" message is a promise the owner
 * thinks they kept. */
const { escHtml: esc } = require('./html-escape');

const clip = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

/** A shared-folder link the email may carry: https only, no credentials. */
function safeLink(v) {
  const s = clip(v, 500);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' || u.username || u.password) return '';
    return u.toString();
  } catch { return ''; }
}

/** "2026-10-13" -> "Tuesday, October 13, 2026"; anything else -> ''. */
function niceDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clip(v, 10));
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.getUTCMonth() !== +m[2] - 1) return '';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const money = (n) => `$${Number(n).toFixed(2)}`;
const rate = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= 200 ? n : 0; };
const isApple = (link) => { try { return /(^|\.)icloud\.com$/i.test(new URL(link).hostname); } catch { return false; } };

/**
 * Reads the owner's form into clean details, and lists every filled-in field
 * that cannot be used. `wage` is the helper's current hourly wage: a rate
 * after training must be higher than it.
 * @returns {{details: object, problems: string[]}}
 */
function detailsFromForm(b = {}, wage = 0) {
  const problems = [];
  const given = (k) => clip(b[k], 500) !== '';

  const hoursN = Number(clip(b.welcome_hours, 10));
  const hours = Number.isInteger(hoursN) && hoursN > 0 && hoursN <= 60 ? hoursN : 0;
  if (given('welcome_hours') && !hours) problems.push('Hours a week must be a whole number from 1 to 60.');

  const start = niceDate(b.welcome_start);
  if (given('welcome_start') && !start) problems.push('The start date is not a real date.');

  const raise = rate(clip(b.welcome_raise, 10));
  if (given('welcome_raise')) {
    if (!raise) problems.push('The rate after training must be a number above 0.');
    else if (!(rate(wage) > 0)) problems.push('Set their hourly wage before promising a rate after training.');
    else if (raise <= rate(wage)) problems.push(`The rate after training must be more than their wage now (${money(rate(wage))}).`);
  }

  const folder = safeLink(b.welcome_folder);
  if (given('welcome_folder') && !folder) problems.push('The folder link must start with https:// and hold no password.');

  return { details: { hours, schedule: clip(b.welcome_schedule, 200), start, raise: problems.length ? 0 : raise, folder }, problems };
}

const ROW = 'border:1px solid #ccc;padding:8px 12px;';

/**
 * @param {object} p
 * @param {string} p.name       helper's name
 * @param {string} p.role       job title, e.g. "Graphic Designer"
 * @param {string} p.track      training path label, e.g. "Design"
 * @param {number} p.wage       hourly wage now
 * @param {string} p.signInUrl  e.g. https://www.jtees.net/admin
 * @param {string} p.siteUrl    e.g. https://www.jtees.net
 * @param {object} p.details    `details` from detailsFromForm
 */
function welcomeEmail({ name, role, track, wage, signInUrl, siteUrl, details = {} }) {
  const first = clip(name, 80).split(' ')[0] || 'there';
  const d = details;
  const rows = [
    ['Position', clip(role, 80)],
    d.hours ? ['Hours', `${d.hours} hours a week`] : null,
    d.schedule ? ['Schedule', d.schedule] : null,
    rate(wage) ? [d.raise ? 'Pay during training' : 'Pay', `${money(rate(wage))} an hour`] : null,
    d.raise && rate(wage) ? ['Pay after training sign-off', `${money(d.raise)} an hour`] : null,
    d.start ? ['Start date', d.start] : null,
  ].filter((r) => r && r[1]);

  const steps = [
    'First, read and sign our <b>staff agreement</b>. It opens by itself the first time you sign in, and the workspace opens once it is signed.',
    `Your <b>${esc(track)} training</b> is waiting for you under Training once you sign in. Work through it in order.`,
    'Say hello in <b>Team chat</b>. That\'s where we\'ll talk day to day.',
    d.folder ? `Our shared folder for files and drafts: <a href="${esc(d.folder)}">open the folder</a>.${isApple(d.folder)
      ? ' If it asks you to sign in, make a free Apple Account with this same email.' : ''}` : null,
    d.raise && rate(wage) ? `Once your training is signed off, your rate moves to ${money(d.raise)} an hour.` : null,
  ].filter(Boolean);

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;">
<p>Hi ${esc(first)},</p>
<p>Congratulations, and welcome to June's Tees! I'm excited to have you on the team as our <b>${esc(clip(role, 80))}</b>.</p>
<p><b>Your role</b></p>
<table style="border-collapse:collapse;margin:6px 0 16px;">
${rows.map(([k, v]) => `<tr><td style="${ROW}"><b>${esc(k)}</b></td><td style="${ROW}">${esc(v)}</td></tr>`).join('\n')}
</table>
<p><b>How to sign in</b></p>
<ol>
<li>Go to <a href="${esc(signInUrl)}">${esc(signInUrl.replace(/^https:\/\//, ''))}</a></li>
<li>Enter the email address this message was sent to.</li>
<li>Check your inbox for a sign-in code and type it in. There is no password.</li>
</ol>
<p>If the code doesn't arrive, check your spam folder. If the page says you're not allowed in yet, I'm still finishing your access: try again in an hour, then message me.</p>
<p><b>Your first week</b></p>
<ul>
${steps.map((s) => `<li>${s}</li>`).join('\n')}
</ul>
<p>Please reply to confirm you've received this${d.start ? ' and that the start date works for you' : ''}.</p>
<p>Welcome aboard, ${esc(first)}. I'm looking forward to working with you!</p>
<p>Best,<br>June<br>June's Tees<br><a href="${esc(siteUrl)}">${esc(siteUrl.replace(/^https:\/\//, ''))}</a></p>
</div>`;

  return { subject: `Welcome to June's Tees, ${clip(first, 40)}! You're on the team`, html };
}

/** Job title for a training path, used when the owner leaves it blank. */
const { ROLE_FOR_TRACK } = require('./tracks');

module.exports = { welcomeEmail, detailsFromForm, safeLink, niceDate, ROLE_FOR_TRACK };
