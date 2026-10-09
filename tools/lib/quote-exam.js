'use strict';

/* The quote exam (Sales course module 6): real requests, built in the real
   quote form in practice mode and checked here.

   A practice quote is never saved as a quote. The quote form posts as usual,
   the save route prices it exactly as it would a real one, and then, before
   anything is written, hands the lines it built to grade() and stores only the
   result (staff_exam_attempts). So a practice quote can never reach a board,
   a report, commission, Brevo or the customer.

   What is checked is what the helper CHOSE: the product, the decoration, the
   quantity and sizes, where it prints, how many colours, and whether rush
   applies. The price is the system's own, from those choices, so it is shown
   but not marked: a right set of choices is a right price.

   Scenarios marked `real` are the shop's newest accepted quotes (October 2026,
   after the quote form gained print locations), with names, contacts and
   prices taken out. The rest are written from the current price rules and the
   Sales course. Methods and products are matched by their names in the live
   catalogue, never by id, so a catalogue rebuild cannot break the exam. */

const PASS_SHARE = 0.8;

/* A decoration's kind, from its catalogue title. */
function methodKind(title) {
  const t = String(title || '');
  if (/cutout|big\s*head/i.test(t)) return 'cutout';
  if (/embroid/i.test(t)) return 'embroidery';
  if (/\bdtf\b|direct.to.film/i.test(t)) return 'dtf';
  if (/screen/i.test(t)) return 'screen';
  return 'other';
}
const KIND_LABEL = { cutout: 'Big Head Cutout', embroidery: 'Embroidery', dtf: 'DTF', screen: 'Screen printing', other: 'something else' };

/* Each scenario: id, real (a past quote) or not, title, brief (what the
   customer said, as the helper would read it), businessDays (when they need
   it, from today), and expect: one required line, plus whether rush applies.
   A line expects:
     method   kind ('dtf' | 'screen' | 'embroidery' | 'cutout')
     methodRe the catalogue title must also match (cutout size and pack)
     product  the product name must match (omitted: any, or none)
     qty      pieces (the size mix total when there is one)
     sizes    the size mix, exactly
     places   print places, exactly (omitted for cutouts)
     colours  ink colours per place (screen printing only)
   `why` is the owner's reasoning, shown after the attempt. */
