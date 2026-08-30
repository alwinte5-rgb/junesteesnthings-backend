'use strict';

/* The customer can change sizes and quantities on their own quote page, and the
 * shop approves the result before anything is re-priced.
 *
 * The security shape matters more than the feature. `/q/:code/changes` is a
 * PUBLIC endpoint — the only thing in front of it is a six-character code — and
 * it writes to a row that carries prices. Two rules keep that safe, and both are
 * pinned below:
 *
 *   1. Size keys are read from the LINE, never from what was posted. A request
 *      naming `sz_0_FREE` must not be able to invent a size on the quote.
 *   2. The edit lands in `requested_items`, never in `items`. `items` is the
 *      quote AS PRICED; a customer who could move it could move the money,
 *      because a different quantity prices in a different volume band.
 *
 * That second point is also why nothing recalculates on the customer's page:
 * a total computed in their browser is a number the shop never agreed to,
 * displayed as though it had.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

/** Lift a top-level `function name(...) {...}` out of server.js by brace depth. */
function lift(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `function ${name} not found in server.js`);
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`unbalanced braces reading ${name} from server.js`);
}

/* runInThisContext, not runInNewContext: a value built in a fresh realm carries
   that realm's Array.prototype, and deepStrictEqual compares prototypes — the
   assertion then fails while printing two identical-looking arrays. */
const describeRequestedEdits = vm.runInThisContext(
  lift('describeRequestedEdits') + '\ndescribeRequestedEdits');

/* SIZE_ORDER is a const the function closes over, so it has to be evaluated in
   the same snippet rather than lifted separately. */
const SIZE_ORDER_SRC = src.match(/^const SIZE_ORDER = \[[^\]]*\];$/m);
assert.ok(SIZE_ORDER_SRC, 'SIZE_ORDER not found at module level in server.js');
const orderedSizeKeys = vm.runInThisContext(
  SIZE_ORDER_SRC[0] + '\n' + lift('orderedSizeKeys') + '\norderedSizeKeys');

const line = (over) => Object.assign(
  { description: 'Gildan 5000', qty: 100, size_mix: { S: 10, M: 30, L: 40, XL: 20 } }, over);

/* ── The diff ────────────────────────────────────────────────────────────── */

test('an untouched request is not a change', () => {
  /* The form posts every current value back, so submitting it without touching
     anything looks identical to a real request. If that counted, the shop's
     board would light up with requests that ask for nothing, and the alert would
     stop being read. */
  const items = [line()];
  const same = [{ qty: 100, sizes: [
    { size: 'S', n: 10 }, { size: 'M', n: 30 }, { size: 'L', n: 40 }, { size: 'XL', n: 20 }] }];
  assert.deepStrictEqual(describeRequestedEdits(items, same), []);
});

test('a changed size is reported with both numbers', () => {
  const items = [line()];
  const asked = [{ qty: 106, sizes: [
    { size: 'S', n: 10 }, { size: 'M', n: 36 }, { size: 'L', n: 40 }, { size: 'XL', n: 20 }] }];
  const out = describeRequestedEdits(items, asked);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0].sizes, [{ size: 'M', was: 30, now: 36 }]);
  assert.strictEqual(out[0].wasQty, 100);
  assert.strictEqual(out[0].nowQty, 106);
});

test('a size dropped to zero is a change, not an absence', () => {
  /* Removing a size is the commonest real edit — "no smalls after all" — and
     0 is falsy, so it is exactly the value a lazy check loses. */
  const items = [line()];
  const asked = [{ qty: 90, sizes: [
    { size: 'S', n: 0 }, { size: 'M', n: 30 }, { size: 'L', n: 40 }, { size: 'XL', n: 20 }] }];
  const out = describeRequestedEdits(items, asked);
  assert.deepStrictEqual(out[0].sizes, [{ size: 'S', was: 10, now: 0 }]);
});

