/* What garment a product is, and which decorations that garment can take.
 *
 * The classifier was inlined in tools/canvas-audit.js, which meant every other
 * tool that needed to know "is this a cap?" either guessed or re-typed the list.
 * It lives here so the answer is the same everywhere.
 *
 * Decorations are named by ROLE, not by printing id. The ids in the designer's
 * `printings` table have been renumbered twice already and a hardcoded 8 that
 * silently becomes something else is a wrong price rather than an error, so the
 * caller resolves roles against the live table by title and fails loudly when
 * one is missing.
 */

/* The sizes a product is COSTED and STOCK-CHECKED on.
 *
 * Two tools kept their own copy and they drifted. ssa-add-products learned the
 * hard way that a cap is sized "Adjustable" and a tote "One Size", and that
 * without those a cap reads as having no cost at all and is skipped in silence.
 * ssa-sync never learned it: its copy stayed ['S','M','L','XL'], so every cap,
 * tote and youth garment reported NONE LOCAL — freight the shop cannot pass on
 * — while thousands of them sat in Lockport. That is a buying decision made on
 * a wrong number, from a list that was already correct one file away.
 *
 * Stock is judged on these only: a style with nothing but 4XL in Illinois is
 * not locally stocked for any order a customer will actually place. */
const CORE_SIZES = [
  'S', 'M', 'L', 'XL',
  /* One-size garments — caps, visors, totes, bags. */
  'OSFA', 'One Size', 'OS', 'ADJ', 'Adjustable', 'One Size Fits All', 'OSFM', 'ONE SIZE',
  /* Youth, toddler and infant never carry an adult S/M/L. */
  '2T', '3T', '4T', '5/6', 'XS', 'YXS', 'YS', 'YM', 'YL', '6M', '12M', '18M', '24M',
];

/* What the product NAME says the garment is, in the order the tests must run —
   the specific before the general, so "Youth Heavy Blend Hoodie" is a hoodie
   rather than a youth tee, and "Quarter-Zip Sweatshirt" is not a plain tee. */
const CLASSIFY = [
  ['cap',     /\b(cap|hat|beanie|visor|snapback|trucker)\b/i],
  ['bag',     /\b(tote|bag|backpack|duffel|sackpack|drawstring|pack)\b/i],
  ['vest',    /\bvest\b/i],
  ['jacket',  /\b(jacket|anorak|windbreak|soft ?shell|shell)\b/i],
  ['qzip',    /\b(quarter.?zip|1\/4.?zip|half.?zip)\b/i],
  ['hoodie',  /\b(hoodie|hooded|sweatshirt|crewneck|fleece|pullover)\b/i],
  ['polo',    /\bpolo\b/i],
  ['woven',   /\b(twill|oxford|broadcloth|flannel|button|dress shirt|work shirt|scrub|utility)\b/i],
  ['onesie',  /\b(bodysuit|onesie|infant)\b/i],
  ['kids',    /\b(youth|toddler|baby)\b/i],
  ['tank',    /\btank\b/i],
  ['longslv', /\blong.?sleeve\b/i],
  ['tee',     /\b(tee|t-shirt|shirt)\b/i],
];

/** Garment class from a product name, or 'unknown' when nothing matches. */
function classify(name) {
  return (CLASSIFY.find(([, re]) => re.test(String(name || ''))) || ['unknown'])[0];
}

/* A class is a FAMILY; inside it the cut can still be wrong.
 *
 * The designer has exactly one headwear image, so a cuffed beanie, a visor, a
 * bucket hat and a mesh-back trucker are every one of them drawn as a
 * structured six-panel cap. The catalogue photo is the real garment, so the
 * shop page looks right and only the design canvas lies — which is the half the
 * customer is looking at while they decide.
 *
 * classify() calls all of those 'cap' and is right to: they take the same print
 * area and the same decorations. This is the second question — does the
 * designer own a picture of THIS garment, or is it borrowing one? */
const SUBTYPE = [
  ['beanie',     /\b(beanie|knit cap|cuffed|skully)\b/i],
  ['visor',      /\bvisor\b/i],
  ['bucket',     /\b(bucket|booney)\b/i],
  ['trucker',    /\b(trucker|mesh.?back)\b/i],
  ['dad-hat',    /\bdad hat\b/i],
  ['duffel',     /\bduffel\b/i],
  ['drawstring', /\b(drawstring|sackpack|cinch|sport ?pack)\b/i],
  ['backpack',   /\b(backpack|rucksack)\b/i],
  ['sling',      /\b(sling|pouch|fanny)\b/i],
];

