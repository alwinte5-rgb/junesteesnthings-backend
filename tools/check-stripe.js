#!/usr/bin/env node
/*
 * Verify the Stripe setup for quote payments.
 *
 * Run it after pasting a new key into Railway:
 *     railway run --service junesteesnthings-backend node tools/check-stripe.js
 * or against a key you have locally:
 *     STRIPE_SECRET_KEY=sk_live_... node tools/check-stripe.js
 *
 * Checks, in order: the key is valid and live, the account can actually take
 * charges, which payment methods are switched on, and that a real Checkout
 * Session can be created. Nothing is charged.
 */

const KEY = process.env.STRIPE_SECRET_KEY || '';

const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);
const bad = (m) => console.log('  \x1b[31m✗\x1b[0m ' + m);
const note = (m) => console.log('    ' + m);

async function stripe(path, opts = {}) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + KEY,
      ...(opts.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
  });
  return { status: r.status, body: await r.json() };
}

(async () => {
  console.log('\nStripe check for quote payments\n' + '-'.repeat(46));

  if (!KEY) {
    bad('STRIPE_SECRET_KEY is not set');
    note('Set it in Railway: junesteesnthings-backend > Variables');
    process.exit(1);
  }

  // 1. Key shape
  const kind =
    KEY.startsWith('sk_live_') ? 'live secret' :
    KEY.startsWith('sk_test_') ? 'test secret' :
    KEY.startsWith('rk_live_') ? 'live restricted' :
    /^rk(cs)?_test_/.test(KEY) ? 'test restricted' : 'unknown';

  if (kind === 'live secret') ok(`key looks right (${kind})`);
  else if (kind === 'live restricted') {
    ok(`key is live (${kind})`);
    note('A restricted key works only if it can write Checkout Sessions.');
  } else {
    bad(`key is a ${kind} key — real payments will NOT work`);
    note('You need the LIVE secret key: Stripe Dashboard > Developers > API keys,');
    note('with the Test mode toggle OFF. It begins sk_live_.');
  }

  // 2. Valid?
  const acct = await stripe('account');
  if (acct.body.error) {
    bad('Stripe rejected the key: ' + acct.body.error.message);
    if (/expired/i.test(acct.body.error.message)) {
      note('Expired keys cannot be revived — roll a new one and paste that.');
    }
    process.exit(1);
  }
  ok('key is valid');
  note('account: ' + (acct.body.business_profile?.name || acct.body.id));

  // 3. Can it actually take money?
  if (acct.body.charges_enabled) ok('account can accept charges');
  else {
    bad('account cannot accept charges yet');
    note('Finish onboarding in the Stripe dashboard (business details, bank account).');
  }
  if (acct.body.payouts_enabled) ok('payouts enabled'); else bad('payouts not enabled — add a bank account');

  // 4. Which payment methods are switched on?
  const pm = await stripe('payment_method_configurations');
  if (!pm.body.error && Array.isArray(pm.body.data) && pm.body.data.length) {
    const cfg = pm.body.data[0];
    const on = Object.entries(cfg)
      .filter(([, v]) => v && typeof v === 'object' && v.display_preference)
      .filter(([, v]) => v.display_preference.value !== 'off')
      .map(([k]) => k);
    ok(`payment methods enabled (${on.length})`);
    note(on.join(', ') || '(none)');
    for (const want of ['card', 'link', 'cashapp', 'paypal', 'klarna', 'affirm', 'us_bank_account']) {
      if (!on.includes(want)) note(`not enabled: ${want} — turn on in Dashboard > Settings > Payment methods`);
    }
    note('Apple Pay and Google Pay ride on "card" and need no extra setup in hosted Checkout.');
  } else {
    note('could not read payment method configuration (fine — Checkout still uses your dashboard settings)');
  }

  // 5. Can we create the session the quote page needs?
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', 'https://www.jtees.net/ok');
  form.set('cancel_url', 'https://www.jtees.net/no');
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'usd');
  form.set('line_items[0][price_data][unit_amount]', '5000');
  form.set('line_items[0][price_data][product_data][name]', 'Setup check (not charged)');
  const sess = await stripe('checkout/sessions', { method: 'POST', body: form.toString() });

  if (sess.body.error) {
    bad('could not create a Checkout Session: ' + sess.body.error.message);
    if (/permission|scope/i.test(sess.body.error.message)) {
      note('A restricted key needs WRITE access to Checkout Sessions.');
    }
    process.exit(1);
  }
  ok('Checkout Session created — card payments will work');
  note('methods offered: ' + (sess.body.payment_method_types || []).join(', '));

  // Tidy up so the test session does not linger.
  await stripe(`checkout/sessions/${sess.body.id}/expire`, { method: 'POST' }).catch(() => {});

  console.log('\n' + '-'.repeat(46));
  console.log(acct.body.charges_enabled && kind.startsWith('live')
    ? 'Ready to take payments.\n'
    : 'Not ready yet — see the ✗ lines above.\n');
})().catch(e => { bad(e.message); process.exit(1); });
