/* Screen printing must never quote at $0 decoration.
 *
 * WHAT WENT WRONG
 * ---------------
 * The seven per-colour screen-print methods were consolidated into ONE
 * `color`-type method, because the colour count is something only the finished
 * design knows and seven methods force the customer to guess it up front. A
 * `color` band is one column per ink count — {"1-color":"8.45", ...} — and has
 * no `price` key at all.
 *
 * jt-catalog.php still asked every band for `price`, got null, and skipped it.
 * So the consolidated method published `positions: {}`: no bands, no tiers, no
 * error. The quote form dropped it as "not priced yet", and anything that
 * reached the pricing engine with it charged for the blank and printed for
 * free. The seven legacy rows kept working, so "Screen Printing — 2 Colors"
 * quoted correctly while plain "Screen Printing" did not — which is why this
 * read as a missing method rather than as a mispriced one.
 *
 * WHAT THESE PIN
 * --------------
 * Both halves, joined. The PHP publisher is run for real and its JSON is fed
 * straight into the real pricing engine, so a change to either side that stops
 * them agreeing fails here — a test that hand-wrote the middle shape would have
 * passed happily throughout the entire bug.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
const AUTH = path.join(ROOT, 'Lumise', 'Lumise-Product-Designer-PHP-ver2.0', 'lumise', 'jt-auth.php');

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

/* The real shared engine, run the way server.js and the browser both run it. */
const box = {};
vm.runInNewContext(lift('quotePricingSource') + '\nthis.text = quotePricingSource();', box);
const engine = {};
vm.runInNewContext(box.text +
  '\nthis.priceLine = priceLine; this.tierAt = tierAt; this.colourCount = colourCount;', engine);
const { priceLine, tierAt, colourCount } = engine;

/** Run the REAL jt_printing_positions() over a `calculate` blob. */
function publish(calc) {
  const out = execFileSync('php', ['-r',
    'require_once(getenv("JT_AUTH"));' +
    'list($p,$c,$u)=jt_printing_positions(json_decode(stream_get_contents(STDIN),true));' +
    'echo json_encode(array("positions"=>$p,"colour_options"=>$c,"unsupported_type"=>$u));'],
    { input: JSON.stringify(calc), encoding: 'utf8', env: { ...process.env, JT_AUTH: AUTH } });
  return JSON.parse(out);
}

/* Method #22 exactly as the live database holds it: the seven per-colour tables
   pivoted into columns, bands as CEILINGS, `full-color` backstopping the rest. */
const BANDS = [99, 249, 499, 999, 2499, 7000];
const PER_COLOUR = {
  1: [8.45, 6.30, 4.15, 3.45, 2.50, 1.95],
  2: [10.90, 8.05, 5.30, 4.35, 3.15, 2.45],
  3: [13.50, 10.00, 6.70, 5.60, 4.15, 3.40],
  4: [16.05, 11.95, 8.05, 6.85, 5.15, 4.30],
  5: [18.65, 13.95, 9.45, 8.10, 6.20, 5.25],
  6: [21.20, 15.90, 10.85, 9.35, 7.20, 6.15],
  7: [23.75, 17.85, 12.25, 10.55, 8.20, 7.10],
};
const SCREEN_CALC = {
  multi: false, type: 'color', show_detail: '1',
  values: {
    front: Object.fromEntries(BANDS.map((band, i) => [String(band),
      Object.assign(
        Object.fromEntries(Object.entries(PER_COLOUR).map(([c, p]) => [c + '-color', p[i].toFixed(2)])),
        { 'full-color': PER_COLOUR[7][i].toFixed(2) })])),
  },
};

const published = publish(SCREEN_CALC);
const SCREEN = {
  id: 22, title: 'Screen Printing', type: 'color', min_order_qty: 50,
  positions: published.positions, colour_options: published.colour_options,
};
const GILDAN = { id: 12, price: 5.64, sizes: [] };
const TIERS = [{ min: 100, pct: 3 }];

/* ── The publisher ──────────────────────────────────────────────────────── */

test('a colour table publishes bands — the whole bug was that it published none', () => {
  assert.ok(Object.keys(published.positions).length, 'positions is empty');
  assert.strictEqual(published.positions.front.length, BANDS.length);
  assert.strictEqual(published.unsupported_type, '');
});

test('every published band carries its colour columns and a real fallback price', () => {
  published.positions.front.forEach((band, i) => {
    assert.strictEqual(band.min_qty, BANDS[i]);
    /* `price` is the ONE-COLOUR rate, not a placeholder: a consumer that knows
       nothing about colours must charge the cheapest real column, never zero. */
    assert.strictEqual(band.price, PER_COLOUR[1][i], 'band ' + BANDS[i] + ' base price');
    assert.notStrictEqual(band.price, 0);
    for (const c of [1, 3, 7]) {
      assert.strictEqual(band.colors[c + '-color'], PER_COLOUR[c][i]);
    }
    assert.strictEqual(band.colors['full-color'], PER_COLOUR[7][i]);
  });
});