/** The narrower cut, or null when the class is as specific as it gets. */
function subtype(name) {
  const hit = SUBTYPE.find(([, re]) => re.test(String(name || '')));
  return hit ? hit[0] : null;
}

/* What a garment is drawn on when the designer has no art of its own, and what
 * that stand-in actually looks like. Keyed by subtype first, then class.
 *
 * Empty out an entry as soon as real art lands in core/raws/products — the
 * audit reads this to decide what to report, so a stale entry here is the
 * difference between "we know" and "we forgot". */
const STANDIN = {
  beanie:     'a structured six-panel cap',
  visor:      'a structured six-panel cap',
  bucket:     'a structured six-panel cap',
  trucker:    'a solid-back cap, with no mesh',
  'dad-hat':  'a structured cap, where this one is unstructured',
  duffel:     'a flat tote',
  drawstring: 'a flat tote',
  backpack:   'a flat tote',
  sling:      'a flat tote',
  vest:       'a sweatshirt, sleeves and all',
  jacket:     'a sweatshirt',
  qzip:       'a plain sweatshirt, with no placket or zip',
  woven:      'a knit shirt, with no collar stand or button placket',
};

/** What this product is really drawn as, or null when the art is its own. */
function standin(name) {
  const st = subtype(name);
  if (st && STANDIN[st]) return { as: st, looks: STANDIN[st] };
  const cls = classify(name);
  if (STANDIN[cls]) return { as: cls, looks: STANDIN[cls] };
  return null;
}

/* Decoration roles. One per thing the shop actually sells; the titles are the
   designer's own, matched case-insensitively and on a prefix so a later edit to
   the stitch band in a title does not orphan the role. */
const ROLES = {
  dtf:                 { title: 'Printing',                              exact: true },
  screen:              { title: 'Screen Printing',                       exact: true },
  'emb:name-chest':    { title: 'Embroidery — Name/Text (chest)',        exact: true },
  'emb:name-upperback':{ title: 'Embroidery — Name/Text (upper back)',   exact: true },
  'emb:small':         { title: 'Embroidery — Small Logo' },
  'emb:medium':        { title: 'Embroidery — Medium Logo' },
  'emb:large':         { title: 'Embroidery — Large Logo' },
  'emb:xl':            { title: 'Embroidery — Extra Large Logo' },
  'emb:fullback':      { title: 'Embroidery — Full Back' },
};

/* Embroidery placements by what the garment physically has.
   FULL is every placement; a cap has no back panel to hoop and a tote has no
   upper back, so offering those there is offering something the shop refuses. */
const EMB_FULL = ['emb:name-chest', 'emb:small', 'emb:medium', 'emb:large',
  'emb:xl', 'emb:fullback', 'emb:name-upperback'];
const EMB_FRONT_ONLY = ['emb:name-chest', 'emb:small', 'emb:medium'];
const EMB_PANEL = ['emb:name-chest', 'emb:small', 'emb:medium', 'emb:large', 'emb:xl'];

/* Which decorations each garment class can take.
 *
 * These are the same choices tools/ssa-add-products.js already encodes in its
 * TYPES map — polos and premium wovens print DTF and embroider but are not
 * screened, caps embroider only, kids and infant bodysuits print but are not
 * embroidered — with the seven per-colour screen-print rows replaced by the one
 * `color`-type method and the single embroidery row expanded to the placements
 * the garment actually has.
 *
 * Screen printing is absent from polos, vests and jackets on purpose: a screen
 * needs a flat panel and a platen, and a placket, zip or quilted shell has
 * neither. An infant bodysuit is not hooped — the garment is smaller than the
 * hoop and the stitching sits against a baby's skin.
 */
const DECORATIONS = {
  tee:     ['dtf', 'screen', ...EMB_FULL],
  longslv: ['dtf', 'screen', ...EMB_FULL],
  tank:    ['dtf', 'screen', ...EMB_FULL],
  hoodie:  ['dtf', 'screen', ...EMB_FULL],
  qzip:    ['dtf', 'screen', ...EMB_FULL],
  bag:     ['dtf', 'screen', ...EMB_PANEL],
  woven:   ['dtf', ...EMB_FULL],
  polo:    ['dtf', ...EMB_FULL],
  vest:    [...EMB_FULL],
  jacket:  ['dtf', ...EMB_FULL],
  cap:     [...EMB_FRONT_ONLY],
  kids:    ['dtf', 'screen'],
  onesie:  ['dtf', 'screen'],
};

module.exports = { CORE_SIZES, CLASSIFY, classify, SUBTYPE, subtype, STANDIN, standin, ROLES, DECORATIONS, EMB_FULL, EMB_FRONT_ONLY, EMB_PANEL };