test('a line with no sizes reports its quantity alone', () => {
  const items = [line({ size_mix: null, qty: 12 })];
  const out = describeRequestedEdits(items, [{ qty: 24, sizes: null }]);
  assert.strictEqual(out.length, 1);
  assert.deepStrictEqual(out[0].sizes, []);
  assert.strictEqual(out[0].wasQty, 12);
  assert.strictEqual(out[0].nowQty, 24);
});

test('only the lines that moved are reported', () => {
  const items = [line(), line({ description: 'Tote', size_mix: null, qty: 50 })];
  const asked = [
    { qty: 100, sizes: [{ size: 'S', n: 10 }, { size: 'M', n: 30 },
                        { size: 'L', n: 40 }, { size: 'XL', n: 20 }] },  // untouched
    { qty: 75, sizes: null },                                            // moved
  ];
  const out = describeRequestedEdits(items, asked);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].index, 1);
  assert.strictEqual(out[0].description, 'Tote');
});

test('a request for a line that no longer exists is ignored', () => {
  /* The shop can delete a line between the customer loading the page and
     submitting it. Reading items[ix] blindly would throw inside the alert path
     and lose the whole request. */
  assert.deepStrictEqual(describeRequestedEdits([], [{ qty: 5, sizes: null }]), []);
  assert.deepStrictEqual(describeRequestedEdits([line()], [null, null]), []);
});

test('a stale request reads as no change once the shop has applied it', () => {
  /* Requests are compared against the quote AS PRICED, so applying the change
     and saving makes the request describe nothing — which is what stops an
     already-handled request from being shown a second time. */
  const applied = [line({ qty: 106, size_mix: { S: 10, M: 36, L: 40, XL: 20 } })];
  const asked = [{ qty: 106, sizes: [
    { size: 'S', n: 10 }, { size: 'M', n: 36 }, { size: 'L', n: 40 }, { size: 'XL', n: 20 }] }];
  assert.deepStrictEqual(describeRequestedEdits(applied, asked), []);
});

/* ── The trust boundary ──────────────────────────────────────────────────── */

const handler = src.slice(src.indexOf("app.post('/q/:code/changes'"));

test('size keys come from the line, never from what was posted', () => {
  /* The endpoint is public. Iterating the posted body instead would let a
     request name any key it liked and write it onto a priced quote. */
  assert.match(handler, /const keys = orderedSizeKeys\(it, catalog\)/,
    'the size list must be derived server-side, not read out of the body');
  assert.match(handler, /for \(const sz of keys\)/,
    'the loop must iterate that derived list and look each name up in the body');
  assert.match(handler, /one\(b\['sz_' \+ ix \+ '_' \+ sz\]\)/,
    'each size is fetched by name from the body, not enumerated out of it');
});

test('quantities are clamped, not trusted', () => {
  assert.match(handler, /Math\.max\(0, Math\.min\(10000, parseInt\(raw, 10\) \|\| 0\)\)/,
    'a posted quantity must be bounded at both ends — it arrives over HTTP');
});

test('the customer edit never writes to items', () => {
  /* items is the quote as priced. requested_items is what was asked for. If the
     handler ever writes the first, a public form can move money. */
  assert.doesNotMatch(handler.slice(0, handler.indexOf('res.redirect')), /SET[\s\S]*?\bitems=/,
    'the changes endpoint must never UPDATE items');
  assert.match(handler, /SET change_request=\$2, requested_items=\$3/,
    'the request lands in requested_items');
});

test('a paid quote cannot be edited', () => {
  assert.match(handler, /Number\(q\.paid_amount \|\| 0\) > 0\) return res\.redirect/,
    'once money has moved the quote is not a proposal any more');
});

test('an accepted quote takes the note but not the numbers', () => {
  assert.match(handler, /const editable = !q\.accepted_at/,
    'accepted means the numbers were agreed; a change goes back through the shop');
});