test('the picker is offered exactly the columns the shop has priced', () => {
  assert.deepStrictEqual(published.colour_options, [1, 2, 3, 4, 5, 6, 7]);
});

test('a fixed-type method publishes exactly what it always did', () => {
  const dtf = publish({ multi: true, type: 'fixed',
    values: { id: { 11: { price: '28.15' }, 24: { price: '22.55' } },
              mr8a5dlx: { 11: { price: '6.70' }, 24: { price: '6.50' } } } });
  assert.deepStrictEqual(dtf.positions, {
    id:       [{ min_qty: 11, price: 28.15 }, { min_qty: 24, price: 22.55 }],
    mr8a5dlx: [{ min_qty: 11, price: 6.70 },  { min_qty: 24, price: 6.50 }],
  });
  assert.deepStrictEqual(dtf.colour_options, []);
  assert.strictEqual(dtf.unsupported_type, '');
});

test('a band shape the feed cannot read is NAMED, not silently dropped', () => {
  /* This is the guardrail the original bug had no version of. A `size`-type
     table has no `price` key either, so it fails the same way — but now it
     says so, and the quote page can print which method and why. */
  const sized = publish({ type: 'size', values: { front: { 1: { A3: '10.00', A4: '6.00' } } } });
  /* An empty PHP array json_encodes as [], not {} — which every consumer here
     reads through Object.keys(), so both spellings mean "no bands". */
  assert.strictEqual(Object.keys(sized.positions).length, 0);
  assert.strictEqual(sized.unsupported_type, 'size');
});

/* ── The engine, reading what the publisher produced ────────────────────── */

test('the colour count picks the column, at every band', () => {
  for (const [c, prices] of Object.entries(PER_COLOUR)) {
    BANDS.forEach((band, i) => {
      assert.strictEqual(tierAt(SCREEN.positions, band, 'front', Number(c)), prices[i],
        c + ' colours at ' + band);
    });
  }
});

test('a screen-print line is never quoted with free decoration', () => {
  for (const c of [1, 2, 3, 4, 5, 6, 7]) {
    for (const qty of [50, 99, 100, 250, 500, 1000, 2500, 9000]) {
      const r = priceLine({ product: GILDAN, method: SCREEN, qty, colours: c,
                            stage: 'front', blankTiers: TIERS });
      assert.ok(r.decoration > 0, c + ' colours x ' + qty + ' priced the printing at $0');
      assert.ok(r.lineTotal > r.blank * qty, c + ' colours x ' + qty + ' charged the blank only');
    }
  }
});

test('the arithmetic, pinned', () => {
  // 100 pieces sits in the 249 band (keys are CEILINGS, not floors).
  assert.strictEqual(priceLine({ product: GILDAN, method: SCREEN, qty: 100, colours: 1,
    stage: 'front', blankTiers: TIERS }).decoration, 6.30);
  assert.strictEqual(priceLine({ product: GILDAN, method: SCREEN, qty: 100, colours: 3,
    stage: 'front', blankTiers: TIERS }).decoration, 10.00);
  // 99 is the top of its own band, so one more piece is CHEAPER, not dearer.
  assert.strictEqual(priceLine({ product: GILDAN, method: SCREEN, qty: 99, colours: 3,
    stage: 'front', blankTiers: TIERS }).decoration, 13.50);
});

test('an over-range colour count falls back to full-color, not to nothing', () => {
  // The press runs seven; the backstop is what stops an 8-colour design free.
  assert.strictEqual(tierAt(SCREEN.positions, 100, 'front', 8), PER_COLOUR[7][1]);
  assert.strictEqual(tierAt(SCREEN.positions, 100, 'front', 99), PER_COLOUR[7][1]);
});

test('a missing, junk or absent colour count prices at one colour, never zero', () => {
  for (const c of [undefined, null, '', 'abc', 0, -3]) {
    assert.strictEqual(tierAt(SCREEN.positions, 100, 'front', c), PER_COLOUR[1][1],
      'colours=' + JSON.stringify(c));
  }
});

test('front + back doubles the chosen colour column, not the one-colour one', () => {
  const r = priceLine({ product: GILDAN, method: SCREEN, qty: 100, colours: 4,
                        stage: 'both', blankTiers: TIERS });
  assert.strictEqual(r.decoration, PER_COLOUR[4][1] * 2);
});

test('the 50-piece minimum still applies on top of the colour column', () => {
  /* Bands are ceilings, so 25 pieces would otherwise price at the 99 rate while
     the shop pays a 50-piece contract minimum. Enforcement scales the rate so
     unit x qty still holds; it must scale the COLOUR the job really is. */
  const r = priceLine({ product: GILDAN, method: SCREEN, qty: 25, colours: 3,
                        stage: 'front', blankTiers: TIERS });
  assert.strictEqual(r.decoration, Math.round(PER_COLOUR[3][0] * (50 / 25) * 100) / 100);
});

