/* The reintroduction campaign (tools/lib/reintro.js, server.js).
 *
 * Run: node --test tests/*.test.js
 *
 * The legal line this guards: a promotional text goes only to a phone whose
 * newest consent includes marketing. A number given for an order or quote is
 * consent to order updates, not promotions, and every promotional text sent
 * without written consent is its own fine. Everyone else is emailed, and the
 * 10% code is earned by signing up for texts.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const R = require('../tools/lib/reintro');
const { foldSmsConsent, isGsm7 } = { ...require('../tools/lib/sms-consent'), ...require('../tools/lib/sms-templates') };
const src = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

const row = (phone, transactional, marketing) => ({ phone, transactional, marketing });

test('only numbers whose newest consent includes deals get the text', () => {
  const phones = R.marketingPhones([
    row('+17735550001', true, false),                 // order updates only
    row('+17735550002', true, true),                  // deals too
    row('+17735550003', false, true), row('+17735550003', false, false),   // then texted STOP
    row('+17735550004', true, false), row('+17735550004', false, true),    // added deals later
  ], foldSmsConsent);
  assert.deepStrictEqual([...phones].sort(), ['+17735550002', '+17735550004']);
});

test('the email goes to everyone else: deduped, no unsubscribed, nobody texted twice over', () => {
  const texted = new Set(['+17735550002']);
  const out = R.emailAudience([
    { email: 'Ann@Example.com', attributes: { FIRSTNAME: 'Ann Lee' } },
    { email: 'ann@example.com', attributes: {} },                               // same person
    { email: 'bo@example.com', emailBlacklisted: true, attributes: {} },        // unsubscribed
    { email: 'cy@example.com', attributes: { SMS: '17735550002' } },            // gets the text
    { email: 'not-an-email', attributes: {} },
    { email: 'di@example.com', attributes: { SMS: '+17735550009' } },           // order-only phone: email
  ], texted);
  assert.deepStrictEqual(out, [{ email: 'ann@example.com', first: 'Ann' }, { email: 'di@example.com', first: '' }]);
});

test('the hello text is warm, links to the site, carries the opt-out and fits two segments', () => {
  for (const first of ['', 'Tom', 'Christopher-Alexander']) {
    const { body, template } = R.helloText({ first });
    assert.ok(isGsm7(body), body);
    assert.ok(body.length <= 306, `${body.length}: ${body}`);
    assert.match(body, /^June's Tees: Hi/);
    assert.match(body, / jtees\.net /);
    assert.doesNotMatch(body, /design\.jtees\.net/);
    assert.match(body, /design your own/);
    assert.match(body, /45\+ garments/);
    assert.match(body, /Reply STOP to opt out\.$/);
    assert.strictEqual(template, 'reintro');
  }
  const c = R.codeText({ code: 'TEXTSAB2CD' });
  assert.ok(c.body.length <= 306 && isGsm7(c.body));
  assert.match(c.body, /TEXTSAB2CD/);
  /* The first text after an opt-in: who, how often, rates, HELP and STOP. */
  for (const re of [/^June's Tees:/, /Up to 4 msgs\/mo/, /msg & data rates may apply/, /HELP/, /STOP to opt out\.$/]) {
    assert.match(c.body, re);
  }
});

test('codes are unguessable-enough, unambiguous and in the shape the studio accepts', () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = R.newCode();
    assert.match(c, /^TEXTS[A-HJKMNP-Z2-9]{5}$/, 'no 0/O or 1/I/L');
    assert.match(c, /^[A-Z0-9]{3,32}$/, 'the Discounts page code shape');
    seen.add(c);
  }
  assert.ok(seen.size > 190);
});