test('the accepted-quote change request is no longer silently dropped', () => {
  /* The previous handler updated WHERE accepted_at IS NULL, so an accepted
     customer's message matched no row, sent no email and showed no confirmation.
     The form inviting it was rendered for exactly those customers. */
  assert.doesNotMatch(handler, /WHERE code=\$1 AND accepted_at IS NULL/,
    'the UPDATE must not exclude accepted quotes — the form is shown to them');
});

test('an empty submission is not a request', () => {
  assert.match(handler, /if \(!msg && !requested\) return res\.redirect/,
    'nothing typed and nothing moved must not alert the shop');
});

/* ── Approval ────────────────────────────────────────────────────────────── */

test('saving the quote clears the request', () => {
  assert.match(src, /change_request=NULL, requested_items=NULL/,
    'a handled request must not survive the save, or the shop sees it forever');
});

test('the requested numbers are applied by a click, never on load', () => {
  /* Auto-filling would move the total with nobody having agreed to it — the
     whole reason this is an approval flow and not an edit. */
  assert.match(src, /function applyRequested\(\)/);
  assert.match(src, /onclick="applyRequested\(\)"/,
    'applying must be a deliberate click');
  assert.doesNotMatch(src, /applyRequested\(\);\s*\n\s*bind\(\)/,
    'applyRequested must not be called during page setup');
});

test('the customer page says the total is not final', () => {
  /* Sizes are editable there and nothing recalculates, so the page has to say
     so — otherwise the unchanged total reads as a promise. */
  const page = src.slice(src.indexOf("app.get('/q/:code'"));
  assert.match(page, /does not change until/,
    'the customer must be told the total is confirmed by the shop');
});

test('the size inputs actually post with the change form', () => {
  /* The inputs live in the items table and the form is further down the page,
     joined only by form="changeform" pointing at id="changeform". Nothing about
     the page LOOKS wrong if that id is renamed — the inputs simply stop being
     submitted, and every request arrives as an empty one. This is the wiring
     that has no visible failure. */
  const page = src.slice(src.indexOf("app.get('/q/:code'"));
  assert.match(page, /id="changeform"/, 'the change form must carry the id');
  assert.match(page, /<input form="changeform"[^>]*name="sz_\$\{ix\}_/,
    'per-size inputs must be associated with it');
  assert.match(page, /<input form="changeform"[^>]*name="qty_\$\{ix\}"/,
    'the plain-quantity input must be associated with it');
});

test('the posted field names are the ones the handler reads', () => {
  /* Both ends against the same literal. A rename on one side alone is silent:
     the form submits, the handler reads nothing, and the request is recorded as
     "no change". */
  const page = src.slice(src.indexOf("app.get('/q/:code'"));
  assert.match(page, /name="sz_\$\{ix\}_\$\{escEmail\(sz\)\}"/);
  assert.match(handler, /'sz_' \+ ix \+ '_' \+ sz/);
  assert.match(page, /name="qty_\$\{ix\}"/);
  assert.match(handler, /one\(b\['qty' \+ '_' \+ ix\]\)/);
});

test('sizes are only editable while the quote is still an offer', () => {
  const page = src.slice(src.indexOf("app.get('/q/:code'"));
  assert.match(page, /const canEditQty = !accepted && !paid/,
    'an accepted or paid quote shows its numbers, it does not offer them for edit');
});

test('one() is a module-level helper, reachable from every handler that reads a body', () => {
  /* This nearly shipped broken. `one` was a const declared INSIDE the quote-save
     handler, and the customer change-request endpoint called it from a scope
     that could not see it — a ReferenceError on the first real request, in a
     handler whose source reads perfectly. Same shape as the ${n} that took the
     quote builder down: valid code, wrong scope, invisible until it runs.

     Anchored on the declaration at column 0, because that is the property that
     matters — not that the function exists somewhere. */
  assert.match(src, /^const one = \(v\) => \(Array\.isArray\(v\) \? v\[0\] : v\);$/m,
    'one() must be declared at module level');
  assert.doesNotMatch(src, /^\s+const one = \(v\) =>/m,
    'a local re-declaration shadows the shared helper and invites the same bug back');
});