/* ── The two data generations, one rule ─────────────────────────────────── */

test('a legacy per-colour method still reads its count from its own title', () => {
  for (const [title, want] of [
    ['Screen Printing — 1 Color', 1], ['Screen Printing — 2 Colors', 2],
    ['Screen Printing — 7 Colors', 7], ['Screen Printing — 3 Colours', 3],
  ]) {
    assert.strictEqual(colourCount({ title, type: 'fixed' }), want, title);
  }
});

test('a legacy method ignores a posted colour count — it cannot be talked down', () => {
  const seven = { id: 21, title: 'Screen Printing — 7 Colors', type: 'fixed' };
  assert.strictEqual(colourCount(seven, '1'), 7);
  assert.strictEqual(colourCount(seven, '0'), 7);
});

test('a method with no colour in its title is one colour, not zero', () => {
  assert.strictEqual(colourCount({ title: 'DTF Printing', type: 'fixed' }), 1);
  assert.strictEqual(colourCount(null), 1);
});

test('a colour-type method takes the posted count, and defaults to one', () => {
  assert.strictEqual(colourCount(SCREEN, '5'), 5);
  assert.strictEqual(colourCount(SCREEN, ''), 1);
  assert.strictEqual(colourCount(SCREEN, 'seven'), 1);
});

/* ── The wiring, so neither surface can drift back to its own copy ──────── */

test('neither the form nor the save path re-derives the colour count itself', () => {
  const engineCopy = box.text.match(/Colou\?r/g) || [];
  assert.strictEqual(engineCopy.length, 1,
    'the colour-count rule must exist exactly once, inside quotePricingSource()');
  const outside = src.replace(lift('quotePricingSource'), '');
  assert.ok(!/Colou\?r/.test(outside),
    'found a second colour-count derivation outside the shared engine — the browser ' +
    'preview and the save path must run the same characters or a line can be ' +
    'quoted at one colour and charged at another');
});

test('the shared source survives being a template literal', () => {
  /* `\d` inside a template literal is eaten to a bare `d`, so the regex has to
     be written `\\d` in server.js. It was not, once, and every legacy method
     silently priced as a single colour. */
  assert.ok(/\/\(\\d\+\)\\s\*Colou\?r\/i/.test(box.text),
    'the emitted colour regex lost its backslashes');
});

/* ── The form, which no unit test can otherwise see ─────────────────────── */

/** The quote form's browser <script>, as the browser actually receives it. */
function emittedFormScript() {
  const start = src.indexOf("app.get(['/quote/new'");
  assert.notStrictEqual(start, -1, 'quote form route not found');
  const seg = src.slice(start, src.indexOf('\napp.', start + 10));
  const si = seg.indexOf('<script>'), se = seg.lastIndexOf('</script>');
  assert.ok(si > -1 && se > si, 'no <script> in the quote form');
  const js = seg.slice(si + 8, se);
  /* Interpolations become server-side values; replace each with a literal so
     what is left is the code the browser parses. */
  let out = '', i = 0;
  while (i < js.length) {
    if (js[i] === '$' && js[i + 1] === '{') {
      let depth = 1, k = i + 2;
      while (k < js.length && depth > 0) {
        if (js[k] === '{') depth++; else if (js[k] === '}') depth--;
        k++;
      }
      out += '0'; i = k;
    } else { out += js[i]; i++; }
  }
  // One level of template-literal escaping is consumed before the browser sees it.
  return out.replace(/\\`/g, '`').replace(/\\\\/g, '\\');
}

test('the form script the browser receives actually parses', () => {
  /* node --check validates server.js, but this script lives inside a template
     literal, so a broken line there is a string as far as Node is concerned and
     ships silently — the form then loads with no pricing at all. */
  assert.doesNotThrow(() => new Function(emittedFormScript()));
});

test('the colour picker posts under the name the save path reads', () => {
  /* A mismatch here is invisible: the picker works, the preview prices
     correctly, and the save path reads an absent field and quotes every screen
     job at one colour. Both ends are checked against the same literal. */
  const form = src.slice(src.indexOf("app.get(['/quote/new'"));
  assert.ok(/name="colors\$\{n\}"[^>]*class="cols"/.test(form.replace(/\s+/g, ' ')),
    'the line template must render <select name="colors${n}" class="cols">');
  assert.ok(/one\(b\['colors' \+ i\]\)/.test(src),
    "the save path must read b['colors' + i]");
});

test('the picker only ever offers columns the catalogue published', () => {
  /* Hardcoding 1..7 here would survive a reprice to six columns and quote a
     column that no longer exists — which prices at the full-colour backstop. */
  const script = emittedFormScript();
  assert.ok(/meth\.colour_options/.test(script),
    'options must come from the method, not from a constant in the form');
});