const SCENARIOS = [
  {
    id: 'hoodies-dtf', real: true, title: 'Three hoodies, printed front and back',
    brief: 'Hi! Can I get 3 black hoodies, the Gildan 18500 heavy blend, with my full-colour design big on the front and a small one on the back? 2 mediums and 1 large.',
    businessDays: 8,
    expect: { rush: false, line: { method: 'dtf', product: /18500/, qty: 3, sizes: { M: 2, L: 1 }, places: ['front', 'back'] } },
    why: 'Three pieces in full colour is DTF: no minimum, any number of colours. Two print places, each ticked with DTF, and the size mix entered so the system prices the sizes. The date is far enough out for no rush.',
  },
  {
    id: 'cutouts-seniors', real: true, title: 'Big heads for the senior soccer players',
    brief: 'I\'m looking to create eight "big head" cutouts for the seniors on my son\'s high school soccer team. Each head cut around the outline, about 2 feet tall.',
    businessDays: 8,
    expect: { rush: false, line: { method: 'cutout', methodRe: /24\s*in.*8.?pack/i, qty: 1 } },
    why: 'Eight heads at 24 inches is exactly one 24in 8-pack, which costs far less than eight singles. One pack, quantity 1. No rush: there is time.',
  },
  {
    id: 'cutouts-rush', real: true, title: 'Eight big heads, needed fast',
    brief: 'We need 8 big head cutouts of the team, 24 inch, for the game on Friday!',
    businessDays: 3,
    expect: { rush: true, line: { method: 'cutout', methodRe: /24\s*in.*8.?pack/i, qty: 1 } },
    why: 'Eight 24-inch heads is one 24in 8-pack. Friday is 3 business days away, so rush applies: set the needed-by date and the form adds it. Say you will confirm the date after checking with June.',
  },
  {
    id: 'cutouts-singles', real: true, title: 'Five smaller heads, needed fast',
    brief: 'Can you do 5 big head cutouts, the 18 inch size? We need them in 3 days for senior night.',
    businessDays: 3,
    expect: { rush: true, line: { method: 'cutout', methodRe: /18\s*in.*single/i, qty: 5 } },
    why: 'Five heads at 18 inches: five 18in singles. The Upsell ideas box shows whether a pack would be cheaper per head; offer it if so, but build what they asked. Three business days means rush.',
  },
  {
    id: 'tees-screen-100', real: false, title: 'A hundred tees, one colour',
    brief: 'We need 100 Gildan 5000 tees for our charity walk, one-colour logo on the front. Sizes: 15 S, 30 M, 35 L, 20 XL.',
    businessDays: 20,
    expect: { rush: false, line: { method: 'screen', product: /\b5000\b/, qty: 100, sizes: { S: 15, M: 30, L: 35, XL: 20 }, places: ['front'], colours: { front: 1 } } },
    why: '100 pieces with one ink colour is screen printing: well over the 50 minimum and the cheapest per shirt. One place, one colour (the white base is added by the system, not by you).',
  },
  {
    id: 'tees-dtf-30', real: false, title: 'Thirty tees, two colours',
    brief: 'Looking for 30 Gildan 5000 tees with our 2-colour logo on the front. 10 M, 10 L, 10 XL please.',
    businessDays: 15,
    expect: { rush: false, line: { method: 'dtf', product: /\b5000\b/, qty: 30, sizes: { M: 10, L: 10, XL: 10 }, places: ['front'] } },
    why: 'Under 50 pieces is DTF, not screen printing: screens need 50. The form warns you if you pick screen printing here.',
  },
  {
    id: 'tees-screen-two-places', real: false, title: 'Sixty tees, front and back',
    brief: 'Our league needs 60 Gildan 5000 tees: a 2-colour logo on the front and a 1-colour sponsor list on the back. 20 YM, 20 YL, 20 AM. Actually make it 20 S, 20 M, 20 L.',
    businessDays: 20,
    expect: { rush: false, line: { method: 'screen', product: /\b5000\b/, qty: 60, sizes: { S: 20, M: 20, L: 20 }, places: ['front', 'back'], colours: { front: 2, back: 1 } } },
    why: '60 pieces is screen printing. Each place is priced on its own: front with 2 colours, back with 1. Read the whole message: the customer changed the sizes at the end.',
  },
  {
    id: 'polos-embroidery', real: false, title: 'Polos for a dental office',
    brief: 'Hi, I\'d like our logo embroidered on the left chest of 12 polos for our staff. 4 S, 4 M, 4 L.',
    businessDays: 15,
    expect: { rush: false, line: { method: 'embroidery', product: /polo/i, qty: 12, sizes: { S: 4, M: 4, L: 4 }, places: ['front'] } },
    why: 'A logo on polos is embroidery. The left chest is on the front. Mention the one-time digitizing fee.',
  },
  {
    id: 'caps-embroidery', real: false, title: 'Caps with a logo',
    brief: 'Can we get 24 caps with our bakery logo stitched on the front?',
    businessDays: 15,
    expect: { rush: false, line: { method: 'embroidery', product: /cap|hat/i, qty: 24, places: ['front'] } },
    why: 'Caps with a logo: embroidery, on the front. Keep the logo simple: no small text on caps.',
  },
  {
    id: 'reunion-dtf-rush', real: false, title: 'A family reunion, very soon',
    brief: 'Our family reunion is in 2 days! Can you make 15 Gildan 5000 tees with our family photo on the front? 5 M, 5 L, 5 XL.',
    businessDays: 2,
    expect: { rush: true, line: { method: 'dtf', product: /\b5000\b/, qty: 15, sizes: { M: 5, L: 5, XL: 5 }, places: ['front'] } },
    why: 'A photo in full colour on 15 shirts is DTF. Two business days means rush; set the date and the form adds it. Tell them you are confirming the date with June today.',
  },
  {
    id: 'hoodies-screen-back', real: false, title: 'Hoodies for a gym',
    brief: 'We want 50 Gildan 18500 hoodies with our gym logo in 1 colour on the back only. 10 S, 20 M, 20 L.',
    businessDays: 20,
    expect: { rush: false, line: { method: 'screen', product: /18500/, qty: 50, sizes: { S: 10, M: 20, L: 20 }, places: ['back'], colours: { back: 1 } } },
    why: 'Exactly 50 pieces is enough for screen printing. One place, the back only, one colour.',
  },
  {
    id: 'tees-dtf-sleeve', real: false, title: 'A front print and a sleeve',
    brief: 'Can I get 12 Gildan 5000 tees with a full-colour design on the front and our small logo on the left sleeve? All size L.',
    businessDays: 15,
    expect: { rush: false, line: { method: 'dtf', product: /\b5000\b/, qty: 12, sizes: { L: 12 }, places: ['front', 'left'] } },
    why: '12 pieces in full colour is DTF. Two places, the front and the left sleeve, each priced on its own.',
  },
];