/* ── The two bugs the first version shipped ──────────────────────────────── */

test('every size the garment is sold in is offered, not just the ones ordered', () => {
  /* First version rendered from size_mix, which only ever held sizes with a
     count above zero. A quote of 100 mediums offered exactly one box, so there
     was no way to ask for two 2XLs. */
  const catalog = { products: [{ id: 12, sizes:
    [{ size: 'S' }, { size: 'M' }, { size: 'L' }, { size: 'XL' }, { size: '2XL' }] }] };
  const item = { product_id: 12, size_mix: { M: 100 } };
  assert.deepStrictEqual(orderedSizeKeys(item, catalog), ['S', 'M', 'L', 'XL', '2XL']);
});

test('sizes come back in catalogue order, not in JSONB order', () => {
  /* THE bug. Postgres JSONB normalises object keys by length then bytewise, so
     a mix written {S,M,L,XL} is read back {L,M,S,XL} — which is what the
     customer saw. The catalogue list is an array and keeps its order. */
  const catalog = { products: [{ id: 12, sizes:
    [{ size: 'S' }, { size: 'M' }, { size: 'L' }, { size: 'XL' }] }] };
  const jsonbScrambled = { product_id: 12, size_mix: { L: 40, M: 30, S: 10, XL: 20 } };
  assert.deepStrictEqual(orderedSizeKeys(jsonbScrambled, catalog), ['S', 'M', 'L', 'XL']);
});

test('with no catalogue the line is still sorted into a sane order', () => {
  /* The catalogue is fetched over the network and can come back empty, and a
     product can be retired out from under an old quote. Falling back to raw
     JSONB order would reproduce the bug exactly where it is hardest to notice. */
  const orphan = { product_id: 999, size_mix: { L: 40, M: 30, S: 10, XL: 20, '2XL': 4 } };
  assert.deepStrictEqual(orderedSizeKeys(orphan, { products: [] }),
    ['S', 'M', 'L', 'XL', '2XL']);
});

test('an unknown size sorts last rather than being dropped', () => {
  const odd = { product_id: 999, size_mix: { M: 2, Tall: 1, S: 3 } };
  assert.deepStrictEqual(orderedSizeKeys(odd, { products: [] }), ['S', 'M', 'Tall']);
});

test('adding a size the order never had reads as 0 to n', () => {
  /* The point of showing every size. The quote had no 2XL, so the diff has to
     report it against zero rather than skip it for being absent from the mix. */
  const items = [{ description: 'Gildan 5000', qty: 100, size_mix: { M: 100 } }];
  const asked = [{ qty: 102, sizes: [{ size: 'M', n: 100 }, { size: '2XL', n: 2 }] }];
  const out = describeRequestedEdits(items, asked);
  assert.deepStrictEqual(out[0].sizes, [{ size: '2XL', was: 0, now: 2 }]);
  assert.strictEqual(out[0].nowQty, 102);
});

test('the requested sizes are stored as an array, never as an object', () => {
  /* An object here would be re-ordered by JSONB on the way to disk and the
     shop would read the diff in a shuffled order. */
  assert.match(handler, /sizes\.push\(\{ size: sz, n \}\)/,
    'the request must be built as an ordered array');
  assert.doesNotMatch(handler, /return \{ qty: total, size_mix:/,
    'storing a size object reintroduces the JSONB ordering bug');
});

test('the diff is driven by the requested array, not by the stored object', () => {
  const fn = String(describeRequestedEdits);
  assert.match(fn, /Array\.isArray\(r\.sizes\)/,
    'order comes from the array; the quote mix is only looked up in');
});
