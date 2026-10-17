'use strict';
/* The welcome email a new helper gets from /admin/staff. */
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const W = require('../tools/lib/staff-welcome');

const base = { role: 'Graphic Designer', track: 'Design', wage: 4.5,
  signInUrl: 'https://www.jtees.net/admin', siteUrl: 'https://www.jtees.net' };

test('the email carries the role, pay, schedule, start date and sign-in steps', () => {
  const { details, problems } = W.detailsFromForm({ welcome_hours: '30', welcome_schedule: 'Mon–Fri 9am–2pm US Central',
    welcome_start: '2026-10-13', welcome_raise: '5' }, 4.5);
  assert.deepStrictEqual(problems, []);
  const { subject, html } = W.welcomeEmail({ ...base, name: 'Eleazar Cruz', details });
  assert.match(subject, /Eleazar/);
  assert.match(html, /Hi Eleazar,/);
  assert.match(html, /30 hours a week/);
  assert.match(html, /Mon–Fri 9am–2pm US Central/);
  assert.match(html, /Tuesday, October 13, 2026/);
  assert.match(html, /Pay during training.*\$4\.50 an hour/s);
  assert.match(html, /Pay after training sign-off.*\$5\.00 an hour/s);
  assert.match(html, /href="https:\/\/www\.jtees\.net\/admin"/);
  assert.match(html, /Design training/);
  assert.doesNotMatch(html, /design\.jtees\.net/);
});

test('blank fields leave their rows out instead of printing empty ones', () => {
  const { html } = W.welcomeEmail({ ...base, name: 'Ana', details: W.detailsFromForm({}).details });
  assert.doesNotMatch(html, /Hours<|Schedule<|Start date<|after training/);
  assert.match(html, /<b>Pay<\/b>.*\$4\.50/s);
  assert.doesNotMatch(html, /start date works/);
});

test('everything the owner typed is escaped', () => {
  const { details } = W.detailsFromForm({ welcome_schedule: '<script>alert(1)</script>' });
  const { html } = W.welcomeEmail({ ...base, name: '<b>x</b>', role: '"><img src=x>', details });
  assert.doesNotMatch(html, /<script>|<img src=x>|<b>x<\/b>/);
  assert.match(html, /&lt;script&gt;/);
});

test('the folder link must be https with no credentials', () => {
  assert.equal(W.safeLink('javascript:alert(1)'), '');
  assert.equal(W.safeLink('http://www.icloud.com/x'), '');
  assert.equal(W.safeLink('https://user:pw@evil.com/'), '');
  assert.equal(W.safeLink('https://www.icloud.com/iclouddrive/abc#Folder'), 'https://www.icloud.com/iclouddrive/abc#Folder');
  let { html } = W.welcomeEmail({ ...base, name: 'A', details: W.detailsFromForm({ welcome_folder: 'https://www.icloud.com/iclouddrive/abc' }).details });
  assert.match(html, /href="https:\/\/www\.icloud\.com\/iclouddrive\/abc"/);
  assert.match(html, /Apple Account/);
  ({ html } = W.welcomeEmail({ ...base, name: 'A', details: W.detailsFromForm({ welcome_folder: 'https://drive.google.com/x' }).details }));
  assert.doesNotMatch(html, /Apple Account/, 'only an iCloud link mentions Apple');
});

test('a filled-in field that cannot be used is refused with a reason, never dropped', () => {
  const { problems } = W.detailsFromForm({ welcome_hours: '2.5', welcome_raise: '9999', welcome_start: '2026-02-31',
    welcome_folder: 'http://drive.example/x' }, 4.5);
  assert.equal(problems.length, 4, problems.join(' | '));
  assert.equal(W.niceDate('13/10/2026'), '');
});

test('the rate after training must beat the wage now, and needs a wage', () => {
  assert.match(W.detailsFromForm({ welcome_raise: '4' }, 4.5).problems[0], /more than their wage now \(\$4\.50\)/);
  assert.match(W.detailsFromForm({ welcome_raise: '5' }, 0).problems[0], /Set their hourly wage/);
  assert.deepStrictEqual(W.detailsFromForm({ welcome_raise: '5' }, 4.5).problems, []);
});

test('the add route emails only after the insert, and a failed send never undoes the add', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const at = src.indexOf("app.post('/admin/staff', requireAdmin");
  const route = src.slice(at, src.indexOf("app.post('/admin/staff/:id'", at));
  assert.ok(route.indexOf('INSERT INTO staff') < route.indexOf('sendStaffWelcome('));
  assert.ok(route.indexOf('welcome.problems.length') < route.indexOf('INSERT INTO staff'), 'bad fields refuse before the insert');
  const fn = src.slice(src.indexOf('async function sendStaffWelcome'), src.indexOf('function cloudflareStepCard'));
  assert.ok(fn.indexOf('try {') < fn.indexOf('WELCOME.welcomeEmail('), 'building the email is inside the try too');
  assert.match(fn, /catch \(err\)/);
  assert.match(fn, /promo: false/);
});