const byId = (id) => SCENARIOS.find((s) => s.id === id) || null;

/** How many scenarios must pass: 80%, rounded up. */
function passMark(n = SCENARIOS.length) {
  return Math.ceil(n * PASS_SHARE);
}

const sizesTotal = (m) => Object.values(m || {}).reduce((a, n) => a + (Number(n) || 0), 0);
const sameSizes = (a, b) => {
  const norm = (m) => Object.entries(m || {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => `${String(k).toUpperCase()}:${Number(n)}`).sort().join(',');
  return norm(a) === norm(b);
};
/* A print place as the form names it: front, back, left (sleeve), right (sleeve). */
const placeOf = (loc) => String(loc || '').toLowerCase().replace(/_?sleeve$/, '').replace(/^sleeve_?/, '');

/**
 * Marks one practice quote.
 * @param scenario  from SCENARIOS
 * @param items     the lines the save route built (required and optional)
 * @param rushPct   the rush percentage it priced with
 * @param catalog   { products: [{id, name}], methods: [{id, title}] }
 * @returns { passed, checks: [{ what, ok, got, want }] }
 */
function grade(scenario, items, rushPct, catalog) {
  const want = scenario.expect.line;
  const required = (items || []).filter((i) => !i.optional);
  const checks = [];
  const add = (what, ok, got, wantText) => checks.push({ what, ok: !!ok, got: String(got), want: String(wantText) });
  add('Number of items', required.length === 1, required.length, 1);
  const it = required[0] || {};
  const methods = (catalog && catalog.methods) || [];
  const products = (catalog && catalog.products) || [];
  const mOf = (id) => methods.find((m) => String(m.id) === String(id));
  const prints = Array.isArray(it.prints) ? it.prints : [];
  const method = mOf(prints.length ? prints[0].method_id : it.method_id);
  const kind = methodKind(method && method.title);
  add('Decoration', kind === want.method && (!want.methodRe || want.methodRe.test(method.title)),
    method ? method.title : 'none', want.methodRe ? `${KIND_LABEL[want.method]} (${want.methodRe.source.replace(/\\s\*|\.\?|\.\*/g, ' ').replace(/\s+/g, ' ').trim()})` : KIND_LABEL[want.method]);
  if (prints.length > 1) {
    const kinds = prints.map((p) => methodKind((mOf(p.method_id) || {}).title));
    add('Same decoration in every place', kinds.every((k) => k === want.method), kinds.map((k) => KIND_LABEL[k]).join(', '), KIND_LABEL[want.method]);
  }
  if (want.product) {
    const p = products.find((x) => String(x.id) === String(it.product_id));
    add('Product', p && want.product.test(p.name), p ? p.name : 'none picked', want.product.source.replace(/\\b/g, '').replace(/\|/g, ' or '));
  }
  const qty = it.size_mix && sizesTotal(it.size_mix) ? sizesTotal(it.size_mix) : Number(it.qty) || 0;
  add('Quantity', qty === want.qty, qty, want.qty);
  if (want.sizes) {
    const fmt = (m) => Object.entries(m || {}).map(([k, n]) => `${n} ${k}`).join(', ') || 'none';
    add('Size mix', sameSizes(it.size_mix, want.sizes), fmt(it.size_mix), fmt(want.sizes));
  }
  if (want.places) {
    const got = prints.map((p) => placeOf(p.loc)).sort();
    add('Print places', got.join(',') === [...want.places].sort().join(','), got.join(', ') || 'none', want.places.join(', '));
  }
  if (want.colours) {
    for (const [loc, n] of Object.entries(want.colours)) {
      const p = prints.find((x) => placeOf(x.loc) === loc);
      /* Saved on the line for a method that asks for it; an older per-colour
         method carries its count in its title instead. */
      const t = p ? String((mOf(p.method_id) || {}).title || '') : '';
      const fromTitle = (t.match(/(\d+)\s*colou?rs?/i) || [])[1];
      const got = p ? Number(p.colours) || Number(fromTitle) || 0 : 0;
      add(`Ink colours (${loc})`, got === n, got, n);
    }
  }
  const rush = Number(rushPct) > 0;
  add('Rush', rush === !!scenario.expect.rush, rush ? `yes (${Number(rushPct)}%)` : 'no', scenario.expect.rush ? 'yes' : 'no');
  return { passed: checks.every((c) => c.ok), checks };
}

module.exports = { SCENARIOS, byId, passMark, grade, methodKind, KIND_LABEL };