test('the email offers the 10% for signing up, links to sign-up with their address, and escapes names', () => {
  const m = R.helloEmail({ first: '<b>Ann</b>', email: 'ann+x@example.com' });
  assert.match(m.subject, /10% off/);
  assert.match(m.html, /https:\/\/www\.jtees\.net\/texts\?src=email&amp;e=ann%2Bx%40example\.com/);
  /* The shop's own photos, absolute and described, and links to the site. */
  const imgs = m.html.match(/<img [^>]*>/g);
  assert.ok(imgs.length >= 6, 'logo, Design Lab and four photos of the work');
  for (const i of imgs) {
    assert.match(i, /src="https:\/\/www\.jtees\.net\/assets\/images\//, i);
    assert.match(i, /alt="[^"]+"/, 'every image has alt text');
  }
  assert.match(m.html, /href="https:\/\/www\.jtees\.net"[^>]*>Start designing/);
  assert.match(m.html, />Visit jtees\.net</);
  for (const f of ['Upload your logo', 'fonts', 'AI design help', '45+ real garments', 'No minimums', 'Save your designs']) {
    assert.ok(m.html.includes(f), `the Design Lab feature "${f}"`);
  }
  assert.match(m.html, /Sign up for our texts/);
  assert.match(m.html, /reply STOP/);
  assert.doesNotMatch(m.html, /<b>Ann<\/b>/);
});

test('the campaign pages are the owner\'s, and the sign-up is rate limited', () => {
  for (const r of ["app.get('/admin/campaign', requireAdmin", "app.post('/admin/campaign/text', requireAdmin",
                   "app.post('/admin/campaign/email', requireAdmin"]) {
    const at = src.indexOf(r);
    assert.ok(at > 0, r);
    assert.match(src.slice(at, at + 200), /if \(!isOwner\(\)\) return res\.redirect/, `${r} must be owner-only`);
  }
  assert.match(src, /app\.post\(REINTRO\.SIGNUP_PATH, makeRateLimit\(6, 60 \* 60 \* 1000\)/);
  const post = src.slice(src.indexOf('app.post(REINTRO.SIGNUP_PATH'));
  assert.match(post.slice(0, 1200), /if \(!consent\.marketing\) return again/, 'no code without the deals box');
});

test('campaign texts are promotional, consent-checked again at send, and stop outside the day', () => {
  const fn = src.slice(src.indexOf('async function sendCampaignTexts'), src.indexOf("app.get('/admin/campaign'"));
  assert.match(fn, /kind: 'marketing'/);
  assert.match(fn, /if \(!inTextingHours\(\)\) break;/);
  assert.match(src.slice(src.indexOf('async function sendCustomerSms')).slice(0, 400),
    /kind === 'marketing' \? c\.marketing : c\.transactional/, 'sendCustomerSms re-checks marketing consent');
});

test('campaign emails are marketing mail (unsubscribe link, skips the unsubscribed)', () => {
  const fn = src.slice(src.indexOf('async function sendCampaignEmails'), src.indexOf('let campaignTextRunning'));
  assert.match(fn, /marketing: true/);
  assert.match(fn, /ON CONFLICT \(campaign, email\) DO NOTHING/, 'one email per address, however often it runs');
  assert.match(fn, /JT_CAMPAIGN_EMAILS_PER_DAY/);
});

test('texting JOIN or DEALS signs up; STOP still wins', () => {
  const { classifyInbound } = require('../tools/lib/twilio-webhook');
  for (const w of ['JOIN', ' join! ', 'Deals']) assert.strictEqual(classifyInbound(w), 'join', w);
  assert.strictEqual(classifyInbound('STOP'), 'stop');
  assert.strictEqual(classifyInbound('I want to join a team order'), 'message', 'a sentence is a message, not a keyword');
  const hook = src.slice(src.indexOf("app.post('/webhooks/twilio/sms'"));
  assert.match(hook.slice(0, 4000), /kind === 'join'\) \{\s*await joinByText\(from\)/);
  const join = src.slice(src.indexOf('async function joinByText'), src.indexOf('async function sendCampaignEmails'));
  assert.match(join, /transactional: true, marketing: true \}, \{ source: 'sms-keyword:join' \}/, 'consent recorded before anything is sent');
  assert.ok(join.indexOf('recordSmsConsent') < join.indexOf('sendCustomerSms'));
});

test('the shop sign is the owner\'s and carries the disclosures', () => {
  const at = src.indexOf("app.get('/admin/campaign/sign', requireAdmin");
  assert.ok(at > 0);
  const sign = src.slice(at, at + 2600);
  assert.match(sign, /if \(!isOwner\(\)\) return res\.redirect/);
  for (const re of [/up to 4 msgs\/month/, /Msg &amp; data rates may apply/, /Reply HELP for help, STOP to opt out/,
                    /Consent is not a condition of purchase/, /text <b>JOIN<\/b>/, /\?src=shop/]) assert.match(sign, re);
});

test('a JOIN sign-up has no email, so only real addresses are unique', () => {
  assert.match(src, /CREATE UNIQUE INDEX IF NOT EXISTS text_signups_email ON text_signups \(email\) WHERE email <> ''/);
});

test('no promises the shop cannot keep yet: no delivery, no faster turnaround', () => {
  const t = R.helloText({ first: 'Tom' }).body;
  const m = R.helloEmail({ first: 'Tom', email: 't@example.com' }).html;
  for (const text of [t, m]) {
    assert.doesNotMatch(text, /deliver/i, 'local delivery is paused until it is set up');
    assert.doesNotMatch(text, /faster|turnaround/i);
  }
  assert.match(m, /choose your garment/i);
  assert.match(m, /design it your way/i);
  for (const cat of [52, 53, 54, 55, 56, 57]) assert.ok(m.includes(`products.php?category_id=${cat}`), `garment ${cat} links to its page`);
});

/* withTextsInvite, lifted out and run against a fake pool. */
function invite(rows = []) {
  const vm = require('node:vm');
  const at = src.indexOf('const TEXTS_INVITE_UNTIL');
  const end = src.indexOf('// ─── Brevo email (preferred');
  const ctx = vm.createContext({ pool: { query: async () => ({ rows }) }, REINTRO: R, NOTIFY_EMAIL: 'shop@example.com',
    SHOP_EMAIL: 'june@example.com', process: { env: { OWNER_EMAILS: 'owner@example.com' } }, console: { error() {} } });
  vm.runInContext(src.slice(at, end) + ';this.f = withTextsInvite;', ctx);
  return ctx.f;
}

test('every customer email carries the sign-up box until the new year', async () => {
  const f = invite();
  const out = await f('Cat@Example.com', '<p>Your receipt</p>', new Date('2026-12-31T23:00:00-06:00'));
  assert.match(out, /^<p>Your receipt<\/p>/, 'after the email, never instead of it');
  assert.match(out, /texts\?src=receipt&amp;e=cat%40example\.com/);
  assert.match(out, /Get 10% off/);
  assert.strictEqual(await f('cat@example.com', '<p>x</p>', new Date('2027-01-01T00:00:00-06:00')), '<p>x</p>', 'fresh start in the new year');
});

test('never to the shop, the owner, staff, or anyone already signed up', async () => {
  const f = invite();
  for (const to of ['shop@example.com', 'june@example.com', 'owner@example.com', 'ana@jtees.net']) {
    assert.strictEqual(await f(to, '<p>x</p>', new Date('2026-10-06T12:00:00Z')), '<p>x</p>', to);
  }
  assert.strictEqual(await invite([{ 1: 1 }])('cat@example.com', '<p>x</p>', new Date('2026-10-06T12:00:00Z')), '<p>x</p>',
    'signed up (or on the staff list)');
});

test('the emails that must stay plain opt out', () => {
  assert.match(src, /async function sendEmail\(\{ to, subject, html, replyTo, marketing = false, text, promo = true(, attachments = \[\])? \}\)/);
  assert.match(src, /is your June's Tees sign-in code`, promo: false/);
  assert.match(src, /to: partner\.email, promo: false/);
  assert.match(src, /Your \$\{REINTRO\.PCT\}% off code: \$\{code\}`, promo: false/);
  assert.match(src, /html: m\.html, marketing: true, promo: false/, 'the hello email has its own, bigger offer');
});

test('the test send is the owner\'s and reaches only the owner', () => {
  const at = src.indexOf("app.post('/admin/campaign/test', requireAdmin");
  assert.ok(at > 0);
  const r = src.slice(at, src.indexOf('app.post(', at + 10));
  assert.match(r, /if \(!isOwner\(\)\) return res\.redirect/);
  assert.match(r, /OWNER_EMAILS/);
  assert.match(r, /sendOwnerSms\('\[TEST\] '/, 'the text goes to the shop phone only');
  assert.doesNotMatch(r, /campaign_runs/, 'a test does not start the campaign');
});

test('the sign-up page wears the brand', () => {
  const p = src.slice(src.indexOf('const TEXTS_CSS'), src.indexOf('app.get(REINTRO.SIGNUP_PATH'));
  for (const re of [/#0B1F4B/, /#F0275A/, /Inter/, /\/assets\/images\/brand\/logo\.png/, /products\.php\?category_id=/]) assert.match(p, re);
});
